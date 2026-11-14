use crate::{error::{AppError, Result}, models::{ApiJson, Ctx, IdempotencyKey, Pagination, Product, clean}, services::{audit, idempotency, inventory, money}};
use actix_web::{web, HttpResponse, Scope};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/stock").route("/movements", web::get().to(movements))
        .route("/receipts", web::post().to(receipt)).route("/damage", web::post().to(damage))
}
#[derive(FromRow, serde::Serialize)]
struct Movement {
    id: Uuid, product_id: Uuid, product_name: String, kind: String, quantity_delta: i32,
    unit_cost_milliemes: i64, reason: String, supplier: String, invoice_ref: String,
    reference_id: Option<Uuid>, created_at: DateTime<Utc>,
}
#[derive(Deserialize, Validate)]
struct MovementQuery { #[serde(flatten)] #[validate(nested)] pagination: Pagination, #[serde(default)] kind: Option<String> }
async fn movements(ctx: Ctx, query: web::Query<MovementQuery>) -> Result<HttpResponse> {
    ctx.read("stock")?; query.validate().map_err(|_| AppError::Validation("Invalid query".into()))?;
    let q = query.into_inner();
    if let Some(kind) = &q.kind { if !matches!(kind.as_str(), "opening"|"receipt"|"sale"|"damage") { return Err(AppError::Validation("Invalid movement kind".into())); } }
    let mut tx = ctx.tx().await?;
    let total = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE m.organization_id=$1 AND m.store_id=$2 AND ($3::text IS NULL OR m.kind=$3) AND ($4='' OR p.name ILIKE $5 ESCAPE '\\')")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(&q.kind).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).fetch_one(&mut *tx).await?;
    let data = sqlx::query_as::<_, Movement>(r#"SELECT m.id,m.product_id,p.name product_name,m.kind,m.quantity_delta,m.unit_cost_milliemes,m.reason,m.supplier,m.invoice_ref,m.reference_id,m.created_at
        FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE m.organization_id=$1 AND m.store_id=$2 AND ($3::text IS NULL OR m.kind=$3) AND ($4='' OR p.name ILIKE $5 ESCAPE '\') ORDER BY m.created_at DESC,m.id LIMIT $6 OFFSET $7"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(&q.kind).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).bind(q.pagination.page_size).bind(q.pagination.offset()).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(json!({"data":data,"total":total,"page":q.pagination.page,"page_size":q.pagination.page_size})))
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct ReceiptInput {
    product_id: Uuid,
    #[validate(range(min = 1, max = 1000000))] quantity: i32,
    #[validate(range(min = 0, max = 1000000000000))] unit_cost_milliemes: i64,
    #[serde(default)] #[validate(length(max = 160))] supplier: String,
    #[serde(default)] #[validate(length(max = 160))] invoice_ref: String,
}
async fn receipt(ctx: Ctx, key: IdempotencyKey, body: ApiJson<ReceiptInput>) -> Result<HttpResponse> {
    ctx.write("stock")?; let body = body.0; let mut tx = ctx.tx().await?;
    let (previous, hash) = idempotency::reserve(&mut tx,&ctx,key.0,&body).await?;
    if let Some(response) = previous { return Ok(HttpResponse::Ok().json(response)); }
    let mut product = inventory::lock_product(&mut tx,&ctx,body.product_id).await?;
    if !product.active { return Err(AppError::NotFound); }
    product.stock = product.stock.checked_add(body.quantity).filter(|v| *v <= 1_000_000_000).ok_or_else(|| AppError::Validation("Stock limit exceeded".into()))?;
    product.cost_milliemes = money::weighted_cost(product.stock - body.quantity, product.cost_milliemes, body.quantity, body.unit_cost_milliemes)?;
    sqlx::query("UPDATE products SET stock=$4,cost_milliemes=$5,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(product.id).bind(product.stock).bind(product.cost_milliemes).execute(&mut *tx).await?;
    inventory::movement(&mut tx,&ctx,product.id,"receipt",body.quantity,body.unit_cost_milliemes,None,"",&clean(&body.supplier,160)?,&clean(&body.invoice_ref,160)?).await?;
    audit::record(&mut tx,&ctx,"stock.received","product",Some(product.id),json!({"quantity":body.quantity})).await?;
    let response = json!(product); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?;
    Ok(HttpResponse::Created().json(response))
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct DamageInput {
    product_id: Uuid,
    #[validate(range(min = 1, max = 1000000))] quantity: i32,
    #[validate(custom(function = "validate_reason"))] reason: String,
    #[serde(default)] #[validate(length(max = 80))] note: String,
}
fn validate_reason(value: &str) -> std::result::Result<(), validator::ValidationError> {
    if matches!(value,"damaged"|"stolen"|"lost"|"expired"|"other") { Ok(()) } else { Err(validator::ValidationError::new("reason")) }
}
async fn damage(ctx: Ctx, key: IdempotencyKey, body: ApiJson<DamageInput>) -> Result<HttpResponse> {
    ctx.write("stock")?; let body = body.0; let mut tx = ctx.tx().await?;
    let (previous, hash) = idempotency::reserve(&mut tx,&ctx,key.0,&body).await?;
    if let Some(response) = previous { return Ok(HttpResponse::Ok().json(response)); }
    let mut product = inventory::lock_product(&mut tx,&ctx,body.product_id).await?;
    if !product.active { return Err(AppError::NotFound); }
    product.stock = product.stock.checked_sub(body.quantity).ok_or(AppError::InsufficientStock)?;
    if product.stock < 0 { return Err(AppError::InsufficientStock); }
    sqlx::query("UPDATE products SET stock=$4,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(product.id).bind(product.stock).execute(&mut *tx).await?;
    inventory::movement(&mut tx,&ctx,product.id,"damage",-body.quantity,product.cost_milliemes,None,&format!("{}:{}",body.reason,clean(&body.note,100)?),"","").await?;
    audit::record(&mut tx,&ctx,"stock.damage","product",Some(product.id),json!({"quantity":body.quantity,"reason":body.reason})).await?;
    let response = json!(product); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?;
    Ok(HttpResponse::Created().json(response))
}
