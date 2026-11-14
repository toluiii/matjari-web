use crate::{auth, config::Config, error::{AppError, Result}};
use actix_web::{dev::Payload, FromRequest, HttpRequest};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use std::future::{ready, Ready};
use uuid::Uuid;
use validator::Validate;

#[derive(Clone, Debug, FromRow, Serialize)]
pub struct Session {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub organization_id: Uuid,
    pub store_id: Uuid,
    pub role: String,
    pub name: String,
    pub phone: String,
    pub permissions: Value,
    pub daily_wage_milliemes: i64,
    pub store_name: String,
    pub store_code: String,
    pub organization_name: String,
    pub plan_id: String,
    pub subscription_expires_at: DateTime<Utc>,
    pub max_products: i32,
    pub max_employees: i32,
    pub max_stores: i32,
    pub debts: bool,
    pub financials: bool,
    pub employees: bool,
    pub multi_store: bool,
}

impl Session {
    pub fn is_owner(&self) -> bool { self.role == "owner" }
    pub fn active(&self) -> bool { self.subscription_expires_at > Utc::now() }
    pub fn can(&self, feature: &str) -> bool {
        match feature {
            "products" | "stock" | "sales" | "orders" => self.is_owner() || self.permissions.get(feature).and_then(Value::as_bool).unwrap_or(false),
            "debts" => self.debts && (self.is_owner() || self.permissions.get(feature).and_then(Value::as_bool).unwrap_or(false)),
            "financials" => self.is_owner() && self.financials,
            "employees" => self.is_owner() && self.employees,
            "multi_store" => self.is_owner() && self.multi_store,
            "settings" | "billing" => self.is_owner(),
            _ => false,
        }
    }
    pub fn public_json(&self) -> Value {
        let features = ["products","stock","sales","orders","debts","financials","employees","multi_store","settings","billing"];
        let permissions: serde_json::Map<String, Value> = features.iter().map(|f| ((*f).into(), json!(self.can(f)))).collect();
        json!({
            "user": {"id": self.user_id, "name": self.name, "phone": self.phone, "role": self.role},
            "store": {"id": self.store_id, "name": self.store_name, "code": self.store_code},
            "organization": {"id": self.organization_id, "name": self.organization_name},
            "subscription": {"plan": self.plan_id, "expires_at": self.subscription_expires_at, "active": self.active(), "max_products": self.max_products, "max_employees": self.max_employees, "max_stores": self.max_stores},
            "permissions": permissions
        })
    }
}

#[derive(Clone)]
pub struct Ctx {
    pub db: PgPool,
    pub config: Config,
    pub session: Session,
}
impl Ctx {
    pub async fn tx(&self) -> Result<Transaction<'static, Postgres>> {
        let mut tx = self.db.begin().await?;
        sqlx::query("SELECT set_config('app.organization_id', $1, true), set_config('app.store_id', $2, true)")
            .bind(self.session.organization_id.to_string()).bind(self.session.store_id.to_string())
            .execute(&mut *tx).await?;
        Ok(tx)
    }
    pub fn owner(&self) -> Result<()> {
        if self.session.is_owner() { Ok(()) } else { Err(AppError::Forbidden) }
    }
    pub fn write(&self, feature: &str) -> Result<()> {
        if !self.session.can(feature) { return Err(AppError::Forbidden); }
        if !self.session.active() { return Err(AppError::PlanRequired); }
        Ok(())
    }
    pub fn read(&self, feature: &str) -> Result<()> {
        if self.session.can(feature) { Ok(()) } else { Err(AppError::Forbidden) }
    }
}
impl FromRequest for Ctx {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = std::result::Result<Self, Self::Error>>>>;
    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            let config = req.app_data::<actix_web::web::Data<Config>>().ok_or(AppError::Unauthorized)?.as_ref().clone();
            let db = req.app_data::<actix_web::web::Data<PgPool>>().ok_or(AppError::Unauthorized)?.as_ref().clone();
            let token = req.cookie(config.session_cookie()).map(|c| c.value().to_string()).ok_or(AppError::Unauthorized)?;
            let session = auth::authenticate(&db, &token).await?.ok_or(AppError::Unauthorized)?;
            Ok(Ctx { db, config, session })
        })
    }
}

pub struct ApiJson<T>(pub T);
impl<T: serde::de::DeserializeOwned + Validate + 'static> FromRequest for ApiJson<T> {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = std::result::Result<Self, Self::Error>>>>;
    fn from_request(req: &HttpRequest, payload: &mut Payload) -> Self::Future {
        let future = actix_web::web::Json::<T>::from_request(req, payload);
        Box::pin(async move {
            let value = future.await.map_err(|_| AppError::Validation("Invalid or oversized JSON body".into()))?.into_inner();
            value.validate().map_err(|_| AppError::Validation("One or more fields are invalid".into()))?;
            Ok(ApiJson(value))
        })
    }
}

