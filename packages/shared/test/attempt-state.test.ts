import { attemptStateEnum, attemptStatusSchema } from '../src/attempt-state.js';
import { describe, it, expect } from 'vitest';

describe('AttemptState schema', () => {
  const validStates = attemptStateEnum.options;
  it.each(validStates)('accepts %s', (state) => {
    const result = attemptStateEnum.safeParse(state);
    expect(result.success).toBe(true);
  });

  it('rejects invalid state', () => {
    const result = attemptStateEnum.safeParse('UNKNOWN_STATE');
    expect(result.success).toBe(false);
  });

  it('requires terminal boolean', () => {
    const parseResult = attemptStatusSchema.safeParse({
      checkoutId: '123e4567-e89b-12d3-a456-426614174000',
      state: 'PENDING_PAYMENT',
      terminal: false,
      updatedAt: new Date().toISOString(),
    });
    expect(parseResult.success).toBe(true);
  });

  it('rejects missing terminal', () => {
    const parseResult = attemptStatusSchema.safeParse({
      checkoutId: '00000000-0000-0000-0000-000000000001',
      state: 'PENDING_PAYMENT',
      updatedAt: new Date().toISOString(),
    });
    expect(parseResult.success).toBe(false);
  });
});
