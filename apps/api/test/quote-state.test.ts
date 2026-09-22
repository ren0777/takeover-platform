import { describe, expect, it } from 'vitest';
import {
  assertQuotablePricing,
  assertQuotableTerritory,
  ClaimedTerritoryPricingNotConfiguredError,
  classifyQuote,
  PricingNotConfiguredError,
  quoteAvailabilityFor,
} from '../src/modules/takeover/quote-state.js';

const now = new Date('2026-09-22T10:00:00.000Z');
const territory = {
  availabilityStatus: 'ACTIVE' as const,
  currency: 'USD',
  hasActiveOwner: false,
  id: '21000000-0000-4000-8000-000000000001',
  minimumTakeoverAmountMinor: 1_000n,
  slug: 'seo',
  version: 3n,
};
const quote = {
  consumedAt: null,
  currency: 'USD',
  expiresAt: new Date('2026-09-22T10:05:00.000Z'),
  minimumAmountMinor: 1_000n,
  status: 'ACTIVE' as const,
  territoryVersion: 3n,
};

describe('assertQuotablePricing', () => {
  it('accepts a positive, safe minimum in a three-letter currency', () => {
    expect(() => assertQuotablePricing(territory)).not.toThrow();
  });

  it.each([
    ['zero', { minimumTakeoverAmountMinor: 0n }],
    ['negative', { minimumTakeoverAmountMinor: -1n }],
    ['beyond the safe integer boundary', { minimumTakeoverAmountMinor: 9_007_199_254_740_992n }],
    ['lower-case currency', { currency: 'usd' }],
    ['malformed currency', { currency: 'US$' }],
  ])('refuses %s pricing as not configured', (_label, override) => {
    expect(() => assertQuotablePricing({ ...territory, ...override })).toThrow(
      PricingNotConfiguredError,
    );
  });

  it('reports a 409 with the shared pricing code', () => {
    expect(new PricingNotConfiguredError()).toMatchObject({
      code: 'PRICING_NOT_CONFIGURED',
      statusCode: 409,
    });
  });
});

describe('classifyQuote', () => {
  it('is active while unexpired and the territory, price and intent are unchanged', () => {
    expect(classifyQuote({ intentReady: true, now, quote, territory })).toEqual({
      state: 'active',
      usable: true,
    });
  });

  it('reports expiry by time before anything else', () => {
    expect(
      classifyQuote({
        intentReady: true,
        now: new Date('2026-09-22T10:05:00.000Z'),
        quote,
        territory: { ...territory, version: 9n },
      }),
    ).toEqual({ state: 'expired', usable: false });
  });

  it('keeps terminal statuses terminal', () => {
    expect(
      classifyQuote({
        intentReady: true,
        now,
        quote: { ...quote, status: 'CANCELLED' },
        territory,
      }),
    ).toEqual({ state: 'cancelled', usable: false });
    expect(
      classifyQuote({ intentReady: true, now, quote: { ...quote, status: 'EXPIRED' }, territory }),
    ).toEqual({ state: 'expired', usable: false });
  });

  it.each([
    ['territory_version_changed', { territory: { ...territory, version: 4n } }],
    ['pricing_changed', { territory: { ...territory, minimumTakeoverAmountMinor: 2_000n } }],
    ['pricing_changed', { territory: { ...territory, currency: 'EUR' } }],
    [
      'territory_disabled',
      { territory: { ...territory, availabilityStatus: 'DISABLED' as const } },
    ],
    ['territory_claimed', { territory: { ...territory, hasActiveOwner: true } }],
    ['territory_missing', { territory: null }],
    ['intent_not_ready', { intentReady: false }],
  ])('marks an active quote stale for %s', (reason, override) => {
    expect(classifyQuote({ intentReady: true, now, quote, territory, ...override })).toEqual({
      state: 'stale',
      staleReason: reason,
      usable: false,
    });
  });
});

describe('quoteAvailabilityFor / assertQuotableTerritory', () => {
  const base = { ...territory, hasActiveOwner: false };

  it('quotes only an active, unowned territory with a configured price', () => {
    expect(quoteAvailabilityFor(base)).toBe('quotable');
    expect(quoteAvailabilityFor({ ...base, availabilityStatus: 'DISABLED' })).toBe(
      'territory_disabled',
    );
    expect(quoteAvailabilityFor({ ...base, hasActiveOwner: true })).toBe(
      'claimed_pricing_not_configured',
    );
    expect(quoteAvailabilityFor({ ...base, minimumTakeoverAmountMinor: 0n })).toBe(
      'pricing_not_configured',
    );
  });

  it('refuses a claimed territory even when its stored minimum is positive', () => {
    expect(() => assertQuotableTerritory({ ...base, hasActiveOwner: true })).toThrow(
      ClaimedTerritoryPricingNotConfiguredError,
    );
    expect(new ClaimedTerritoryPricingNotConfiguredError()).toMatchObject({
      code: 'CLAIMED_TERRITORY_PRICING_NOT_CONFIGURED',
      statusCode: 409,
    });
    expect(() => assertQuotableTerritory(base)).not.toThrow();
  });
});
