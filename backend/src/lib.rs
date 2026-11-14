pub mod auth;
pub mod config;
pub mod error;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;

use actix_web::{web, App, HttpResponse, HttpServer};
use config::Config;
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn pool(database_url: &str) -> Result<sqlx::PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET statement_timeout = '15s'; SET lock_timeout = '5s'; SET idle_in_transaction_session_timeout = '10s'; SET TIME ZONE 'UTC'")
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect(database_url).await
}

async fn live() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({"status": "ok"}))
}

async fn ready(db: web::Data<sqlx::PgPool>) -> HttpResponse {
    let healthy = sqlx::query_scalar::<_, bool>("SELECT NOT EXISTS (SELECT 1 FROM _sqlx_migrations WHERE NOT success)")
        .fetch_one(db.get_ref()).await.unwrap_or(false);
    if healthy && sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(db.get_ref()).await.is_ok() {
        HttpResponse::Ok().json(serde_json::json!({"status": "ready"}))
    } else {
        HttpResponse::ServiceUnavailable().json(serde_json::json!({"status": "unavailable"}))
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/health/live", web::get().to(live))
        .route("/health/ready", web::get().to(ready))
        .service(web::scope("/api")
            .service(routes::auth::scope())
            .service(routes::products::scope())
            .service(routes::stock::scope())
            .service(routes::sales::scope())
            .service(routes::orders::scope())
            .service(routes::debts::scope())
            .service(routes::employees::scope())
            .service(routes::stores::scope())
            .service(routes::dashboard::scope())
            .service(routes::billing::scope()))
        .default_service(web::to(|| async {
            HttpResponse::NotFound().json(serde_json::json!({"error": {"code": "not_found", "message": "Resource not found"}}))
        }));
}

pub async fn serve(config: Config, db: sqlx::PgPool) -> std::io::Result<()> {
    let state = web::Data::new(config.clone());
    let database = web::Data::new(db.clone());
    let maintenance = db.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        loop {
            interval.tick().await;
            let sessions = sqlx::query("DELETE FROM sessions WHERE expires_at < now() - interval '7 days'").execute(&maintenance).await;
            let limits = sqlx::query("DELETE FROM auth_rate_limits WHERE window_started_at < now() - interval '1 day'").execute(&maintenance).await;
            if sessions.is_err() || limits.is_err() { tracing::warn!("maintenance cleanup failed"); }
        }
    });
    let server = HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .app_data(database.clone())
            .app_data(web::JsonConfig::default().limit(65_536).error_handler(|_, _| {
                crate::error::AppError::Validation("Invalid or oversized JSON body".into()).into()
            }))
            .app_data(web::PathConfig::default().error_handler(|_, _| {
                crate::error::AppError::Validation("Invalid resource identifier".into()).into()
            }))
            .app_data(web::QueryConfig::default().error_handler(|_, _| {
                crate::error::AppError::Validation("Invalid query parameters".into()).into()
            }))
            .wrap_fn(middleware::request_context)
            .configure(configure)
    })
    .bind((config.bind_host.as_str(), config.bind_port))?
    .shutdown_timeout(15)
    .keep_alive(Duration::from_secs(5))
    .run();
    tracing::info!(bind = %config.bind_host, port = config.bind_port, "API listening");
    server.await
}
