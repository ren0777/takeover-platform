import { checkoutResponseSchema } from '../src/checkout-contract.js';
import { describe, it, expect } from 'vitest';

describe('CheckoutResponse schema', () => {
  it('accepts valid response', () => {
    const result = checkoutResponseSchema.safeParse({
      checkoutId: '123e4567-e89b-12d3-a456-426614174000',
      statusToken: 'abcd1234efgh5678',
      providerCheckoutUrl: 'https://provider.example.com/checkout/123',
    });
    expect(result.success).toBe(true);
  });
  it('rejects extra fields', () => {
    const result = checkoutResponseSchema.safeParse({
      checkoutId: '123e4567-e89b-12d3-a456-426614174000',
      statusToken: 'abcd1234efgh5678',
      providerCheckoutUrl: 'https://provider.example.com/checkout/123',
      extra: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});
