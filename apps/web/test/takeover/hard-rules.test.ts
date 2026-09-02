import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { attemptStatusSchema, type AttemptState } from '@takeover/shared';
import {
  canStartNewCheckout,
  describeAttemptState,
  shouldPoll,
} from '../../src/lib/takeover/describe-state.js';
import {
  nextPollDelayMs,
  POLL_BUDGET_MS,
  POLL_FLOOR_MS,
} from '../../src/lib/takeover/poll-schedule.js';
import { TakeoverStatusView } from '../../src/components/territory/takeover-status-view.js';

/**
 * The rules that must never regress, expressed as tests rather than prose.
 *
 * Statuses are built through the authoritative schema, so a payload that the
 * contract would reject cannot be used to prove a frontend rule.
 */

const SETTLED: ReadonlySet<string> = new Set([
  'CAPTURED',
  'REFUNDED',
  'QUOTE_EXPIRED',
  'PAYMENT_FAILED',
]);

function statusFor(state: AttemptState, overrides: Record<string, unknown> = {}) {
  return attemptStatusSchema.parse({
    checkoutId: '00000000-0000-4000-8000-00000000abcd',
    state,
    terminal: SETTLED.has(state),
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  });
}

function render(state: AttemptState, overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(TakeoverStatusView, {
      statusToken: 'a'.repeat(43),
      initialStatus: statusFor(state, overrides),
    }),
  );
}

describe('a browser return cannot create a captured state', () => {
  it('renders only what the server state says, whatever the URL claimed', () => {
    // The page component never reads searchParams; the view cannot see them at
    // all. Pending server state must therefore render as pending.
    const html = render('PENDING_PAYMENT').toLowerCase();

    expect(html).toContain('payment is being confirmed');
    expect(html).not.toContain('you captured');
    expect(html).not.toContain('captured</h1>');
  });

  it('does not treat a confirmed payment as a capture', () => {
    const html = render('PAYMENT_CONFIRMED').toLowerCase();

    expect(html).toContain('has not moved yet');
    expect(html).not.toContain('you captured');
  });
});

describe('no capture success without server CAPTURED', () => {
  it('claims ownership in exactly one state', () => {
    const claiming = (
      [
        'QUOTE_ACTIVE',
        'CHECKOUT_CREATED',
        'PENDING_PAYMENT',
        'PAYMENT_CONFIRMED',
        'CAPTURE_IN_PROGRESS',
        'CAPTURED',
        'CAPTURE_FAILED',
        'QUOTE_EXPIRED',
        'PAYMENT_FAILED',
        'LOST_TERRITORY_RACE',
        'RECONCILIATION_REQUIRED',
        'REFUND_PENDING',
        'REFUNDED',
      ] as const
    ).filter((state) => describeAttemptState(state).ownershipTransferred);

    expect(claiming).toEqual(['CAPTURED']);
  });

  it('says so plainly when it is captured', () => {
    expect(render('CAPTURED').toLowerCase()).toContain('you captured this territory');
  });
});

