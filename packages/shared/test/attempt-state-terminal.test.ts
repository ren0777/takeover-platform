import { attemptStatusSchema } from '../src/attempt-state.js';
import { describe, it, expect } from 'vitest';
import type { AttemptStatus } from '../src/attempt-state.js';


describe('AttemptStatus terminal flag validation', () => {
  const base = {
    checkoutId: '123e4567-e89b-12d3-a456-426614174000',
    updatedAt: new Date().toISOString(),
  };

  const cases = [
    { state: 'CAPTURED', terminal: true },
    { state: 'REFUNDED', terminal: true },
    { state: 'QUOTE_EXPIRED', terminal: true },
    { state: 'PAYMENT_FAILED', terminal: true, amountCharged: undefined },
    { state: 'PAYMENT_FAILED', terminal: false, amountCharged: { amountMinor: 1000, currency: 'USD' } },
    { state: 'CAPTURE_FAILED', terminal: false },
    { state: 'RECONCILIATION_REQUIRED', terminal: false },
    { state: 'REFUND_PENDING', terminal: false },
    { state: 'LOST_TERRITORY_RACE', terminal: false },
    { state: 'PENDING_PAYMENT', terminal: false },
    { state: 'CHECKOUT_CREATED', terminal: false },
    { state: 'QUOTE_ACTIVE', terminal: false },
    { state: 'PAYMENT_CONFIRMED', terminal: false },
    { state: 'CAPTURE_IN_PROGRESS', terminal: false },
  ];

  it.each(cases)('state $state with terminal $terminal should be valid', ({ state, terminal, amountCharged }) => {
    const obj = {
      ...base,
      state,
      terminal,
    } as unknown as AttemptStatus;
    if (amountCharged !== undefined) {
      obj.amountCharged = amountCharged;
    }
    const result = attemptStatusSchema.safeParse(obj);
    expect(result.success).toBe(true);
  });

  it.each(cases)('state $state with opposite terminal should be invalid', ({ state, terminal, amountCharged }) => {
    const obj = {
      ...base,
      state,
      terminal: !terminal,
    } as unknown as AttemptStatus;
    if (amountCharged !== undefined) {
      obj.amountCharged = amountCharged;
    }
    const result = attemptStatusSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });
});
