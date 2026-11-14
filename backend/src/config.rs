use std::env;

#[derive(Clone)]
pub struct Config {
    pub production: bool,
    pub bind_host: String,
    pub bind_port: u16,
    pub app_origin: String,
    pub auth_pepper: String,
    pub proxy_secret: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".into());
        let production = environment == "production";
        if !matches!(environment.as_str(), "development", "test", "production") {
            return Err("ENVIRONMENT must be development, test or production".into());
        }
        let app_origin = env::var("APP_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into()).trim_end_matches('/').to_string();
        let url = reqwest_url_parse(&app_origin)?;
        if production && !url { return Err("Production APP_ORIGIN must be an HTTPS origin".into()); }
        let auth_pepper = env::var("AUTH_PEPPER").map_err(|_| "AUTH_PEPPER is required")?;
        let proxy_secret = env::var("PROXY_SHARED_SECRET").map_err(|_| "PROXY_SHARED_SECRET is required")?;
        if auth_pepper.len() < 32 || proxy_secret.len() < 32 {
            return Err("AUTH_PEPPER and PROXY_SHARED_SECRET must each contain at least 32 characters".into());
        }
        if production && (auth_pepper.contains("CHANGE_ME") || proxy_secret.contains("CHANGE_ME")) {
            return Err("Replace development secrets before production".into());
        }
        Ok(Self {
            production,
            bind_host: env::var("BIND_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            bind_port: env::var("BIND_PORT").unwrap_or_else(|_| "8080".into()).parse().map_err(|_| "Invalid BIND_PORT")?,
            app_origin,
            auth_pepper,
            proxy_secret,
        })
    }
    pub fn session_cookie(&self) -> &'static str {
        if self.production { "__Host-matjari_session" } else { "matjari_session" }
    }
    pub fn csrf_cookie(&self) -> &'static str {
        if self.production { "__Host-matjari_csrf" } else { "matjari_csrf" }
    }
}

fn reqwest_url_parse(value: &str) -> Result<bool, String> {
    let (scheme, rest) = value.split_once("://").ok_or("APP_ORIGIN must include a scheme")?;
    if !matches!(scheme, "http", "https") || rest.is_empty() || rest.contains('/') || rest.contains('@') || rest.contains('?') || rest.contains('#') {
        return Err("APP_ORIGIN must be a bare HTTP(S) origin without path, credentials or query".into());
    }
    Ok(scheme == "https")
}