describe('no second checkout while a money attempt is unresolved', () => {
  it('refuses a restart in every unresolved state', () => {
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

  it('never renders a pay-again action while money is in flight', () => {
    // Asserted on actions, not prose: CAPTURE_FAILED deliberately says "do not
    // pay again", which is the opposite of offering it.
    for (const state of ['PENDING_PAYMENT', 'CAPTURE_FAILED', 'REFUND_PENDING'] as const) {
      const html = render(state).toLowerCase();

      expect(html, state).not.toContain('proceed to payment');
      expect(html, state).not.toContain('pay now');

      // The only control offered while money is unresolved is a status refresh.
      const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
      expect(buttons.length, state).toBeLessThanOrEqual(1);
      for (const button of buttons) expect(button, state).toContain('refresh now');
    }
  });
});

describe('polling continues while terminal is false', () => {
  it('LOST_TERRITORY_RACE keeps polling', () => {
    const status = statusFor('LOST_TERRITORY_RACE');
    expect(status.terminal).toBe(false);
    expect(shouldPoll(status)).toBe(true);
  });

  it('RECONCILIATION_REQUIRED keeps polling', () => {
    const status = statusFor('RECONCILIATION_REQUIRED');
    expect(status.terminal).toBe(false);
    expect(shouldPoll(status)).toBe(true);
  });

  it('REFUND_PENDING keeps polling', () => {
    expect(shouldPoll(statusFor('REFUND_PENDING'))).toBe(true);
  });

  it('CAPTURE_FAILED keeps polling', () => {
    expect(shouldPoll(statusFor('CAPTURE_FAILED'))).toBe(true);
  });
});

describe('polling stops on settled outcomes', () => {
  it('REFUNDED stops', () => {
    const status = statusFor('REFUNDED');
    expect(status.terminal).toBe(true);
    expect(shouldPoll(status)).toBe(false);
  });

  it('CAPTURED stops', () => {
    const status = statusFor('CAPTURED');
    expect(status.terminal).toBe(true);
    expect(shouldPoll(status)).toBe(false);
  });

  it('hides the refresh action once settled', () => {
    expect(render('CAPTURED').toLowerCase()).not.toContain('refresh now');
    expect(render('REFUNDED').toLowerCase()).not.toContain('refresh now');
  });
});

describe('poll schedule', () => {
  it('backs off 2s, then 5s, then 15s', () => {
    expect(nextPollDelayMs({ elapsedMs: 0 })).toBe(2_000);
    expect(nextPollDelayMs({ elapsedMs: 19_000 })).toBe(2_000);
    expect(nextPollDelayMs({ elapsedMs: 20_000 })).toBe(5_000);
    expect(nextPollDelayMs({ elapsedMs: 119_000 })).toBe(5_000);
    expect(nextPollDelayMs({ elapsedMs: 120_000 })).toBe(15_000);
  });

  it('stops at the budget instead of polling forever', () => {
    expect(nextPollDelayMs({ elapsedMs: POLL_BUDGET_MS })).toBeNull();
    expect(nextPollDelayMs({ elapsedMs: POLL_BUDGET_MS + 60_000 })).toBeNull();
  });

  it('lets the server set the cadence', () => {
    expect(nextPollDelayMs({ elapsedMs: 0, serverPollAfterMs: 30_000 })).toBe(30_000);
    // Even past the budget, an explicit server instruction is obeyed.
    expect(nextPollDelayMs({ elapsedMs: POLL_BUDGET_MS, serverPollAfterMs: 8_000 })).toBe(8_000);
  });

  it('lets Retry-After outrank everything', () => {
    expect(nextPollDelayMs({ elapsedMs: 0, serverPollAfterMs: 2_000, retryAfterSeconds: 60 })).toBe(
      60_000,
    );
  });

  it('never polls faster than the floor, whoever asked', () => {
    expect(nextPollDelayMs({ elapsedMs: 0, serverPollAfterMs: 1 })).toBe(POLL_FLOOR_MS);
    expect(nextPollDelayMs({ elapsedMs: 0, retryAfterSeconds: 0 })).toBe(POLL_FLOOR_MS);
  });
});

describe('status surface honesty', () => {
  it('shows an amount only when the server reported one', () => {
    expect(render('PENDING_PAYMENT').toLowerCase()).not.toContain('amount charged');

    const withAmount = render('CAPTURED', {
      amountCharged: { amountMinor: 25_000, currency: 'USD' },
    });
    expect(withAmount).toContain('$250.00');
  });

  it('announces changes politely rather than as an alert', () => {
    expect(render('CAPTURE_IN_PROGRESS')).toContain('aria-live="polite"');
  });

  it('offers a support reference wherever a person may need to chase money', () => {
    for (const state of ['CAPTURE_FAILED', 'RECONCILIATION_REQUIRED', 'REFUND_PENDING'] as const) {
      expect(render(state), state).toContain('00000000-0000-4000-8000-00000000abcd');
    }
  });
});
