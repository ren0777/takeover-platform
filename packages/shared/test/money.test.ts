import { describe, expect, it } from 'vitest';
import { createMoney, isMoney, moneySchema } from '../src/money.js';

describe('createMoney', () => {
  it('creates money from safe integer minor units and an uppercase currency', () => {
    expect(createMoney(25_000, 'USD')).toEqual({ amountMinor: 25_000, currency: 'USD' });
  });

  it.each([10.5, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid amount %s',
    (amountMinor) => {
      expect(() => createMoney(amountMinor, 'USD')).toThrow();
    },
  );

  it.each(['usd', 'US', 'USDD', 'U5D'])('rejects invalid currency %s', (currency) => {
    expect(() => createMoney(100, currency)).toThrow();
  });
});

describe('moneySchema', () => {
  it('accepts zero and strips untrusted extra keys', () => {
    expect(moneySchema.parse({ amountMinor: 0, currency: 'INR', ignored: true })).toEqual({
      amountMinor: 0,
      currency: 'INR',
    });
  });
});

describe('isMoney', () => {
  it('recognizes valid money and rejects malformed values', () => {
    expect(isMoney({ amountMinor: 1, currency: 'EUR' })).toBe(true);
    expect(isMoney({ amountMinor: '1', currency: 'EUR' })).toBe(false);
    expect(isMoney(null)).toBe(false);
  });
});

describe('money ceiling', () => {
  it('accepts exactly Number.MAX_SAFE_INTEGER minor units as the contract ceiling', () => {
    expect(createMoney(Number.MAX_SAFE_INTEGER, 'USD')).toEqual({
      amountMinor: Number.MAX_SAFE_INTEGER,
      currency: 'USD',
    });
    expect(isMoney({ amountMinor: Number.MAX_SAFE_INTEGER, currency: 'USD' })).toBe(true);
  });
});
