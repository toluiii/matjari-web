use crate::{error::{AppError, Result}, models::{ApiJson, Ctx, IdempotencyKey, Order, Pagination, clean, required}, services::{audit, idempotency, inventory::{self, SaleLine}, money}};
use actix_web::{web, HttpResponse, Scope};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use std::collections::HashSet;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/orders").route("", web::get().to(list).post(create))
        .route("/{id}", web::get().to(get)).route("/{id}/prices", web::put().to(prices))
        .route("/{id}/transition", web::post().to(transition))
}
#[derive(Deserialize, Validate)]
struct OrderQuery { #[serde(flatten)] #[validate(nested)] pagination: Pagination, status: Option<String> }
fn valid_status(value: &str) -> bool { matches!(value,"pending"|"confirmed"|"preparing"|"ready"|"delivered"|"cancelled") }
async fn list(ctx: Ctx, query: web::Query<OrderQuery>) -> Result<HttpResponse> {
    ctx.read("orders")?; query.validate().map_err(|_| AppError::Validation("Invalid query".into()))?;
    let q = query.into_inner();
    if let Some(status) = &q.status { if !valid_status(status) { return Err(AppError::Validation("Invalid status".into())); } }
    let mut tx = ctx.tx().await?;
    let total = sqlx::query_scalar::<_, i64>(r#"SELECT count(*) FROM orders WHERE organization_id=$1 AND store_id=$2 AND ($3::text IS NULL OR status=$3) AND ($4='' OR customer_name ILIKE $5 ESCAPE '\' OR customer_phone ILIKE $5 ESCAPE '\' OR number::text=$4)"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(&q.status).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).fetch_one(&mut *tx).await?;
    let data = sqlx::query_as::<_, Order>(r#"SELECT * FROM orders WHERE organization_id=$1 AND store_id=$2 AND ($3::text IS NULL OR status=$3) AND ($4='' OR customer_name ILIKE $5 ESCAPE '\' OR customer_phone ILIKE $5 ESCAPE '\' OR number::text=$4) ORDER BY created_at DESC,id LIMIT $6 OFFSET $7"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(&q.status).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).bind(q.pagination.page_size).bind(q.pagination.offset()).fetch_all(&mut *tx).await?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"data":data,"total":total,"page":q.pagination.page,"page_size":q.pagination.page_size})))
}
#[derive(FromRow, Serialize)]
struct ItemView { id: Uuid, product_id: Uuid, product_name: String, stock: i32, quantity: i32, unit_price_milliemes: Option<i64> }
async fn get(ctx: Ctx, id: web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.read("orders")?; let mut tx = ctx.tx().await?;
    let order = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE organization_id=$1 AND store_id=$2 AND id=$3")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id.into_inner()).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    let items = sqlx::query_as::<_, ItemView>("SELECT i.id,i.product_id,p.name product_name,p.stock,i.quantity,i.unit_price_milliemes FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.store_id=$2 AND i.order_id=$3 ORDER BY p.name")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).fetch_all(&mut *tx).await?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"order":order,"items":items})))
}
#[derive(Debug, Deserialize, Serialize, Validate)]
#[serde(deny_unknown_fields)]
struct OrderLine {
    product_id: Uuid,
    #[validate(range(min = 1, max = 100000))] quantity: i32,
    #[validate(range(min = 1, max = 1000000000000))] unit_price_milliemes: Option<i64>,
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    #[validate(length(min = 1, max = 160))] customer_name: String,
    #[serde(default)] #[validate(length(max = 32))] customer_phone: String,
    #[serde(default)] #[validate(length(max = 500))] address: String,
    #[serde(default)] #[validate(length(max = 2000))] note: String,
    #[serde(default)] #[validate(range(min = 0, max = 1000000000000))] delivery_fee_milliemes: i64,
    #[validate(length(min = 1, max = 100), nested)] items: Vec<OrderLine>,
}
async fn create(ctx: Ctx, key: IdempotencyKey, body: ApiJson<CreateInput>) -> Result<HttpResponse> {
    ctx.write("orders")?; let body = body.0; let mut tx = ctx.tx().await?;
    let (previous, hash) = idempotency::reserve(&mut tx,&ctx,key.0,&body).await?;
    if let Some(response) = previous { return Ok(HttpResponse::Ok().json(response)); }
    let mut seen = HashSet::new(); let mut ids = Vec::new(); let mut totals = Vec::new();
    for item in &body.items {
        if !seen.insert(item.product_id) { return Err(AppError::Validation("Duplicate product".into())); }
        ids.push(item.product_id);
        if let Some(price) = item.unit_price_milliemes { totals.push(money::line_total(price,item.quantity)?); }
    }
    let count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM products WHERE organization_id=$1 AND store_id=$2 AND id=ANY($3) AND active")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(&ids).fetch_one(&mut *tx).await?;
    if count != ids.len() as i64 { return Err(AppError::NotFound); }
    let number = inventory::next_number(&mut tx,&ctx,"order").await?;
    let order = sqlx::query_as::<_, Order>(r#"INSERT INTO orders(organization_id,store_id,number,customer_name,customer_phone,address,note,delivery_fee_milliemes,subtotal_milliemes,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(number).bind(required(&body.customer_name,160)?)
        .bind(clean(&body.customer_phone,32)?).bind(clean(&body.address,500)?).bind(clean(&body.note,2000)?).bind(body.delivery_fee_milliemes).bind(money::sum(totals)?).bind(ctx.session.user_id).fetch_one(&mut *tx).await?;
    for item in &body.items {
        sqlx::query("INSERT INTO order_items(organization_id,store_id,order_id,product_id,quantity,unit_price_milliemes) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).bind(item.product_id).bind(item.quantity).bind(item.unit_price_milliemes).execute(&mut *tx).await?;
    }
    audit::record(&mut tx,&ctx,"order.created","order",Some(order.id),json!({})).await?;
    let response = json!(order); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?;
    Ok(HttpResponse::Created().json(response))
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct PriceLine { product_id: Uuid, #[validate(range(min = 1, max = 1000000000000))] unit_price_milliemes: i64 }
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct PricesInput { #[validate(length(min = 1, max = 100), nested)] items: Vec<PriceLine> }
async fn locked_order(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, ctx: &Ctx, id: Uuid) -> Result<Order> {
    sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE organization_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).fetch_optional(&mut **tx).await?.ok_or(AppError::NotFound)
}
async fn prices(ctx: Ctx, id: web::Path<Uuid>, body: ApiJson<PricesInput>) -> Result<HttpResponse> {
    ctx.write("orders")?; let mut tx = ctx.tx().await?; let order = locked_order(&mut tx,&ctx,id.into_inner()).await?;
    if matches!(order.status.as_str(),"delivered"|"cancelled") { return Err(AppError::InvalidTransition); }
    let mut seen = HashSet::new();
    for item in &body.0.items {
        if !seen.insert(item.product_id) { return Err(AppError::Validation("Duplicate product".into())); }
        let changed = sqlx::query("UPDATE order_items SET unit_price_milliemes=$4 WHERE organization_id=$1 AND store_id=$2 AND order_id=$3 AND product_id=$5")
            .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).bind(item.unit_price_milliemes).bind(item.product_id).execute(&mut *tx).await?.rows_affected();
        if changed != 1 { return Err(AppError::Validation("Product is not in this order".into())); }
    }
    let subtotal = sqlx::query_scalar::<_, String>("SELECT coalesce(sum(quantity::bigint*unit_price_milliemes),0)::text FROM order_items WHERE organization_id=$1 AND store_id=$2 AND order_id=$3 AND unit_price_milliemes IS NOT NULL")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).fetch_one(&mut *tx).await?;
    let order = sqlx::query_as::<_, Order>("UPDATE orders SET subtotal_milliemes=$4,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 RETURNING *")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).bind(money::parse_aggregate(Some(subtotal))?).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"order.prices_updated","order",Some(order.id),json!({})).await?; tx.commit().await?;
    Ok(HttpResponse::Ok().json(order))
}
#[derive(Deserialize, Serialize, Validate)]
#[serde(deny_unknown_fields)]
struct TransitionInput { status: String, payment_method: Option<String> }
async fn transition(ctx: Ctx, id: web::Path<Uuid>, key: IdempotencyKey, body: ApiJson<TransitionInput>) -> Result<HttpResponse> {
    ctx.write("orders")?; let body = body.0; if !valid_status(&body.status) { return Err(AppError::Validation("Invalid status".into())); }
    let mut tx = ctx.tx().await?;
    let (previous, hash) = idempotency::reserve(&mut tx,&ctx,key.0,&json!({"id":id.as_ref(),"body":body})).await?;
    if let Some(response) = previous { return Ok(HttpResponse::Ok().json(response)); }
    let order = locked_order(&mut tx,&ctx,id.into_inner()).await?;
    let allowed = match order.status.as_str() {
        "pending" => matches!(body.status.as_str(),"confirmed"|"cancelled"),
        "confirmed" => matches!(body.status.as_str(),"preparing"|"cancelled"),
        "preparing" => matches!(body.status.as_str(),"ready"|"cancelled"),
        "ready" => matches!(body.status.as_str(),"delivered"|"cancelled"),
        _ => false,
    };
    if !allowed { return Err(AppError::InvalidTransition); }
    let mut sale_id = None; let mut subtotal = order.subtotal_milliemes;
    if body.status == "delivered" {
        let items = sqlx::query_as::<_, ItemView>("SELECT i.id,i.product_id,p.name product_name,p.stock,i.quantity,i.unit_price_milliemes FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.store_id=$2 AND i.order_id=$3")
            .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).fetch_all(&mut *tx).await?;
        let mut lines = Vec::new();
        for item in items { lines.push(SaleLine { product_id:item.product_id, quantity:item.quantity, unit_price_milliemes:item.unit_price_milliemes.ok_or_else(|| AppError::Validation("Set every item price before delivery".into()))? }); }
        let payment = body.payment_method.as_deref().unwrap_or("cash");
        let receipt = inventory::create_sale(&mut tx,&ctx,&lines,payment,&order.customer_name,order.delivery_fee_milliemes,Some(order.id)).await?;
        sale_id = Some(receipt.sale.id); subtotal = receipt.sale.subtotal_milliemes;
    }
    let updated = sqlx::query_as::<_, Order>("UPDATE orders SET status=$4,sale_id=$5,subtotal_milliemes=$6,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 RETURNING *")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(order.id).bind(&body.status).bind(sale_id).bind(subtotal).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"order.transitioned","order",Some(order.id),json!({"from":order.status,"to":body.status})).await?;
    let response = json!(updated); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?;
    Ok(HttpResponse::Ok().json(response))
}
