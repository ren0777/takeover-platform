import { describe, expect, it } from 'vitest';
import {
  isTakeoverCurrency,
  MAX_SAFE_AMOUNT_MINOR,
  nextTakeoverPriceMinor,
  TAKEOVER_BASE_PRICE_MINOR,
  TAKEOVER_CURRENCY,
  TAKEOVER_QUOTE_TTL_SECONDS,
  TakeoverPricingError,
} from '../src/index.js';

describe('MVP pricing policy', () => {
  it('publishes the approved constants', () => {
    expect(TAKEOVER_BASE_PRICE_MINOR).toBe(1_000n);
    expect(TAKEOVER_CURRENCY).toBe('USD');
    expect(TAKEOVER_QUOTE_TTL_SECONDS).toBe(300);
    expect(isTakeoverCurrency('USD')).toBe(true);
    for (const currency of ['usd', 'EUR', 'INR', '']) {
      expect(isTakeoverCurrency(currency)).toBe(false);
    }
  });

  it.each([
    ['the documented base step', 1_000n, 1_200n],
    ['the documented second step', 1_200n, 1_440n],
    ['a fractional cent rounded upward', 1_201n, 1_442n],
    ['another fractional cent rounded upward', 1_441n, 1_730n],
    ['an exact multiple of five', 5n, 1_000n],
    ['a large amount without precision loss', 1_000_000_000_001n, 1_200_000_000_002n],
  ])('prices %s', (_label, paid, expected) => {
    expect(nextTakeoverPriceMinor(paid)).toBe(expected);
  });

  it('always raises the price by at least one minor unit above the amount paid', () => {
    for (let paid = 1_000n; paid < 1_050n; paid += 1n) {
      const next = nextTakeoverPriceMinor(paid);
      expect(next).toBeGreaterThan(paid);
      // Never rounds down: the exact 120% value is never above the result.
      expect(next * 5n).toBeGreaterThanOrEqual(paid * 6n);
      // Never rounds up by more than one minor unit.
      expect((next - 1n) * 5n).toBeLessThan(paid * 6n);
    }
  });

  it('never falls below the configured base price', () => {
    expect(nextTakeoverPriceMinor(1n)).toBe(TAKEOVER_BASE_PRICE_MINOR);
    expect(nextTakeoverPriceMinor(800n)).toBe(TAKEOVER_BASE_PRICE_MINOR);
    // 834 * 1.2 = 1000.8, which rounds up past the base.
    expect(nextTakeoverPriceMinor(834n)).toBe(1_001n);
    expect(nextTakeoverPriceMinor(1_000n, 5_000n)).toBe(5_000n);
  });

  it.each([
    ['zero', 0n],
    ['a negative amount', -1n],
    ['an amount past the safe boundary', MAX_SAFE_AMOUNT_MINOR + 1n],
  ])('refuses %s instead of inventing a price', (_label, paid) => {
    expect(() => nextTakeoverPriceMinor(paid)).toThrow(TakeoverPricingError);
  });

  it('refuses a result that would exceed the safe amount boundary', () => {
    expect(() => nextTakeoverPriceMinor(MAX_SAFE_AMOUNT_MINOR)).toThrow(TakeoverPricingError);
  });

  it('refuses a non-positive or unusable base price', () => {
    expect(() => nextTakeoverPriceMinor(1_000n, 0n)).toThrow(TakeoverPricingError);
    expect(() => nextTakeoverPriceMinor(1_000n, -5n)).toThrow(TakeoverPricingError);
  });

  it('is pure integer arithmetic: no floating point reaches the result', () => {
    // 0.1 + 0.2 style drift would show up here as an off-by-one cent.
    const paid = 7_000_000_000_000_001n; // large, and its 120% is still representable
    expect(nextTakeoverPriceMinor(paid)).toBe(8_400_000_000_000_002n);
    expect(typeof nextTakeoverPriceMinor(1_000n)).toBe('bigint');
  });
});
