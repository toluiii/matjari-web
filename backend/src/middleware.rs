use crate::{config::Config, error::AppError};
use actix_web::{body::BoxBody, dev::{ServiceRequest, ServiceResponse}, Error, middleware::Next};
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub async fn request_context(req: ServiceRequest, next: Next<BoxBody>) -> Result<ServiceResponse, Error> {
    let request_id = Uuid::new_v4().to_string();
    req.extensions_mut().insert(RequestId(request_id.clone()));
    let config = req.app_data::<actix_web::web::Data<Config>>().expect("config installed");
    let method = req.method().clone();
    let path = req.path().to_string();
    let start = std::time::Instant::now();
    if !method.is_safe() && path.starts_with("/api/") {
        let origin = req.headers().get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
        let client = req.headers().get("x-matjari-client").and_then(|v| v.to_str().ok()).unwrap_or("");
        let csrf_header = req.headers().get("x-csrf-token").and_then(|v| v.to_str().ok()).unwrap_or("");
        let csrf_cookie = req.cookie(config.csrf_cookie()).map(|c| c.value().to_string()).unwrap_or_default();
        let fetch_site = req.headers().get("sec-fetch-site").and_then(|v| v.to_str().ok()).unwrap_or("same-origin");
        if origin != config.app_origin || client != "web" || !matches!(fetch_site, "same-origin" | "same-site" | "none") || csrf_header.len() != 64 || csrf_cookie.len() != 64 || !bool::from(csrf_header.as_bytes().ct_eq(csrf_cookie.as_bytes())) {
            let response = AppError::Forbidden.error_response();
            return Ok(req.into_response(response).map_into_boxed_body());
        }
    }
    let mut response = next.call(req).await?;
    let headers = response.headers_mut();
    headers.insert(actix_web::http::header::HeaderName::from_static("x-request-id"), request_id.parse().unwrap());
    headers.insert(actix_web::http::header::HeaderName::from_static("x-content-type-options"), "nosniff".parse().unwrap());
    headers.insert(actix_web::http::header::HeaderName::from_static("referrer-policy"), "strict-origin-when-cross-origin".parse().unwrap());
    headers.insert(actix_web::http::header::HeaderName::from_static("x-frame-options"), "DENY".parse().unwrap());
    if path.starts_with("/api/") {
        headers.insert(actix_web::http::header::CACHE_CONTROL, "private, no-store".parse().unwrap());
    }
    tracing::info!(request_id = %request_id, method = %method, path = %path, status = response.status().as_u16(), duration_ms = start.elapsed().as_millis() as u64, "request");
    Ok(response)
}

#[derive(Clone)]
pub struct RequestId(pub String);