#[derive(Clone)]
pub struct IdempotencyKey(pub Uuid);
impl FromRequest for IdempotencyKey {
    type Error = actix_web::Error;
    type Future = Ready<std::result::Result<Self, Self::Error>>;
    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let result = req.headers().get("idempotency-key").and_then(|v| v.to_str().ok())
            .and_then(|v| Uuid::parse_str(v).ok()).map(IdempotencyKey)
            .ok_or_else(|| AppError::Validation("A UUID Idempotency-Key header is required".into()).into());
        ready(result)
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct Pagination {
    #[serde(default = "default_page")]
    #[validate(range(min = 1, max = 100000))]
    pub page: i64,
    #[serde(default = "default_page_size")]
    #[validate(range(min = 1, max = 100))]
    pub page_size: i64,
    #[serde(default)]
    #[validate(length(max = 100))]
    pub search: String,
}
fn default_page() -> i64 { 1 }
fn default_page_size() -> i64 { 20 }
impl Pagination {
    pub fn offset(&self) -> i64 { (self.page - 1) * self.page_size }
    pub fn pattern(&self) -> String {
        format!("%{}%", self.search.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
    }
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Product {
    pub id: Uuid, pub organization_id: Uuid, pub store_id: Uuid,
    pub name: String, pub barcode: Option<String>, pub category: String,
    pub cost_milliemes: i64, pub stock: i32, pub min_stock: i32, pub active: bool,
    pub created_at: DateTime<Utc>, pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Sale {
    pub id: Uuid, pub organization_id: Uuid, pub store_id: Uuid, pub number: i64,
    pub customer_name: String, pub payment_method: String,
    pub subtotal_milliemes: i64, pub cost_milliemes: i64, pub delivery_fee_milliemes: i64,
    pub total_milliemes: i64, pub order_id: Option<Uuid>, pub actor_id: Uuid, pub created_at: DateTime<Utc>,
}
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SaleItem {
    pub id: Uuid, pub product_id: Uuid, pub product_name: String, pub quantity: i32,
    pub unit_price_milliemes: i64, pub unit_cost_milliemes: i64,
}
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Order {
    pub id: Uuid, pub organization_id: Uuid, pub store_id: Uuid, pub number: i64,
    pub status: String, pub customer_name: String, pub customer_phone: String, pub address: String,
    pub note: String, pub delivery_fee_milliemes: i64, pub subtotal_milliemes: i64,
    pub sale_id: Option<Uuid>, pub actor_id: Uuid, pub created_at: DateTime<Utc>, pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct OrderItem {
    pub id: Uuid, pub product_id: Uuid, pub quantity: i32, pub unit_price_milliemes: Option<i64>,
}
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Debt {
    pub id: Uuid, pub organization_id: Uuid, pub store_id: Uuid,
    pub customer_name: String, pub customer_phone: String, pub note: String,
    pub total_milliemes: i64, pub amount_paid_milliemes: i64, pub due_date: Option<chrono::NaiveDate>,
    pub archived: bool, pub created_at: DateTime<Utc>, pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Store {
    pub id: Uuid, pub organization_id: Uuid, pub name: String, pub address: String,
    pub code: String, pub active: bool, pub created_at: DateTime<Utc>,
}

pub fn clean(value: &str, max: usize) -> Result<String> {
    let value = value.trim();
    if value.chars().count() > max { return Err(AppError::Validation("Text is too long".into())); }
    Ok(value.to_string())
}
pub fn required(value: &str, max: usize) -> Result<String> {
    let value = clean(value, max)?;
    if value.is_empty() { return Err(AppError::Validation("A required text field is empty".into())); }
    Ok(value)
}
pub fn normalize_phone(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit() || matches!(c, '+' | ' ' | '-' | '(' | ')')) {
        return Err(AppError::Validation("Enter a valid Tunisian phone number".into()));
    }
    let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
    let phone = if digits.len() == 8 { format!("+216{digits}") }
        else if digits.starts_with("216") && digits.len() == 11 { format!("+{digits}") }
        else { return Err(AppError::Validation("Enter a valid Tunisian phone number".into())); };
    if !phone.starts_with("+216") || !matches!(phone.as_bytes()[4], b'2' | b'3' | b'4' | b'5' | b'7' | b'9') {
        return Err(AppError::Validation("Enter a valid Tunisian phone number".into()));
    }
    Ok(phone)
}
