use crate::{auth, config::Config, error::{AppError, Result}, models::{ApiJson, Ctx, required, clean, normalize_phone}, services::audit};
use actix_web::{web, HttpRequest, HttpResponse, Scope};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("/auth").route("/csrf", web::get().to(csrf)).route("/register", web::post().to(register))
        .route("/login", web::post().to(login)).route("/logout", web::post().to(logout))
        .route("/session", web::get().to(session)).route("/password", web::post().to(password))
}

async fn csrf(req: HttpRequest, config: web::Data<Config>) -> HttpResponse {
    let existing = req.cookie(config.csrf_cookie()).map(|c| c.value().to_string()).unwrap_or_default();
    let value = if existing.len() == 64 && existing.bytes().all(|b| b.is_ascii_hexdigit()) { existing } else { auth::token() };
    HttpResponse::Ok().cookie(auth::csrf_cookie(&config, value.clone())).json(json!({"csrf_token": value}))
}

#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct RegisterInput {
    #[validate(length(min = 1, max = 160))] store_name: String,
    #[validate(length(min = 1, max = 160))] owner_name: String,
    #[validate(length(min = 8, max = 32))] phone: String,
    #[validate(length(min = 12, max = 128))] password: String,
    #[serde(default)] #[validate(length(max = 500))] address: String,
    accept_terms: bool,
}
async fn register(req: HttpRequest, config: web::Data<Config>, db: web::Data<sqlx::PgPool>, body: ApiJson<RegisterInput>) -> Result<HttpResponse> {
    let body = body.0;
    if !body.accept_terms { return Err(AppError::Validation("Terms must be accepted".into())); }
    if !auth::consume(&db, "register-ip", &auth::client_ip(&req, &config), 5, 3600).await? { return Err(AppError::RateLimited); }
    let phone = normalize_phone(&body.phone)?;
    let store_name = required(&body.store_name, 160)?;
    let owner_name = required(&body.owner_name, 160)?;
    let address = clean(&body.address, 500)?;
    let password_hash = auth::hash_password(body.password).await?;
    let organization_id = Uuid::new_v4(); let store_id = Uuid::new_v4(); let user_id = Uuid::new_v4();
    let mut tx = db.begin().await?;
    sqlx::query("SELECT set_config('app.organization_id',$1,true),set_config('app.store_id',$2,true)")
        .bind(organization_id.to_string()).bind(store_id.to_string()).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO organizations(id,name,plan_id,subscription_expires_at) VALUES($1,$2,'trial',$3)")
        .bind(organization_id).bind(&store_name).bind(Utc::now() + Duration::days(14)).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO stores(id,organization_id,name,address,code) VALUES($1,$2,$3,$4,$5)")
        .bind(store_id).bind(organization_id).bind(&store_name).bind(address).bind(auth::store_code()).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO users(id,organization_id,role,name,phone,password_hash) VALUES($1,$2,'owner',$3,$4,$5)")
        .bind(user_id).bind(organization_id).bind(owner_name).bind(phone).bind(password_hash).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO store_counters(organization_id,store_id) VALUES($1,$2)").bind(organization_id).bind(store_id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO audit_events(organization_id,store_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,$3,'organization.registered','organization',$1)")
        .bind(organization_id).bind(store_id).bind(user_id).execute(&mut *tx).await?;
    let raw = auth::insert_session(&mut tx, user_id, organization_id, store_id).await?;
    tx.commit().await?;
    let session = auth::authenticate(&db, &raw).await?.ok_or(AppError::Internal)?;
    Ok(HttpResponse::Created().cookie(auth::session_cookie(&config, raw)).json(session.public_json()))
}

