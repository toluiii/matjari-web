use crate::{error::{AppError, Result}, models::{ApiJson, Ctx, IdempotencyKey, Pagination, Sale, SaleItem, clean}, services::{idempotency, inventory::{self, SaleLine}}};
use actix_web::{web, HttpResponse, Scope};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/sales").route("", web::get().to(list).post(create)).route("/{id}", web::get().to(get))
}
#[derive(Deserialize, Validate)]
pub struct SalesQuery {
    #[serde(flatten)] #[validate(nested)] pub pagination: Pagination,
    pub from: Option<NaiveDate>, pub to: Option<NaiveDate>,
}
impl SalesQuery {
    pub fn validate_dates(&self) -> Result<()> {
        self.validate().map_err(|_| AppError::Validation("Invalid query".into()))?;
        if let (Some(from), Some(to)) = (self.from, self.to) {
            if to < from || (to-from).num_days() > 366 { return Err(AppError::Validation("Date range must be at most 366 days".into())); }
        }
        Ok(())
    }
}
pub async fn list_rows(ctx: &Ctx, q: &SalesQuery) -> Result<(Vec<Sale>, i64)> {
    let mut tx = ctx.tx().await?;
    let total = sqlx::query_scalar::<_, i64>(r#"SELECT count(*) FROM sales WHERE organization_id=$1 AND store_id=$2 AND ($3='' OR customer_name ILIKE $4 ESCAPE '\') AND ($5::date IS NULL OR created_at >= ($5::date::timestamp AT TIME ZONE 'Africa/Tunis')) AND ($6::date IS NULL OR created_at < (($6::date+1)::timestamp AT TIME ZONE 'Africa/Tunis'))"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).bind(q.from).bind(q.to).fetch_one(&mut *tx).await?;
    let rows = sqlx::query_as::<_, Sale>(r#"SELECT * FROM sales WHERE organization_id=$1 AND store_id=$2 AND ($3='' OR customer_name ILIKE $4 ESCAPE '\') AND ($5::date IS NULL OR created_at >= ($5::date::timestamp AT TIME ZONE 'Africa/Tunis')) AND ($6::date IS NULL OR created_at < (($6::date+1)::timestamp AT TIME ZONE 'Africa/Tunis')) ORDER BY created_at DESC,id LIMIT $7 OFFSET $8"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).bind(q.from).bind(q.to).bind(q.pagination.page_size).bind(q.pagination.offset()).fetch_all(&mut *tx).await?;
    tx.commit().await?; Ok((rows,total))
}
async fn list(ctx: Ctx, query: web::Query<SalesQuery>) -> Result<HttpResponse> {
    ctx.read("sales")?; query.validate_dates()?;
    let page = query.pagination.page; let size = query.pagination.page_size;
    let (data,total) = list_rows(&ctx,&query).await?;
    Ok(HttpResponse::Ok().json(json!({"data":data,"total":total,"page":page,"page_size":size})))
}
async fn get(ctx: Ctx, id: web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.read("sales")?; let mut tx = ctx.tx().await?;
    let sale = sqlx::query_as::<_, Sale>("SELECT * FROM sales WHERE organization_id=$1 AND store_id=$2 AND id=$3")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id.into_inner()).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    let items = sqlx::query_as::<_, SaleItem>("SELECT id,product_id,product_name,quantity,unit_price_milliemes,unit_cost_milliemes FROM sale_items WHERE organization_id=$1 AND store_id=$2 AND sale_id=$3 ORDER BY product_name")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(sale.id).fetch_all(&mut *tx).await?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"sale":sale,"items":items})))
}
#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    #[validate(length(min = 1, max = 100), nested)] items: Vec<SaleLine>,
    #[validate(custom(function = "validate_payment"))] payment_method: String,
    #[serde(default)] #[validate(length(max = 160))] customer_name: String,
}
fn validate_payment(value: &str) -> std::result::Result<(), validator::ValidationError> {
    if matches!(value,"cash"|"card"|"transfer") { Ok(()) } else { Err(validator::ValidationError::new("payment_method")) }
}
async fn create(ctx: Ctx, key: IdempotencyKey, body: ApiJson<CreateInput>) -> Result<HttpResponse> {
    ctx.write("sales")?; let body = body.0; let mut tx = ctx.tx().await?;
    let (previous, hash) = idempotency::reserve(&mut tx,&ctx,key.0,&body).await?;
    if let Some(response) = previous { return Ok(HttpResponse::Ok().json(response)); }
    let receipt = inventory::create_sale(&mut tx,&ctx,&body.items,&body.payment_method,&clean(&body.customer_name,160)?,0,None).await?;
    let response = json!(receipt); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?;
    Ok(HttpResponse::Created().json(response))
}
