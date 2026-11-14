use crate::{auth, error::{AppError, Result}, models::{ApiJson, Ctx, Store, clean, required}, services::audit};
use actix_web::{web, HttpResponse, Scope};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/stores").route("", web::get().to(list).post(create))
        .route("/{id}/switch", web::post().to(switch))
        .service(web::scope("/settings").route("", web::get().to(get_settings).patch(settings)))
}
async fn list(ctx:Ctx) -> Result<HttpResponse> {
    ctx.read("multi_store")?; let mut tx=ctx.tx().await?;
    let data=sqlx::query_as::<_,Store>("SELECT id,organization_id,name,address,code,active,created_at FROM stores WHERE organization_id=$1 AND active ORDER BY created_at").bind(ctx.session.organization_id).fetch_all(&mut *tx).await?;
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"data":data})))
}
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct StoreInput { #[validate(length(min=1,max=160))] name:String, #[serde(default)] #[validate(length(max=500))] address:String }
async fn create(ctx:Ctx,body:ApiJson<StoreInput>) -> Result<HttpResponse> {
    ctx.write("multi_store")?; let body=body.0; let mut tx=ctx.tx().await?;
    sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE").bind(ctx.session.organization_id).fetch_one(&mut *tx).await?;
    let count=sqlx::query_scalar::<_,i64>("SELECT count(*) FROM stores WHERE organization_id=$1 AND active").bind(ctx.session.organization_id).fetch_one(&mut *tx).await?;
    if ctx.session.max_stores>=0 && count>=i64::from(ctx.session.max_stores) { return Err(AppError::PlanRequired); }
    let store=sqlx::query_as::<_,Store>("INSERT INTO stores(organization_id,name,address,code) VALUES($1,$2,$3,$4) RETURNING id,organization_id,name,address,code,active,created_at")
        .bind(ctx.session.organization_id).bind(required(&body.name,160)?).bind(clean(&body.address,500)?).bind(auth::store_code()).fetch_one(&mut *tx).await?;
    sqlx::query("INSERT INTO store_counters(organization_id,store_id) VALUES($1,$2)").bind(ctx.session.organization_id).bind(store.id).execute(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"store.created","store",Some(store.id),json!({})).await?; tx.commit().await?; Ok(HttpResponse::Created().json(store))
}
async fn switch(ctx:Ctx,id:web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.owner()?; let id=id.into_inner(); let mut tx=ctx.tx().await?;
    let store=sqlx::query_as::<_,Store>("SELECT id,organization_id,name,address,code,active,created_at FROM stores WHERE organization_id=$1 AND id=$2 AND active").bind(ctx.session.organization_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    sqlx::query("UPDATE sessions SET store_id=$2 WHERE id=$1").bind(ctx.session.session_id).bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"store.switched","store",Some(id),json!({})).await?; tx.commit().await?; Ok(HttpResponse::Ok().json(store))
}
async fn get_settings(ctx:Ctx) -> Result<HttpResponse> {
    ctx.read("settings")?;
    let mut tx=ctx.tx().await?;
    let store=sqlx::query_as::<_,Store>("SELECT id,organization_id,name,address,code,active,created_at FROM stores WHERE organization_id=$1 AND id=$2")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(store))
}
async fn settings(ctx:Ctx,body:ApiJson<StoreInput>) -> Result<HttpResponse> {
    ctx.write("settings")?; let body=body.0; let mut tx=ctx.tx().await?;
    let store=sqlx::query_as::<_,Store>("UPDATE stores SET name=$3,address=$4,updated_at=now() WHERE organization_id=$1 AND id=$2 RETURNING id,organization_id,name,address,code,active,created_at")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(required(&body.name,160)?).bind(clean(&body.address,500)?).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"store.settings_updated","store",Some(store.id),json!({})).await?; tx.commit().await?; Ok(HttpResponse::Ok().json(store))
}
