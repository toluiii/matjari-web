use crate::{auth::digest, error::{AppError, Result}, models::Ctx};
use serde::Serialize;
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

/// Lock the tenant/user/key, then return a previous response or a request hash.
/// The advisory transaction lock serializes concurrent retries without locking
/// unrelated requests. The complete response is inserted in the same transaction
/// as the business mutation, so the history stays append-only under RLS.
pub async fn reserve<T: Serialize>(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, key: Uuid, payload: &T) -> Result<(Option<Value>, String)> {
    let hash = digest(&hex::encode(serde_json::to_vec(payload)?));
    let lock_key = format!("{}:{}:{}:{}", ctx.session.organization_id, ctx.session.store_id, ctx.session.user_id, key);
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))").bind(lock_key).execute(&mut **tx).await?;
    let existing = sqlx::query_as::<_, (String, Value)>("SELECT request_hash,response FROM idempotency_keys WHERE organization_id=$1 AND store_id=$2 AND user_id=$3 AND key=$4")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(ctx.session.user_id).bind(key).fetch_optional(&mut **tx).await?;
    match existing {
        Some((previous, response)) if previous == hash => Ok((Some(response), hash)),
        Some(_) => Err(AppError::IdempotencyConflict),
        None => Ok((None, hash)),
    }
}
pub async fn complete(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, key: Uuid, hash: &str, response: &Value) -> Result<()> {
    sqlx::query("INSERT INTO idempotency_keys(organization_id,store_id,user_id,key,request_hash,response) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(ctx.session.user_id).bind(key).bind(hash).bind(response).execute(&mut **tx).await?;
    Ok(())
}
