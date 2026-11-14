use crate::{error::Result, models::Ctx};
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

pub async fn record(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, action: &str, entity_type: &str, entity_id: Option<Uuid>, metadata: Value) -> Result<()> {
    sqlx::query("INSERT INTO audit_events(organization_id,store_id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(ctx.session.user_id)
        .bind(action).bind(entity_type).bind(entity_id).bind(metadata).execute(&mut **tx).await?;
    Ok(())
}
