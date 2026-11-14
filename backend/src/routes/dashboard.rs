use crate::{error::{AppError, Result}, models::{Ctx, Product, Sale}, services::money};
use actix_web::{web, HttpResponse, Scope};
use chrono::{NaiveDate, Utc};
use serde::Deserialize;
use serde_json::json;
use validator::Validate;

pub fn scope() -> Scope {
    web::scope("").route("/dashboard", web::get().to(dashboard))
        .route("/financials/daily", web::get().to(daily)).route("/financials/summary", web::get().to(summary))
}
async fn scalar(tx:&mut sqlx::Transaction<'_,sqlx::Postgres>,sql:&str,ctx:&Ctx) -> Result<i64> {
    Ok(sqlx::query_scalar::<_,i64>(sql).bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_one(&mut **tx).await?)
}
async fn dashboard(ctx:Ctx) -> Result<HttpResponse> {
    let mut tx=ctx.tx().await?;
    let revenue=scalar(&mut tx,"SELECT coalesce(sum(total_milliemes),0) FROM sales WHERE organization_id=$1 AND store_id=$2 AND created_at >= ((now() AT TIME ZONE 'Africa/Tunis')::date::timestamp AT TIME ZONE 'Africa/Tunis')",&ctx).await?;
    let count=scalar(&mut tx,"SELECT count(*) FROM sales WHERE organization_id=$1 AND store_id=$2 AND created_at >= ((now() AT TIME ZONE 'Africa/Tunis')::date::timestamp AT TIME ZONE 'Africa/Tunis')",&ctx).await?;
    let products=scalar(&mut tx,"SELECT count(*) FROM products WHERE organization_id=$1 AND store_id=$2 AND active",&ctx).await?;
    let low_stock=scalar(&mut tx,"SELECT count(*) FROM products WHERE organization_id=$1 AND store_id=$2 AND active AND stock<=min_stock",&ctx).await?;
    let orders=scalar(&mut tx,"SELECT count(*) FROM orders WHERE organization_id=$1 AND store_id=$2 AND status NOT IN ('delivered','cancelled')",&ctx).await?;
    let profit=if ctx.session.is_owner() { Some(scalar(&mut tx,"SELECT coalesce(sum(subtotal_milliemes-cost_milliemes),0) FROM sales WHERE organization_id=$1 AND store_id=$2 AND created_at >= ((now() AT TIME ZONE 'Africa/Tunis')::date::timestamp AT TIME ZONE 'Africa/Tunis')",&ctx).await?) } else { None };
    let debts=if ctx.session.can("debts") { Some(scalar(&mut tx,"SELECT coalesce(sum(total_milliemes-amount_paid_milliemes),0) FROM debts WHERE organization_id=$1 AND store_id=$2 AND NOT archived",&ctx).await?) } else { None };
    let recent=sqlx::query_as::<_,Sale>("SELECT * FROM sales WHERE organization_id=$1 AND store_id=$2 ORDER BY created_at DESC,id LIMIT 5").bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_all(&mut *tx).await?;
    let alerts=if ctx.session.can("products") { sqlx::query_as::<_,Product>("SELECT * FROM products WHERE organization_id=$1 AND store_id=$2 AND active AND stock<=min_stock ORDER BY stock,name LIMIT 5").bind(ctx.session.organization_id).bind(ctx.session.store_id).fetch_all(&mut *tx).await? } else { Vec::new() };
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(json!({"today_revenue_milliemes":revenue,"today_sales":count,"today_gross_profit_milliemes":profit,"products_count":products,"low_stock_count":low_stock,"pending_orders":orders,"outstanding_debts_milliemes":debts,"recent_sales":recent,"low_stock_products":alerts,"timezone":"Africa/Tunis","generated_at":Utc::now()})))
}
#[derive(Deserialize,Validate)]
struct Range { from:NaiveDate,to:NaiveDate }
async fn daily(ctx:Ctx,query:web::Query<Range>) -> Result<HttpResponse> {
    ctx.read("financials")?; query.validate().map_err(|_|AppError::Validation("Invalid dates".into()))?;
    let q=query.into_inner(); if q.to<q.from || (q.to-q.from).num_days()>366 { return Err(AppError::Validation("Date range must be at most 366 days".into())); }
    let mut tx=ctx.tx().await?;
    let rows=sqlx::query_as::<_,(String,String,String,String,String,i64)>(r#"
      WITH days AS (SELECT generate_series($3::date,$4::date,'1 day'::interval)::date d),
      s AS (SELECT (created_at AT TIME ZONE 'Africa/Tunis')::date d,sum(total_milliemes) revenue,sum(cost_milliemes) cost,sum(subtotal_milliemes-cost_milliemes) profit,count(*) n FROM sales WHERE organization_id=$1 AND store_id=$2 AND created_at >= ($3::date::timestamp AT TIME ZONE 'Africa/Tunis') AND created_at < (($4::date+1)::timestamp AT TIME ZONE 'Africa/Tunis') GROUP BY 1),
      l AS (SELECT (created_at AT TIME ZONE 'Africa/Tunis')::date d,sum(abs(quantity_delta)::bigint*unit_cost_milliemes) loss FROM stock_movements WHERE organization_id=$1 AND store_id=$2 AND kind='damage' AND created_at >= ($3::date::timestamp AT TIME ZONE 'Africa/Tunis') AND created_at < (($4::date+1)::timestamp AT TIME ZONE 'Africa/Tunis') GROUP BY 1)
      SELECT days.d::text,coalesce(s.revenue,0)::text,coalesce(s.cost,0)::text,coalesce(s.profit,0)::text,coalesce(l.loss,0)::text,coalesce(s.n,0)
      FROM days LEFT JOIN s ON s.d=days.d LEFT JOIN l ON l.d=days.d ORDER BY days.d
    "#).bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(q.from).bind(q.to).fetch_all(&mut *tx).await?;
    let mut data=Vec::new();
    for (date,revenue,cost,profit,losses,count) in rows {
        data.push(json!({"date":date,"revenue_milliemes":money::parse_aggregate(Some(revenue))?,"cost_milliemes":money::parse_aggregate(Some(cost))?,"gross_profit_milliemes":profit.parse::<i64>().map_err(|_|AppError::Internal)?,"losses_milliemes":money::parse_aggregate(Some(losses))?,"sales_count":count}));
    }
    tx.commit().await?; Ok(HttpResponse::Ok().json(json!({"data":data,"timezone":"Africa/Tunis","delivery_fees_in_revenue":true,"delivery_fees_in_gross_profit":false})))
}
#[derive(Deserialize,Validate)]
struct SummaryQuery { from:Option<NaiveDate>,to:Option<NaiveDate> }
async fn summary(ctx:Ctx,query:web::Query<SummaryQuery>) -> Result<HttpResponse> {
    ctx.read("financials")?; query.validate().map_err(|_|AppError::Validation("Invalid dates".into()))?;
    let q=query.into_inner(); let from=q.from.unwrap_or_else(||Utc::now().date_naive()); let to=q.to.unwrap_or(from);
    if to<from || (to-from).num_days()>366 { return Err(AppError::Validation("Date range must be at most 366 days".into())); }
    let mut tx=ctx.tx().await?;
    let row=sqlx::query_as::<_,(String,String,String,i64)>(r#"SELECT coalesce(sum(total_milliemes),0)::text,coalesce(sum(cost_milliemes),0)::text,coalesce(sum(subtotal_milliemes-cost_milliemes),0)::text,count(*) FROM sales WHERE organization_id=$1 AND store_id=$2 AND created_at >= ($3::date::timestamp AT TIME ZONE 'Africa/Tunis') AND created_at < (($4::date+1)::timestamp AT TIME ZONE 'Africa/Tunis')"#)
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(from).bind(to).fetch_one(&mut *tx).await?;
    let losses=sqlx::query_scalar::<_,String>("SELECT coalesce(sum(abs(quantity_delta)::bigint*unit_cost_milliemes),0)::text FROM stock_movements WHERE organization_id=$1 AND store_id=$2 AND kind='damage' AND created_at >= ($3::date::timestamp AT TIME ZONE 'Africa/Tunis') AND created_at < (($4::date+1)::timestamp AT TIME ZONE 'Africa/Tunis')")
        .bind(ctx.session.organization_id).bind(ctx.session.store_id).bind(from).bind(to).fetch_one(&mut *tx).await?;
    tx.commit().await?;
    let revenue=money::parse_aggregate(Some(row.0))?; let cost=money::parse_aggregate(Some(row.1))?; let profit=row.2.parse::<i64>().map_err(|_|AppError::Internal)?; let losses=money::parse_aggregate(Some(losses))?;
    Ok(HttpResponse::Ok().json(json!({"from":from,"to":to,"revenue_milliemes":revenue,"cost_milliemes":cost,"gross_profit_milliemes":profit,"losses_milliemes":losses,"sales_count":row.3,"timezone":"Africa/Tunis","note":"Merchandise gross profit excludes delivery fees. Losses are valued at recorded stock cost. This is not a tax or payroll statement."})))
}
