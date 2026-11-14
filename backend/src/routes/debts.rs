use crate::{error::{AppError, Result}, models::{ApiJson, Ctx, Debt, IdempotencyKey, Pagination, clean, required}, services::{audit, idempotency}};
use actix_web::{web, HttpResponse, Scope};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/debts").route("", web::get().to(list).post(create))
        .route("/{id}", web::get().to(get).patch(update).delete(archive))
        .route("/{id}/payments", web::get().to(payments).post(pay))
}
#[derive(Deserialize, Validate)]
struct DebtQuery { #[serde(flatten)] #[validate(nested)] pagination: Pagination, #[serde(default)] archived: bool }
async fn list(ctx: Ctx, query: web::Query<DebtQuery>) -> Result<HttpResponse> {
    ctx.read("debts")?; query.validate().map_err(|_| AppError::Validation("Invalid query".into()))?; let q=query.into_inner(); let mut tx=ctx.tx().await?;
    let total=sqlx::query_scalar::<_,i64>(r#"SELECT count(*) FROM debts WHERE organization_id=$1 AND store_id=$2 AND archived=$3 AND ($4='' OR customer_name ILIKE $5 ESCAPE '\' OR customer_phone ILIKE $5 ESCAPE '\')"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(q.archived).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).fetch_one(&mut *tx).await?;
    let data=sqlx::query_as::<_,Debt>(r#"SELECT * FROM debts WHERE organization_id=$1 AND store_id=$2 AND archived=$3 AND ($4='' OR customer_name ILIKE $5 ESCAPE '\' OR customer_phone ILIKE $5 ESCAPE '\') ORDER BY due_date NULLS LAST,created_at DESC,id LIMIT $6 OFFSET $7"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(q.archived).bind(q.pagination.search.trim()).bind(q.pagination.pattern()).bind(q.pagination.page_size).bind(q.pagination.offset()).fetch_all(&mut *tx).await?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"data":data,"total":total,"page":q.pagination.page,"page_size":q.pagination.page_size})))
}
async fn get(ctx: Ctx,id: web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.read("debts")?; let mut tx=ctx.tx().await?;
    let debt=sqlx::query_as::<_,Debt>("SELECT * FROM debts WHERE organization_id=$1 AND store_id=$2 AND id=$3").bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id.into_inner()).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(debt))
}
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct CreateInput {
    #[validate(length(min=1,max=160))] customer_name:String,
    #[serde(default)] #[validate(length(max=32))] customer_phone:String,
    #[serde(default)] #[validate(length(max=2000))] note:String,
    #[validate(range(min=1,max=1000000000000))] total_milliemes:i64,
    due_date:Option<NaiveDate>,
}
async fn create(ctx:Ctx,key:IdempotencyKey,body:ApiJson<CreateInput>) -> Result<HttpResponse> {
    ctx.write("debts")?; let body=body.0; let mut tx=ctx.tx().await?;
    let (previous,hash)=idempotency::reserve(&mut tx,&ctx,key.0,&body).await?;
    if let Some(response)=previous { return Ok(HttpResponse::Ok().json(response)); }
    let debt=sqlx::query_as::<_,Debt>("INSERT INTO debts(organization_id,store_id,customer_name,customer_phone,note,total_milliemes,due_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(required(&body.customer_name,160)?).bind(clean(&body.customer_phone,32)?).bind(clean(&body.note,2000)?).bind(body.total_milliemes).bind(body.due_date).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"debt.created","debt",Some(debt.id),json!({})).await?;
    let response=json!(debt); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?; Ok(HttpResponse::Created().json(response))
}
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct UpdateInput {
    #[validate(length(min=1,max=160))] customer_name:String,
    #[serde(default)] #[validate(length(max=32))] customer_phone:String,
    #[serde(default)] #[validate(length(max=2000))] note:String,
    #[validate(range(min=1,max=1000000000000))] total_milliemes:i64,
    due_date:Option<NaiveDate>,
}
async fn update(ctx:Ctx,id:web::Path<Uuid>,body:ApiJson<UpdateInput>) -> Result<HttpResponse> {
    ctx.write("debts")?; let body=body.0; let mut tx=ctx.tx().await?;
    let debt=sqlx::query_as::<_,Debt>("UPDATE debts SET customer_name=$4,customer_phone=$5,note=$6,total_milliemes=$7,due_date=$8,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 AND NOT archived RETURNING *")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id.into_inner()).bind(required(&body.customer_name,160)?).bind(clean(&body.customer_phone,32)?).bind(clean(&body.note,2000)?).bind(body.total_milliemes).bind(body.due_date).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    audit::record(&mut tx,&ctx,"debt.updated","debt",Some(debt.id),json!({})).await?; tx.commit().await?; Ok(HttpResponse::Ok().json(debt))
}
async fn archive(ctx:Ctx,id:web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.write("debts")?; let id=id.into_inner(); let mut tx=ctx.tx().await?;
    let changed=sqlx::query("UPDATE debts SET archived=true,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 AND NOT archived").bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).execute(&mut *tx).await?.rows_affected();
    if changed==0 { return Err(AppError::NotFound); }
    audit::record(&mut tx,&ctx,"debt.archived","debt",Some(id),json!({})).await?; tx.commit().await?; Ok(HttpResponse::NoContent().finish())
}
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct PayInput { #[validate(range(min=1,max=1000000000000))] amount_milliemes:i64 }
async fn pay(ctx:Ctx,id:web::Path<Uuid>,key:IdempotencyKey,body:ApiJson<PayInput>) -> Result<HttpResponse> {
    ctx.write("debts")?; let id=id.into_inner(); let mut tx=ctx.tx().await?;
    let (previous,hash)=idempotency::reserve(&mut tx,&ctx,key.0,&json!({"id":id,"amount":body.0.amount_milliemes})).await?;
    if let Some(response)=previous { return Ok(HttpResponse::Ok().json(response)); }
    let debt=sqlx::query_as::<_,Debt>("SELECT * FROM debts WHERE organization_id=$1 AND store_id=$2 AND id=$3 AND NOT archived FOR UPDATE").bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    let remaining=debt.total_milliemes-debt.amount_paid_milliemes;
    if body.0.amount_milliemes>remaining { return Err(AppError::Validation("Payment exceeds remaining debt".into())); }
    sqlx::query("INSERT INTO debt_payments(organization_id,store_id,debt_id,amount_milliemes,actor_id) VALUES($1,$2,$3,$4,$5)").bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).bind(body.0.amount_milliemes).bind(ctx.session.user_id).execute(&mut *tx).await?;
    let updated=sqlx::query_as::<_,Debt>("UPDATE debts SET amount_paid_milliemes=amount_paid_milliemes+$4,updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3 RETURNING *").bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id).bind(body.0.amount_milliemes).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"debt.payment_recorded","debt",Some(id),json!({"amount_milliemes":body.0.amount_milliemes})).await?;
    let response=json!(updated); idempotency::complete(&mut tx,&ctx,key.0,&hash,&response).await?; tx.commit().await?; Ok(HttpResponse::Created().json(response))
}
async fn payments(ctx:Ctx,id:web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.read("debts")?; let mut tx=ctx.tx().await?;
    let rows=sqlx::query_as::<_,(Uuid,i64,chrono::DateTime<chrono::Utc>)>("SELECT id,amount_milliemes,created_at FROM debt_payments WHERE organization_id=$1 AND store_id=$2 AND debt_id=$3 ORDER BY created_at DESC LIMIT 100")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id.into_inner()).fetch_all(&mut *tx).await?;
    let data:Vec<_>=rows.into_iter().map(|(id,amount,at)|json!({"id":id,"amount_milliemes":amount,"created_at":at})).collect();
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"data":data})))
}
