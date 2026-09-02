import { describe, expect, it } from 'vitest';
import { attemptStateEnum, attemptStatusSchema, type AttemptState } from '@takeover/shared';
import {
  canStartNewCheckout,
  describeAttemptState,
  shouldPoll,
} from '../../src/lib/takeover/describe-state.js';

/**
 * Exhaustive coverage of the attempt-state table.
 *
 * Every case iterates the authoritative enum rather than a local list, so a
 * state added to `@takeover/shared` fails here instead of silently rendering
 * nothing.
 */

const ALL_STATES = attemptStateEnum.options;

/** Builds a status the shared contract accepts, including its terminal rule. */
function statusFor(state: AttemptState, overrides: Record<string, unknown> = {}) {
  const settled = new Set(['CAPTURED', 'REFUNDED', 'QUOTE_EXPIRED', 'PAYMENT_FAILED']);
  return attemptStatusSchema.parse({
    checkoutId: '00000000-0000-4000-8000-000000000001',
    state,
    terminal: settled.has(state),
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  });
}

describe('describeAttemptState', () => {
  it('covers every state in the shared enum', () => {
    for (const state of ALL_STATES) {
      const presentation = describeAttemptState(state);
      expect(presentation.title.length).toBeGreaterThan(0);
      expect(presentation.body.length).toBeGreaterThan(0);
      expect(presentation.badgeLabel.length).toBeGreaterThan(0);
    }
  });

  it('claims ownership transferred for CAPTURED and nothing else', () => {
    for (const state of ALL_STATES) {
      expect(describeAttemptState(state).ownershipTransferred).toBe(state === 'CAPTURED');
    }
  });

  it('never tells the reader they captured or own anything outside CAPTURED', () => {
    // The invariant is about who the copy credits, not about the word itself:
    // LOST_TERRITORY_RACE must still be able to say someone else captured it.
    const readerSuccessPhrases = [
      'you captured',
      'you own',
      'you are the',
      'you now own',
      'purchased',
      'congratulations',
    ];

    for (const state of ALL_STATES) {
      if (state === 'CAPTURED') continue;
      const { title, body } = describeAttemptState(state);
      const text = `${title} ${body}`.toLowerCase();

      for (const phrase of readerSuccessPhrases) {
        expect(text, `state ${state} must not contain "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it('does tell the reader they captured it in CAPTURED', () => {
    const { title, body } = describeAttemptState('CAPTURED');
    const text = `${title} ${body}`.toLowerCase();

    expect(text).toContain('you captured');
    expect(text).toContain('you are the');
  });

  it('flags money as possibly outstanding for every post-payment state', () => {
    for (const state of [
      'PENDING_PAYMENT',
      'PAYMENT_CONFIRMED',
      'CAPTURE_IN_PROGRESS',
      'CAPTURE_FAILED',
      'LOST_TERRITORY_RACE',
      'RECONCILIATION_REQUIRED',
      'REFUND_PENDING',
    ] as const) {
      expect(describeAttemptState(state).moneyMayBeOutstanding, state).toBe(true);
    }
  });

  it('offers a support reference wherever money needs a human', () => {
    for (const state of [
      'CAPTURE_FAILED',
      'LOST_TERRITORY_RACE',
      'RECONCILIATION_REQUIRED',
      'REFUND_PENDING',
      'REFUNDED',
    ] as const) {
      expect(describeAttemptState(state).showSupportReference, state).toBe(true);
    }
  });

  it('never carries meaning in the tone alone', () => {
    // Every tone is paired with a distinct label, so removing colour loses
    // nothing. Duplicated labels across states would be the failure here.
    const labels = ALL_STATES.map((state) => describeAttemptState(state).badgeLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('shouldPoll', () => {
  it('polls exactly when the server says the attempt is not terminal', () => {
    for (const state of ALL_STATES) {
      const status = statusFor(state);
      expect(shouldPoll(status), state).toBe(!status.terminal);
    }
  });

  it('keeps polling the money-in-flight states', () => {
    for (const state of [
      'CAPTURE_FAILED',
      'LOST_TERRITORY_RACE',
      'RECONCILIATION_REQUIRED',
      'REFUND_PENDING',
    ] as const) {
      expect(shouldPoll(statusFor(state)), state).toBe(true);
    }
  });

  it('stops on CAPTURED and REFUNDED', () => {
    expect(shouldPoll(statusFor('CAPTURED'))).toBe(false);
    expect(shouldPoll(statusFor('REFUNDED'))).toBe(false);
  });

  it('keeps polling a failed payment that still holds money', () => {
    // The contract makes PAYMENT_FAILED non-terminal when an amount was
    // charged, because a refund still has to resolve.
    const withMoney = statusFor('PAYMENT_FAILED', {
      terminal: false,
      amountCharged: { amountMinor: 25_000, currency: 'USD' },
    });

    expect(shouldPoll(withMoney)).toBe(true);
  });
});

describe('canStartNewCheckout', () => {
  it('allows a fresh attempt only from a settled state with no money in flight', () => {
    for (const state of ['QUOTE_EXPIRED', 'PAYMENT_FAILED'] as const) {
      expect(canStartNewCheckout(statusFor(state)), state).toBe(true);
    }
    expect(canStartNewCheckout(statusFor('REFUNDED'))).toBe(true);
  });

  it('refuses while any money attempt is unresolved', () => {
    for (const state of [
      'PENDING_PAYMENT',
      'PAYMENT_CONFIRMED',
      'CAPTURE_IN_PROGRESS',
      'CAPTURE_FAILED',
      'LOST_TERRITORY_RACE',
      'RECONCILIATION_REQUIRED',
      'REFUND_PENDING',
    ] as const) {
      expect(canStartNewCheckout(statusFor(state)), state).toBe(false);
    }
  });

  it('refuses after a successful capture', () => {
    expect(canStartNewCheckout(statusFor('CAPTURED'))).toBe(false);
  });

  it('refuses a failed payment that still holds money', () => {
    const withMoney = statusFor('PAYMENT_FAILED', {
      terminal: false,
      amountCharged: { amountMinor: 25_000, currency: 'USD' },
    });

    expect(canStartNewCheckout(withMoney)).toBe(false);
  });
});
