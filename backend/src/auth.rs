use crate::{config::Config, error::{AppError, Result}, models::Session};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use password_hash::SaltString;
use rand::{distributions::Alphanumeric, Rng};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use std::net::IpAddr;
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub fn digest(value: &str) -> String { hex::encode(Sha256::digest(value.as_bytes())) }
pub fn token() -> String { hex::encode(rand::thread_rng().gen::<[u8; 32]>()) }
pub fn store_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..8).map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char).collect()
}
pub fn access_code() -> String { format!("{:06}", rand::thread_rng().gen_range(0..1_000_000)) }
pub fn code_hash(code: &str, pepper: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper.as_bytes()).expect("HMAC accepts arbitrary key lengths");
    mac.update(code.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
pub fn verify_code(code: &str, expected: &str, pepper: &str) -> bool {
    let actual = code_hash(code, pepper);
    actual.len() == expected.len() && bool::from(actual.as_bytes().ct_eq(expected.as_bytes()))
}
pub async fn hash_password(password: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut rand::rngs::OsRng);
        Argon2::default().hash_password(password.as_bytes(), &salt).map(|h| h.to_string())
            .map_err(|_| AppError::Internal)
    }).await.map_err(|_| AppError::Internal)?
}
pub async fn verify_password(password: String, encoded: String) -> bool {
    tokio::task::spawn_blocking(move || {
        PasswordHash::new(&encoded).map(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()).unwrap_or(false)
    }).await.unwrap_or(false)
}

const SESSION_QUERY: &str = r#"
SELECT s.id session_id, u.id user_id, u.organization_id, s.store_id, u.role, u.name, u.phone,
       u.permissions, u.daily_wage_milliemes, st.name store_name, st.code store_code,
       o.name organization_name, o.plan_id, o.subscription_expires_at,
       p.max_products, p.max_employees, p.max_stores, p.debts, p.financials, p.employees, p.multi_store
FROM sessions s JOIN users u ON u.id = s.user_id JOIN stores st ON st.id = s.store_id
JOIN organizations o ON o.id = s.organization_id JOIN plans p ON p.id = o.plan_id
WHERE s.token_hash = $1 AND s.expires_at > now() AND s.idle_expires_at > now() AND u.active AND st.active
"#;
pub async fn authenticate(db: &PgPool, raw: &str) -> Result<Option<Session>> {
    if raw.len() != 64 || !raw.bytes().all(|b| b.is_ascii_hexdigit()) { return Ok(None); }
    let session = sqlx::query_as::<_, Session>(SESSION_QUERY).bind(digest(raw)).fetch_optional(db).await?;
    if let Some(s) = &session {
        sqlx::query("UPDATE sessions SET idle_expires_at = LEAST(expires_at, now() + interval '2 hours') WHERE id = $1 AND idle_expires_at < now() + interval '1 hour'")
            .bind(s.session_id).execute(db).await?;
    }
    Ok(session)
}
pub async fn insert_session(tx: &mut Transaction<'_, Postgres>, user_id: Uuid, organization_id: Uuid, store_id: Uuid) -> Result<String> {
    let raw = token();
    sqlx::query("INSERT INTO sessions(token_hash,user_id,organization_id,store_id,expires_at,idle_expires_at) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(digest(&raw)).bind(user_id).bind(organization_id).bind(store_id)
        .bind(Utc::now() + Duration::hours(12)).bind(Utc::now() + Duration::hours(2)).execute(&mut **tx).await?;
    Ok(raw)
}
pub fn session_cookie(config: &Config, value: String) -> cookie::Cookie<'static> {
    cookie::Cookie::build((config.session_cookie(), value)).path("/").http_only(true).secure(config.production)
        .same_site(cookie::SameSite::Lax).max_age(cookie::time::Duration::hours(12)).build()
}
pub fn csrf_cookie(config: &Config, value: String) -> cookie::Cookie<'static> {
    cookie::Cookie::build((config.csrf_cookie(), value)).path("/").http_only(false).secure(config.production)
        .same_site(cookie::SameSite::Lax).max_age(cookie::time::Duration::hours(12)).build()
}
pub fn removal_cookie(config: &Config, name: &str) -> cookie::Cookie<'static> {
    cookie::Cookie::build((name.to_string(), String::new())).path("/").http_only(name == config.session_cookie())
        .secure(config.production).same_site(cookie::SameSite::Lax).max_age(cookie::time::Duration::seconds(0)).build()
}
pub fn client_ip(req: &actix_web::HttpRequest, config: &Config) -> String {
    let peer = req.peer_addr().map(|a| a.ip().to_string()).unwrap_or_else(|| "unknown".into());
    let trusted = req.headers().get("x-matjari-proxy").and_then(|v| v.to_str().ok()).unwrap_or("");
    if trusted.len() == config.proxy_secret.len() && bool::from(trusted.as_bytes().ct_eq(config.proxy_secret.as_bytes())) {
        if let Some(ip) = req.headers().get("x-client-ip").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<IpAddr>().ok()) {
            return ip.to_string();
        }
    }
    peer
}
pub async fn consume(db: &PgPool, scope: &str, key: &str, limit: i32, window_seconds: i32) -> Result<bool> {
    let attempts = sqlx::query_scalar::<_, i32>(r#"
        INSERT INTO auth_rate_limits(key, attempts) VALUES($1, 1)
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE WHEN auth_rate_limits.window_started_at < now() - make_interval(secs => $2::double precision) THEN 1 ELSE auth_rate_limits.attempts + 1 END,
          window_started_at = CASE WHEN auth_rate_limits.window_started_at < now() - make_interval(secs => $2::double precision) THEN now() ELSE auth_rate_limits.window_started_at END
        RETURNING attempts
    "#).bind(digest(&format!("{scope}:{key}"))).bind(window_seconds).fetch_one(db).await?;
    Ok(attempts <= limit)
}
pub async fn throttle_login(db: &PgPool, req: &actix_web::HttpRequest, config: &Config, account: &str) -> Result<()> {
    if !consume(db, "auth-ip", &client_ip(req, config), 30, 900).await? || !consume(db, "auth-account", account, 10, 900).await? {
        return Err(AppError::RateLimited);
    }
    Ok(())
}
pub fn random_password() -> String { rand::thread_rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect() }
