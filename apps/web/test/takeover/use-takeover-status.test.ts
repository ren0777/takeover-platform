// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttemptStatus } from '@takeover/shared';
import {
  useTakeoverStatus,
  type TakeoverStatusView,
} from '../../src/lib/takeover/use-takeover-status.js';
import { POLL_BUDGET_MS } from '../../src/lib/takeover/poll-schedule.js';

/**
 * Hook-level polling behaviour. `poll-schedule.test.ts`-equivalent coverage in
 * `hard-rules.test.ts` proves the pure delay math; this file proves the hook
 * actually uses it over time — including the one path a pure-function test
 * cannot see: what happens to the schedule after a poll fails.
 */

const STATUS_TOKEN = 'a'.repeat(43);

function status(overrides: Record<string, unknown> = {}): AttemptStatus {
  return {
    checkoutId: '00000000-0000-4000-8000-00000000abcd',
    state: 'PENDING_PAYMENT',
    terminal: false,
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  } as AttemptStatus;
}

function envelope(body: unknown): Response {
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let container: HTMLDivElement;
let root: Root;
let latest: TakeoverStatusView | undefined;
let fetchSpy: ReturnType<typeof vi.fn>;

function Probe({ initial }: { initial: AttemptStatus | null }) {
  latest = useTakeoverStatus(STATUS_TOKEN, initial);
  return null;
}

function mount(initial: AttemptStatus | null) {
  act(() => {
    root.render(React.createElement(Probe, { initial }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latest = undefined;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a failed poll cannot mutate the terminal outcome', () => {
  it('leaves the last known status untouched and keeps retrying with backoff', async () => {
    mount(status());
    expect(latest?.status?.state).toBe('PENDING_PAYMENT');

    fetchSpy.mockRejectedValueOnce(new Error('network blip'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The failed poll must not invent a status. Last known state stands.
    expect(latest?.status?.state).toBe('PENDING_PAYMENT');
    expect(latest?.status?.terminal).toBe(false);
    expect(latest?.couldNotRefresh).toBe(true);

    // A poll failure must not silently end automatic polling: the schedule
    // continues with backoff, not a tightened interval.
    fetchSpy.mockResolvedValueOnce(envelope(status({ state: 'PAYMENT_CONFIRMED' })));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(latest?.status?.state).toBe('PAYMENT_CONFIRMED');
    expect(latest?.couldNotRefresh).toBe(false);
  });
});

describe('polling stops exactly when the server says terminal', () => {
  it('never polls when the initial status is already terminal', async () => {
    mount(status({ state: 'CAPTURED', terminal: true }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops after a refresh reports a terminal state, and does not poll again', async () => {
    mount(status());

    fetchSpy.mockResolvedValueOnce(envelope(status({ state: 'CAPTURED', terminal: true })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(latest?.status?.state).toBe('CAPTURED');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('visibility-aware pause', () => {
  it('does not poll while hidden, then refreshes once immediately on becoming visible', async () => {
    mount(status());

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    fetchSpy.mockResolvedValue(envelope(status()));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('the poll budget', () => {
  it('stops waiting after the budget elapses, with no failure involved', async () => {
    mount(status());
    fetchSpy.mockResolvedValue(envelope(status()));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_BUDGET_MS + 60_000);
    });

    expect(latest?.stoppedWaiting).toBe(true);
    // The timeout is a state, never an invented failure.
    expect(latest?.status?.state).toBe('PENDING_PAYMENT');
  });
});
