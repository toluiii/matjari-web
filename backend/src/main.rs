use clap::{Parser, Subcommand};
use matjari_api::{config::Config, MIGRATOR};
use std::io;
use uuid::Uuid;

#[derive(Parser)]
#[command(name = "matjari", version, about = "Matjari retail API and operator tools")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}
#[derive(Subcommand)]
enum Command {
    /// Run the HTTP API (default).
    Serve,
    /// Apply migrations using an operator database connection.
    Migrate,
    /// Record an externally verified payment and grant a subscription period.
    GrantPlan {
        #[arg(long)] organization: Uuid,
        #[arg(long)] plan: String,
        #[arg(long)] days: i64,
        #[arg(long)] payment_reference: String,
        #[arg(long)] operator: String,
    },
}
#[tokio::main]
async fn main() -> io::Result<()> {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();
    let production = std::env::var("ENVIRONMENT").as_deref() == Ok("production");
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,sqlx=warn".into());
    if production { tracing_subscriber::fmt().with_env_filter(filter).json().flatten_event(true).init(); }
    else { tracing_subscriber::fmt().with_env_filter(filter).init(); }
    let database_url = std::env::var("DATABASE_URL").map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "DATABASE_URL is required"))?;
    match cli.command.unwrap_or(Command::Serve) {
        Command::Migrate => {
            let db = matjari_api::pool(&database_url).await.map_err(db_error)?;
            MIGRATOR.run(&db).await.map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
            tracing::info!("migrations applied");
        }
        Command::Serve => {
            let config = Config::from_env().map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;
            if production && std::env::var("RUN_MIGRATIONS").as_deref() == Ok("true") {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "Run migrations as a separate release job in production"));
            }
            let db = matjari_api::pool(&database_url).await.map_err(db_error)?;
            if !production && std::env::var("RUN_MIGRATIONS").as_deref() == Ok("true") { MIGRATOR.run(&db).await.map_err(|e| io::Error::new(io::ErrorKind::Other, e))?; }
            matjari_api::serve(config, db).await?;
        }
        Command::GrantPlan { organization, plan, days, payment_reference, operator } => {
            if !matches!(plan.as_str(), "basic"|"medium"|"premium") || !(1..=366).contains(&days) || payment_reference.trim().len() < 3 || payment_reference.len() > 200 || operator.trim().len() < 3 || operator.len() > 160 {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid plan, period, payment reference or operator"));
            }
            let db = matjari_api::pool(&database_url).await.map_err(db_error)?;
            let mut tx = db.begin().await.map_err(db_error)?;
            sqlx::query("SELECT set_config('app.organization_id',$1,true)").bind(organization.to_string()).execute(&mut *tx).await.map_err(db_error)?;
            let previous = sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>("SELECT subscription_expires_at FROM organizations WHERE id=$1 FOR UPDATE")
                .bind(organization).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Organization not found"))?;
            let start = previous.max(chrono::Utc::now());
            let expires = start + chrono::Duration::days(days);
            sqlx::query("INSERT INTO billing_events(organization_id,plan_id,payment_reference,days,previous_expires_at,new_expires_at,operator) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(organization).bind(&plan).bind(payment_reference.trim()).bind(days).bind(previous).bind(expires).bind(operator.trim()).execute(&mut *tx).await.map_err(db_error)?;
            sqlx::query("UPDATE organizations SET plan_id=$2,subscription_expires_at=$3,updated_at=now() WHERE id=$1")
                .bind(organization).bind(&plan).bind(expires).execute(&mut *tx).await.map_err(db_error)?;
            sqlx::query("INSERT INTO audit_events(organization_id,action,entity_type,entity_id,metadata) VALUES($1,'billing.plan_granted','organization',$1,$2)")
                .bind(organization).bind(serde_json::json!({"plan":plan,"days":days,"operator":operator.trim()})).execute(&mut *tx).await.map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            println!("{}", serde_json::json!({"organization":organization,"plan":plan,"expires_at":expires,"payment_verified_externally":true}));
        }
    }
    Ok(())
}
fn db_error(error: sqlx::Error) -> io::Error {
    // Do not print connection strings or bound payment/customer values.
    let code = error.as_database_error().and_then(|e| e.code()).map(|c| c.to_string()).unwrap_or_else(|| "connection_or_query_error".into());
    io::Error::new(io::ErrorKind::Other, format!("Database operation failed ({code})"))
}
