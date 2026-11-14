use crate::{error::{AppError, Result}, models::{Ctx, Product, Sale, SaleItem}};
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Transaction};
use std::collections::HashSet;
use uuid::Uuid;
use validator::Validate;
use super::{audit, money};

#[derive(Debug, Clone, Deserialize, Serialize, Validate)]
#[serde(deny_unknown_fields)]
pub struct SaleLine {
    pub product_id: Uuid,
    #[validate(range(min = 1, max = 100000))]
    pub quantity: i32,
    #[validate(range(min = 1, max = 1000000000000))]
    pub unit_price_milliemes: i64,
}
#[derive(Debug, Serialize)]
pub struct Receipt { pub sale: Sale, pub items: Vec<SaleItem> }

pub async fn lock_product(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, id: Uuid) -> Result<Product> {
    sqlx::query_as::<_, Product>("SELECT * FROM products WHERE organization_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(id)
        .fetch_optional(&mut **tx).await?.ok_or(AppError::NotFound)
}
pub async fn next_number(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, kind: &str) -> Result<i64> {
    let sql = match kind {
        "sale" => "UPDATE store_counters SET next_sale=next_sale+1 WHERE organization_id=$1 AND store_id=$2 RETURNING next_sale-1",
        "order" => "UPDATE store_counters SET next_order=next_order+1 WHERE organization_id=$1 AND store_id=$2 RETURNING next_order-1",
        _ => return Err(AppError::Internal),
    };
    Ok(sqlx::query_scalar(sql).bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_one(&mut **tx).await?)
}
pub async fn movement(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, product_id: Uuid, kind: &str, delta: i32, cost: i64, reference: Option<Uuid>, reason: &str, supplier: &str, invoice: &str) -> Result<()> {
    sqlx::query("INSERT INTO stock_movements(organization_id,store_id,product_id,kind,quantity_delta,unit_cost_milliemes,reference_id,reason,supplier,invoice_ref,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(product_id).bind(kind).bind(delta).bind(cost)
        .bind(reference).bind(reason).bind(supplier).bind(invoice).bind(ctx.session.user_id).execute(&mut **tx).await?;
    Ok(())
}
pub async fn create_sale(tx: &mut Transaction<'_, Postgres>, ctx: &Ctx, lines: &[SaleLine], payment: &str, customer: &str, delivery_fee: i64, order_id: Option<Uuid>) -> Result<Receipt> {
    if lines.is_empty() || lines.len() > 100 || !matches!(payment, "cash" | "card" | "transfer") || delivery_fee < 0 || delivery_fee > money::MAX_UNIT {
        return Err(AppError::Validation("Invalid sale".into()));
    }
    let mut seen = HashSet::new();
    let mut sorted = lines.to_vec();
    sorted.sort_by_key(|l| l.product_id);
    let mut snapshots = Vec::new();
    let mut subtotals = Vec::new();
    let mut costs = Vec::new();
    for line in &sorted {
        if !seen.insert(line.product_id) { return Err(AppError::Validation("Duplicate product in sale".into())); }
        let product = lock_product(tx, ctx, line.product_id).await?;
        if !product.active { return Err(AppError::NotFound); }
        if product.stock < line.quantity { return Err(AppError::InsufficientStock); }
        let subtotal = money::line_total(line.unit_price_milliemes, line.quantity)?;
        let cost = money::line_total(product.cost_milliemes, line.quantity)?;
        subtotals.push(subtotal); costs.push(cost);
        snapshots.push((product, line, subtotal));
    }
    let subtotal = money::sum(subtotals)?;
    let total_cost = money::sum(costs)?;
    let total = money::sum([subtotal, delivery_fee])?;
    let number = next_number(tx, ctx, "sale").await?;
    let sale = sqlx::query_as::<_, Sale>(r#"INSERT INTO sales(organization_id,store_id,number,customer_name,payment_method,subtotal_milliemes,cost_milliemes,delivery_fee_milliemes,total_milliemes,order_id,actor_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(number).bind(customer).bind(payment)
        .bind(subtotal).bind(total_cost).bind(delivery_fee).bind(total).bind(order_id).bind(ctx.session.user_id).fetch_one(&mut **tx).await?;
    let mut items = Vec::new();
    for (product, line, _) in snapshots {
        let remaining = product.stock.checked_sub(line.quantity).ok_or(AppError::InsufficientStock)?;
        sqlx::query("UPDATE products SET stock=$4, updated_at=now() WHERE organization_id=$1 AND store_id=$2 AND id=$3")
            .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(product.id).bind(remaining).execute(&mut **tx).await?;
        let item = sqlx::query_as::<_, SaleItem>(r#"INSERT INTO sale_items(organization_id,store_id,sale_id,product_id,product_name,quantity,unit_price_milliemes,unit_cost_milliemes)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,product_id,product_name,quantity,unit_price_milliemes,unit_cost_milliemes"#)
            .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(sale.id).bind(product.id).bind(&product.name)
            .bind(line.quantity).bind(line.unit_price_milliemes).bind(product.cost_milliemes).fetch_one(&mut **tx).await?;
        movement(tx, ctx, product.id, "sale", -line.quantity, product.cost_milliemes, Some(sale.id), "", "", "").await?;
        items.push(item);
    }
    audit::record(tx, ctx, "sale.created", "sale", Some(sale.id), serde_json::json!({"total_milliemes": total})).await?;
    Ok(Receipt { sale, items })
}
