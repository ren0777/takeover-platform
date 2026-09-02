import { checkoutRequestSchema } from '../src/checkout-contract.js';
import { describe, it, expect } from 'vitest';

describe('CheckoutRequest schema', () => {
  it('accepts only quoteId', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });
  it('rejects amount field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '33333333-3333-3333-3333-333333333333', amount: 1000 });
    expect(result.success).toBe(false);
  });
  it('rejects returnUrl field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '33333333-3333-3333-3333-333333333333', returnUrl: 'https://example.com' });
    expect(result.success).toBe(false);
  });
});
