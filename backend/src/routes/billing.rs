use crate::{auth, error::{AppError, Result}, models::{ApiJson, Ctx, clean}, services::audit};
use actix_web::{web, HttpResponse, Scope};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope { web::scope("/billing/requests").route("", web::get().to(list).post(create)) }
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct RequestInput { plan_id:String, #[serde(default)] #[validate(length(max=2000))] message:String }
async fn create(ctx:Ctx,body:ApiJson<RequestInput>) -> Result<HttpResponse> {
    ctx.owner()?; let body=body.0;
    if !matches!(body.plan_id.as_str(),"basic"|"medium"|"premium") { return Err(AppError::Validation("Invalid plan".into())); }
    if !auth::consume(&ctx.db,"billing", &ctx.session.organization_id.to_string(),5,3600).await? { return Err(AppError::RateLimited); }
    let mut tx=ctx.tx().await?;
    let id=sqlx::query_scalar::<_,Uuid>("INSERT INTO billing_requests(organization_id,store_id,requested_by,plan_id,message) VALUES($1,$2,$3,$4,$5) RETURNING id")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(ctx.session.user_id).bind(&body.plan_id).bind(clean(&body.message,2000)?).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"billing.requested","billing_request",Some(id),json!({"plan":body.plan_id})).await?; tx.commit().await?;
    Ok(HttpResponse::Created().json(json!({"id":id,"status":"pending","message":"Request recorded. No payment has been collected."})))
}
async fn list(ctx:Ctx) -> Result<HttpResponse> {
    ctx.owner()?; let mut tx=ctx.tx().await?;
    let rows=sqlx::query_as::<_,(Uuid,String,String,chrono::DateTime<chrono::Utc>)>("SELECT id,plan_id,status,created_at FROM billing_requests WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50").bind(ctx.session.organization_id).fetch_all(&mut *tx).await?;
    let data:Vec<_>=rows.into_iter().map(|(id,plan,status,at)|json!({"id":id,"plan_id":plan,"status":status,"created_at":at})).collect();
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"data":data})))
}
