import { checkoutRequestSchema } from '../src/checkout-contract.js';
import { describe, it, expect } from 'vitest';

describe('CheckoutRequest schema', () => {
  it('accepts only quoteId', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });
  it('rejects amount field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '3334567-e89b-12d3-a456-426614174000', amount: 1000 });
    expect(result.success).toBe(false);
  });
  it('rejects metadata field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', metadata: { foo: 'bar' } });
    expect(result.success).toBe(false);
  });
  it('rejects currency field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', currency: 'USD' });
    expect(result.success).toBe(false);
  });
  it('rejects successUrl field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', successUrl: 'https://example.com' });
    expect(result.success).toBe(false);
  });
  it('rejects failureUrl field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', failureUrl: 'https://example.com' });
    expect(result.success).toBe(false);
  });
  it('rejects territoryVersion field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', territoryVersion: '1' });
    expect(result.success).toBe(false);
  });
  it('rejects payment status field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', status: 'PENDING_PAYMENT' });
    expect(result.success).toBe(false);
  });
  it('rejects capture result field', () => {
    const result = checkoutRequestSchema.safeParse({ quoteId: '123e4567-e89b-12d3-a456-426614174000', captureResult: 'CAPTURED' });
    expect(result.success).toBe(false);
  });
});
