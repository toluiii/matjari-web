use crate::error::{AppError, Result};

pub const MAX_UNIT: i64 = 1_000_000_000_000;
pub const MAX_TOTAL: i64 = 100_000_000_000_000;

pub fn line_total(unit: i64, quantity: i32) -> Result<i64> {
    if unit < 0 || unit > MAX_UNIT || quantity <= 0 || quantity > 100_000 { return Err(AppError::Validation("Invalid price or quantity".into())); }
    unit.checked_mul(i64::from(quantity)).filter(|v| *v <= MAX_TOTAL).ok_or_else(|| AppError::Validation("Line total is too large".into()))
}
pub fn sum(values: impl IntoIterator<Item = i64>) -> Result<i64> {
    values.into_iter().try_fold(0_i64, |acc, value| {
        if value < 0 { return Err(AppError::Validation("Negative aggregate value".into())); }
        acc.checked_add(value).filter(|v| *v <= MAX_TOTAL).ok_or_else(|| AppError::Validation("Total is too large".into()))
    })
}
pub fn weighted_cost(old_stock: i32, old_cost: i64, received: i32, new_cost: i64) -> Result<i64> {
    if old_stock < 0 || received <= 0 || old_cost < 0 || new_cost < 0 || old_cost > MAX_UNIT || new_cost > MAX_UNIT { return Err(AppError::Validation("Invalid receipt cost".into())); }
    let quantity = i64::from(old_stock).checked_add(i64::from(received)).ok_or(AppError::Internal)?;
    let value = i128::from(old_stock) * i128::from(old_cost) + i128::from(received) * i128::from(new_cost);
    // Round half up to the nearest millieme; sale costs remain immutable snapshots.
    let average = (value + i128::from(quantity) / 2) / i128::from(quantity);
    i64::try_from(average).map_err(|_| AppError::Internal)
}
pub fn parse_aggregate(value: Option<String>) -> Result<i64> {
    value.unwrap_or_else(|| "0".into()).parse::<i64>().map_err(|_| AppError::Internal)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn money_never_uses_floats() { assert_eq!(line_total(1250, 3).unwrap(), 3750); }
    #[test]
    fn overflow_is_rejected() { assert!(line_total(MAX_UNIT, 100_000).is_err()); assert!(sum([MAX_TOTAL, 1]).is_err()); }
    #[test]
    fn zero_quantity_is_rejected() { assert!(line_total(1000, 0).is_err()); assert!(line_total(1000, -1).is_err()); }
    #[test]
    fn weighted_average_is_millieme_precise() { assert_eq!(weighted_cost(3, 1000, 1, 2000).unwrap(), 1250); }
    #[test]
    fn weighted_average_rounds_half_up() { assert_eq!(weighted_cost(0, 0, 2, 1).unwrap(), 1); }
    #[test]
    fn aggregate_parser_preserves_large_integers() { assert_eq!(parse_aggregate(Some("9007199254740993".into())).unwrap(), 9007199254740993); }
}
