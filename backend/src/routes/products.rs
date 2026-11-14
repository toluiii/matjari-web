use crate::{error::{AppError, Result}, models::{ApiJson, Ctx, IdempotencyKey, Pagination, Product, clean, required}, services::{audit, idempotency, inventory}};
use actix_web::{web, HttpResponse, Scope};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/products").route("", web::get().to(list).post(create))
        .route("/barcode/{barcode}", web::get().to(barcode))
        .route("/{id}", web::get().to(get).patch(update).delete(archive))
}
#[derive(Deserialize, Validate)]
struct ProductQuery {
    #[serde(flatten)] #[validate(nested)] pagination: Pagination,
    #[serde(default)] low_stock: bool,
}
async fn list(ctx: Ctx, query: web::Query<ProductQuery>) -> Result<HttpResponse> {
    ctx.read("products")?; query.validate().map_err(|_| AppError::Validation("Invalid pagination".into()))?;
    let q = query.into_inner(); let p = q.pagination;
    let mut tx = ctx.tx().await?;
    let search = p.search.trim();
    let total = sqlx::query_scalar::<_, i64>(r#"SELECT count(*) FROM products WHERE organization_id=$1 AND store_id=$2 AND active AND ($3='' OR name ILIKE $4 ESCAPE '\' OR coalesce(barcode,'')=$3) AND (NOT $5 OR stock<=min_stock)"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(search).bind(p.pattern()).bind(q.low_stock).fetch_one(&mut *tx).await?;
    let data = sqlx::query_as::<_, Product>(r#"SELECT * FROM products WHERE organization_id=$1 AND store_id=$2 AND active AND ($3='' OR name ILIKE $4 ESCAPE '\' OR coalesce(barcode,'')=$3) AND (NOT $5 OR stock<=min_stock) ORDER BY created_at DESC,id LIMIT $6 OFFSET $7"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(search).bind(p.pattern()).bind(q.low_stock).bind(p.page_size).bind(p.offset()).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(json!({"data":data,"total":total,"page":p.page,"page_size":p.page_size})))
}
async fn get(ctx: Ctx, id: web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.read("products")?; let mut tx = ctx.tx().await?;
    let product = sqlx::query_as::<_, Product>("SELECT * FROM products WHERE organization_id=$1 AND store_id=$2 AND id=$3 AND active")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id.into_inner()).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(product))
}
async fn barcode(ctx: Ctx, code: web::Path<String>) -> Result<HttpResponse> {
    ctx.read("products")?; let code = required(&code, 64)?;
    let mut tx = ctx.tx().await?;
    let product = sqlx::query_as::<_, Product>("SELECT * FROM products WHERE organization_id=$1 AND store_id=$2 AND barcode=$3 AND active")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(code).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(product))
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    #[validate(length(min = 1, max = 200))] name: String,
    #[validate(length(max = 64))] barcode: Option<String>,
    #[serde(default)] #[validate(length(max = 100))] category: String,
    #[validate(range(min = 0, max = 1000000000000))] cost_milliemes: i64,
    #[validate(range(min = 0, max = 1000000000))] initial_quantity: i32,
    #[serde(default = "default_min")] #[validate(range(min = 0, max = 1000000000))] min_stock: i32,
}
fn default_min() -> i32 { 5 }
async fn create(ctx: Ctx, key: IdempotencyKey, body: ApiJson<CreateInput>) -> Result<HttpResponse> {
    ctx.write("products")?; let body = body.0;
    let mut tx = ctx.tx().await?;
    let (previous, hash) = idempotency::reserve(&mut tx, &ctx, key.0, &body).await?;
    if let Some(response) = previous { return Ok(HttpResponse::Ok().json(response)); }
    sqlx::query("SELECT id FROM stores WHERE organization_id=$1 AND id=$2 FOR UPDATE").bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_one(&mut *tx).await?;
    let count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM products WHERE organization_id=$1 AND store_id=$2 AND active").bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_one(&mut *tx).await?;
    if ctx.session.max_products >= 0 && count >= i64::from(ctx.session.max_products) { return Err(AppError::PlanRequired); }
    let name = required(&body.name, 200)?;
    let barcode = body.barcode.as_deref().map(|v| clean(v,64)).transpose()?.filter(|v| !v.is_empty());
    let product = sqlx::query_as::<_, Product>(r#"INSERT INTO products(organization_id,store_id,name,barcode,category,cost_milliemes,stock,min_stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(name).bind(barcode).bind(clean(&body.category,100)?)
        .bind(body.cost_milliemes).bind(body.initial_quantity).bind(body.min_stock).fetch_one(&mut *tx).await?;
    if body.initial_quantity > 0 { inventory::movement(&mut tx,&ctx,product.id,"opening",body.initial_quantity,body.cost_milliemes,None,"opening","","").await?; }
    audit::record(&mut tx,&ctx,"product.created","product",Some(product.id),json!({})).await?;
    let response = json!(product); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?;
    Ok(HttpResponse::Created().json(response))
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    #[validate(length(min = 1, max = 200))] name: String,
    #[validate(length(max = 64))] barcode: Option<String>,
    #[serde(default)] #[validate(length(max = 100))] category: String,
    #[validate(range(min = 0, max = 1000000000))] min_stock: i32,
}
async fn update(ctx: Ctx, id: web::Path<Uuid>, body: ApiJson<UpdateInput>) -> Result<HttpResponse> {
    ctx.write("products")?; let id = id.into_inner(); let body = body.0;
    let mut tx = ctx.tx().await?; inventory::lock_product(&mut tx,&ctx,id).await?;
    let barcode = body.barcode.as_deref().map(|v| clean(v,64)).transpose()?.filter(|v| !v.is_empty());
    let product = sqlx::query_as::<_, Product>("UPDATE products SET name=$4,barcode=$5,category=$6,min_stock=$7,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 AND active RETURNING *")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).bind(required(&body.name,200)?).bind(barcode).bind(clean(&body.category,100)?).bind(body.min_stock)
        .fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    audit::record(&mut tx,&ctx,"product.updated","product",Some(id),json!({})).await?; tx.commit().await?;
    Ok(HttpResponse::Ok().json(product))
}
async fn archive(ctx: Ctx, id: web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.write("products")?; let id = id.into_inner(); let mut tx = ctx.tx().await?;
    let changed = sqlx::query("UPDATE products SET active=false,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 AND active")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).execute(&mut *tx).await?.rows_affected();
    if changed == 0 { return Err(AppError::NotFound); }
    audit::record(&mut tx,&ctx,"product.archived","product",Some(id),json!({})).await?; tx.commit().await?;
    Ok(HttpResponse::NoContent().finish())
}
