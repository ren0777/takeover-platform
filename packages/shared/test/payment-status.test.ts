import { attemptStatusSchema } from '../src/attempt-state.js';
import { describe, it, expect } from 'vitest';

describe('AttemptStatus pollAfterMs', () => {
  it('accepts non-negative integer', () => {
    const result = attemptStatusSchema.safeParse({
      checkoutId: '123e4567-e89b-12d3-a456-426614174000',
      state: 'PENDING_PAYMENT',
      terminal: false,
      updatedAt: new Date().toISOString(),
      pollAfterMs: 0,
    });
    expect(result.success).toBe(true);
  });
  it('rejects negative pollAfterMs', () => {
    const result = attemptStatusSchema.safeParse({
      checkoutId: '123e4567-e89b-12d3-a456-426614174000',
      state: 'PENDING_PAYMENT',
      terminal: false,
      updatedAt: new Date().toISOString(),
      pollAfterMs: -5,
    });
    expect(result.success).toBe(false);
  });
});
