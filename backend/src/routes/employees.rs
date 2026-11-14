use crate::{auth, error::{AppError, Result}, models::{ApiJson, Ctx, Pagination, clean, normalize_phone, required}, services::audit};
use actix_web::{web, HttpResponse, Scope};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/employees").route("", web::get().to(list).post(create))
        .route("/{id}", web::patch(update)).route("/{id}/access-code", web::post().to(rotate))
}
#[derive(FromRow, serde::Serialize)]
struct Employee { id:Uuid,name:String,phone:String,store_id:Uuid,permissions:serde_json::Value,daily_wage_milliemes:i64,active:bool,created_at:DateTime<Utc> }
const SELECT: &str = "SELECT id,name,phone,store_id,permissions,daily_wage_milliemes,active,created_at FROM users WHERE organization_id=$1 AND role='employee'";
async fn list(ctx:Ctx,query:web::Query<Pagination>) -> Result<HttpResponse> {
    ctx.read("employees")?; query.validate().map_err(|_|AppError::Validation("Invalid query".into()))?; let q=query.into_inner();
    let total=sqlx::query_scalar::<_,i64>(r#"SELECT count(*) FROM users WHERE organization_id=$1 AND role='employee' AND ($2='' OR name ILIKE $3 ESCAPE '\' OR phone ILIKE $3 ESCAPE '\')"#).bind(ctx.session.organization_id).bind(q.search.trim()).bind(q.pattern()).fetch_one(&ctx.db).await?;
    let data=sqlx::query_as::<_,Employee>(&format!("{SELECT} AND ($2='' OR name ILIKE $3 ESCAPE '\\' OR phone ILIKE $3 ESCAPE '\\') ORDER BY created_at DESC,id LIMIT $4 OFFSET $5")).bind(ctx.session.organization_id).bind(q.search.trim()).bind(q.pattern()).bind(q.page_size).bind(q.offset()).fetch_all(&ctx.db).await?;
    Ok(HttpResponse::Ok().json(json!({"data":data,"total":total,"page":q.page,"page_size":q.page_size})))
}
#[derive(Debug,Deserialize,serde::Serialize,Validate)] #[serde(deny_unknown_fields)]
struct Permissions { products:bool,stock:bool,sales:bool,orders:bool,debts:bool }
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct CreateInput {
    #[validate(length(min=1,max=160))] name:String,
    #[validate(length(min=8,max=32))] phone:String,
    #[validate(range(min=0,max=1000000000))] daily_wage_milliemes:i64,
    #[validate(nested)] permissions:Permissions,
}
async fn create(ctx:Ctx,body:ApiJson<CreateInput>) -> Result<HttpResponse> {
    ctx.write("employees")?; let body=body.0; let phone=normalize_phone(&body.phone)?; let code=auth::access_code(); let hash=auth::code_hash(&code,&ctx.config.auth_pepper);
    let mut tx=ctx.tx().await?;
    sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE").bind(ctx.session.organization_id).fetch_one(&mut *tx).await?;
    let count=sqlx::query_scalar::<_,i64>("SELECT count(*) FROM users WHERE organization_id=$1 AND role='employee' AND active").bind(ctx.session.organization_id).fetch_one(&mut *tx).await?;
    if ctx.session.max_employees>=0 && count>=i64::from(ctx.session.max_employees) { return Err(AppError::PlanRequired); }
    let employee=sqlx::query_as::<_,Employee>(r#"INSERT INTO users(organization_id,store_id,role,name,phone,access_code_hash,permissions,daily_wage_milliemes) VALUES($1,$2,'employee',$3,$4,$5,$6,$7) RETURNING id,name,phone,store_id,permissions,daily_wage_milliemes,active,created_at"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(required(&body.name,160)?).bind(phone).bind(hash).bind(json!(body.permissions)).bind(body.daily_wage_milliemes).fetch_one(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"employee.created","user",Some(employee.id),json!({})).await?; tx.commit().await?;
    // The one-time code is never put in an idempotency response or audit record.
    Ok(HttpResponse::Created().json(json!({"employee":employee,"access_code":code})))
}
#[derive(Deserialize,Validate)] #[serde(deny_unknown_fields)]
struct UpdateInput {
    #[validate(length(min=1,max=160))] name:String,
    #[validate(range(min=0,max=1000000000))] daily_wage_milliemes:i64,
    #[validate(nested)] permissions:Permissions,
    active:bool,
}
async fn employee(ctx:&Ctx,id:Uuid) -> Result<Employee> {
    sqlx::query_as::<_,Employee>(&format!("{SELECT} AND id=$2")).bind(ctx.session.organization_id).bind(id).fetch_optional(&ctx.db).await?.ok_or(AppError::NotFound)
}
async fn update(ctx:Ctx,id:web::Path<Uuid>,body:ApiJson<UpdateInput>) -> Result<HttpResponse> {
    ctx.write("employees")?; let id=id.into_inner(); let existing=employee(&ctx,id).await?; let body=body.0; let mut tx=ctx.tx().await?;
    if body.active && !existing.active {
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE").bind(ctx.session.organization_id).fetch_one(&mut *tx).await?;
        let count=sqlx::query_scalar::<_,i64>("SELECT count(*) FROM users WHERE organization_id=$1 AND role='employee' AND active").bind(ctx.session.organization_id).fetch_one(&mut *tx).await?;
        if ctx.session.max_employees>=0 && count>=i64::from(ctx.session.max_employees) { return Err(AppError::PlanRequired); }
    }
    let data=sqlx::query_as::<_,Employee>("UPDATE users SET name=$3,permissions=$4,daily_wage_milliemes=$5,active=$6,updated_at=now() WHERE organization_id=$1 AND id=$2 AND role='employee' RETURNING id,name,phone,store_id,permissions,daily_wage_milliemes,active,created_at")
        .bind(ctx.session.organization_id).bind(id).bind(required(&body.name,160)?).bind(json!(body.permissions)).bind(body.daily_wage_milliemes).bind(body.active).fetch_one(&mut *tx).await?;
    if !body.active { sqlx::query("DELETE FROM sessions WHERE user_id=$1").bind(id).execute(&mut *tx).await?; }
    audit::record(&mut tx,&ctx,"employee.updated","user",Some(id),json!({"active":body.active})).await?; tx.commit().await?; Ok(HttpResponse::Ok().json(data))
}
async fn rotate(ctx:Ctx,id:web::Path<Uuid>) -> Result<HttpResponse> {
    ctx.write("employees")?; let id=id.into_inner(); employee(&ctx,id).await?; let code=auth::access_code(); let hash=auth::code_hash(&code,&ctx.config.auth_pepper); let mut tx=ctx.tx().await?;
    sqlx::query("UPDATE users SET access_code_hash=$3,updated_at=now() WHERE organization_id=$1 AND id=$2 AND role='employee'").bind(ctx.session.organization_id).bind(id).bind(hash).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM sessions WHERE user_id=$1").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx,&ctx,"employee.code_rotated","user",Some(id),json!({})).await?; tx.commit().await?;
    Ok(HttpResponse::Ok().json(json!({"access_code":code})))
}