#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct LoginInput {
    #[validate(custom(function = "validate_login_type"))] login_type: String,
    #[validate(length(min = 8, max = 32))] phone: String,
    #[validate(length(max = 128))] password: Option<String>,
    #[validate(length(equal = 6))] access_code: Option<String>,
    #[validate(length(equal = 8))] store_code: Option<String>,
}
fn validate_login_type(value: &str) -> std::result::Result<(), validator::ValidationError> {
    if matches!(value, "owner" | "employee") { Ok(()) } else { Err(validator::ValidationError::new("login_type")) }
}
async fn login(req: HttpRequest, config: web::Data<Config>, db: web::Data<sqlx::PgPool>, body: ApiJson<LoginInput>) -> Result<HttpResponse> {
    let body = body.0;
    let phone = normalize_phone(&body.phone)?;
    auth::throttle_login(&db, &req, &config, &format!("{}:{phone}", body.login_type)).await?;
    let identity: Option<(Uuid, Uuid, Uuid, Option<String>, Option<String>)>;
    if body.login_type == "owner" {
        identity = sqlx::query_as("SELECT u.id,u.organization_id,(SELECT s.id FROM stores s WHERE s.organization_id=u.organization_id AND s.active ORDER BY s.created_at LIMIT 1),u.password_hash,u.access_code_hash FROM users u WHERE u.phone=$1 AND u.role='owner' AND u.active")
            .bind(&phone).fetch_optional(db.get_ref()).await?;
    } else {
        let code = body.store_code.as_deref().unwrap_or("").trim().to_uppercase();
        identity = sqlx::query_as("SELECT u.id,u.organization_id,u.store_id,u.password_hash,u.access_code_hash FROM users u JOIN stores s ON s.id=u.store_id WHERE u.phone=$1 AND u.role='employee' AND u.active AND s.active AND s.code=$2")
            .bind(&phone).bind(code).fetch_optional(db.get_ref()).await?;
    }
    static DUMMY: tokio::sync::OnceLock<String> = tokio::sync::OnceLock::new();
    let valid = match (&identity, body.login_type.as_str()) {
        (Some((_, _, _, Some(hash), _)), "owner") => {
            let password = body.password.ok_or(AppError::Unauthorized)?;
            auth::verify_password(password, hash.clone()).await
        }
        (Some((_, _, _, _, Some(hash))), "employee") => {
            let code = body.access_code.ok_or(AppError::Unauthorized)?;
            code.bytes().all(|b| b.is_ascii_digit()) && auth::verify_code(&code, hash, &config.auth_pepper)
        }
        _ => {
            let dummy = DUMMY.get_or_init(|| async { auth::hash_password(auth::random_password()).await.unwrap_or_default() }).await;
            if body.login_type == "owner" { auth::verify_password(body.password.unwrap_or_default(), dummy.clone()).await; }
            false
        }
    };
    let (user_id, organization_id, store_id) = match identity {
        Some((u, o, s, _, _)) if valid => (u, o, s),
        _ => return Err(AppError::Unauthorized),
    };
    let mut tx = db.begin().await?;
    let raw = auth::insert_session(&mut tx, user_id, organization_id, store_id).await?;
    tx.commit().await?;
    let session = auth::authenticate(&db, &raw).await?.ok_or(AppError::Internal)?;
    Ok(HttpResponse::Ok().cookie(auth::session_cookie(&config, raw)).json(session.public_json()))
}
async fn logout(req: HttpRequest, config: web::Data<Config>, db: web::Data<sqlx::PgPool>) -> Result<HttpResponse> {
    if let Some(cookie) = req.cookie(config.session_cookie()) {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1").bind(auth::digest(cookie.value())).execute(db.get_ref()).await?;
    }
    Ok(HttpResponse::NoContent().cookie(auth::removal_cookie(&config, config.session_cookie())).finish())
}
async fn session(ctx: Ctx) -> HttpResponse { HttpResponse::Ok().json(ctx.session.public_json()) }

#[derive(Deserialize, Validate)]
#[serde(deny_unknown_fields)]
struct PasswordInput {
    #[validate(length(min = 1, max = 128))] current_password: String,
    #[validate(length(min = 12, max = 128))] new_password: String,
}
async fn password(ctx: Ctx, body: ApiJson<PasswordInput>) -> Result<HttpResponse> {
    ctx.owner()?;
    let encoded = sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id=$1").bind(ctx.session.user_id).fetch_one(&ctx.db).await?;
    if !auth::verify_password(body.0.current_password, encoded).await { return Err(AppError::Unauthorized); }
    let hash = auth::hash_password(body.0.new_password).await?;
    let mut tx = ctx.tx().await?;
    sqlx::query("UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1").bind(ctx.session.user_id).bind(hash).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM sessions WHERE user_id=$1 AND id<>$2").bind(ctx.session.user_id).bind(ctx.session.session_id).execute(&mut *tx).await?;
    audit::record(&mut tx, &ctx, "auth.password_changed", "user", Some(ctx.session.user_id), json!({})).await?;
    tx.commit().await?;
    Ok(HttpResponse::NoContent().finish())
}
