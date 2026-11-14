import { describe, expect, it } from 'vitest';
import { dinarsFromMilliemes, formatDate, formatMoney, parseTnd, todayInTunis } from '@/lib/format';

describe('TND milliemes formatting', () => {
  it('parses decimal dinars into integer milliemes without rounding', () => {
    expect(parseTnd('12')).toBe(12_000);
    expect(parseTnd('12.3')).toBe(12_300);
    expect(parseTnd('12.345')).toBe(12_345);
    expect(parseTnd('٠٫٠٠١')).toBe(1);
  });

  it('rejects ambiguous and out-of-range decimals', () => {
    expect(parseTnd('1.2345')).toBeNull();
    expect(parseTnd('-1')).toBeNull();
    expect(parseTnd('1,000,000')).toBeNull();
    expect(parseTnd('')).toBeNull();
    expect(parseTnd('12345678901')).toBeNull();
  });

  it('round-trips the supported milliemes precision', () => {
    expect(parseTnd(dinarsFromMilliemes(123_456))).toBe(123_456);
    expect(dinarsFromMilliemes(8)).toBe('0.008');
  });

  it('formats display values in the Tunisian currency and locale', () => {
    expect(formatMoney(25_500)).toContain('د.ت');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('Tunisian dates', () => {
  it('returns a stable ISO calendar date for the Tunis timezone', () => {
    expect(todayInTunis()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles invalid dates safely', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });
});
