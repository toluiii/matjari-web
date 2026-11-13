use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("Authentication required")]
    Unauthorized,
    #[error("You do not have permission for this action")]
    Forbidden,
    #[error("Resource not found")]
    NotFound,
    #[error("A conflicting record already exists")]
    Conflict,
    #[error("Subscription expired or feature unavailable")]
    PlanRequired,
    #[error("Insufficient stock or invalid stock operation")]
    InsufficientStock,
    #[error("Too many attempts; try again later")]
    RateLimited,
    #[error("Idempotency key was used for a different request")]
    IdempotencyConflict,
    #[error("Invalid order state transition")]
    InvalidTransition,
    #[error("Internal service error")]
    Internal,
    #[error("Internal storage error")]
    Database(#[from] sqlx::Error),
    #[error("Internal serialization error")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        if let Self::Database(error) = self {
            if let Some(code) = error.as_database_error().and_then(|e| e.code()) {
                match code.as_ref() {
                    "23505" => return "conflict",
                    "23503" | "23514" => return "validation_error",
                    _ => {}
                }
            }
        }
        match self {
            Self::Validation(_) => "validation_error",
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::NotFound => "not_found",
            Self::Conflict => "conflict",
            Self::PlanRequired => "plan_required",
            Self::InsufficientStock => "insufficient_stock",
            Self::RateLimited => "rate_limited",
            Self::IdempotencyConflict => "idempotency_conflict",
            Self::InvalidTransition => "invalid_transition",
            Self::Database(_) | Self::Json(_) | Self::Internal => "internal_error",
        }
    }
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        if let Self::Database(error) = self {
            if let Some(code) = error.as_database_error().and_then(|e| e.code()) {
                match code.as_ref() {
                    "23505" => return StatusCode::CONFLICT,
                    "23503" | "23514" => return StatusCode::UNPROCESSABLE_ENTITY,
                    _ => {}
                }
            }
        }
        match self {
            Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Conflict | Self::IdempotencyConflict => StatusCode::CONFLICT,
            Self::PlanRequired => StatusCode::PAYMENT_REQUIRED,
            Self::InsufficientStock | Self::InvalidTransition => StatusCode::UNPROCESSABLE_ENTITY,
            Self::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            Self::Database(_) | Self::Json(_) | Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
    fn error_response(&self) -> HttpResponse {
        if matches!(self, Self::Database(_) | Self::Json(_) | Self::Internal) {
            tracing::error!(error = ?self, "request failed");
        }
        let mut response = HttpResponse::build(self.status_code());
        if matches!(self, Self::RateLimited) { response.insert_header(("Retry-After", "900")); }
        let public_message = match self { Self::Database(_) | Self::Json(_) | Self::Internal => "The request could not be completed".to_string(), _ => self.to_string() };
        response.json(json!({"error": {"code": self.code(), "message": public_message}}))
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
