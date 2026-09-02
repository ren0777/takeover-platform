import { quoteResponseSchema } from '../src/quote-contract.js';
import { createMoney } from '../src/money.js';
import { describe, it, expect } from 'vitest';

describe('QuoteResponse schema', () => {
  const valid = {
    quoteId: '123e4567-e89b-12d3-a456-426614174000',
    territoryId: '123e4567-e89b-12d3-a456-426614174000',
    territorySlug: 'sample-slug',
    territoryVersion: '12345678901234567890', // beyond Number.MAX_SAFE_INTEGER
    minimumAmount: createMoney(1000, 'USD'),
    expiresAt: new Date().toISOString(),
    status: 'ACTIVE',
    checkoutAvailable: true,
    eligibilityReason: undefined,
  };
  it('accepts valid quote response', () => {
    const result = quoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
  it('rejects unexpected fields like intendedAmount', () => {
    const invalid = { ...valid, intendedAmount: createMoney(500, 'USD') };
    const result = quoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
