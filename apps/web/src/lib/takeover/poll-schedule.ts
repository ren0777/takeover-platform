/**
 * When to ask the server again about an unresolved attempt.
 *
 * Polling here is a fallback for a webhook the browser cannot observe, not a
 * transport. The rules, in order of authority:
 *
 * 1. `Retry-After` on a rate-limited response wins outright.
 * 2. The server's `pollAfterMs` wins next.
 * 3. Otherwise a bounded backoff, which stops rather than polling forever.
 *
 * Kept pure so every rule is testable without timers or a DOM.
 */

/** Never poll faster than this, whatever anyone asks for. */
export const POLL_FLOOR_MS = 2_000;

/** After this much waiting, stop and let a person decide. */
export const POLL_BUDGET_MS = 10 * 60 * 1_000;

export type PollInput = {
  /** Milliseconds since polling for this attempt began. */
  elapsedMs: number;
  /** `pollAfterMs` from the last status response, when present. */
  serverPollAfterMs?: number | undefined;
  /** `Retry-After` seconds from a rate-limited response, when present. */
  retryAfterSeconds?: number | undefined;
};

/**
 * Returns the delay before the next poll, or `null` to stop.
 *
 * Stopping is not failure: the caller keeps the last known state on screen and
 * offers a manual refresh.
 */
export function nextPollDelayMs(input: PollInput): number | null {
  if (input.retryAfterSeconds !== undefined) {
    return Math.max(input.retryAfterSeconds * 1_000, POLL_FLOOR_MS);
  }

  if (input.serverPollAfterMs !== undefined) {
    return Math.max(input.serverPollAfterMs, POLL_FLOOR_MS);
  }

  if (input.elapsedMs >= POLL_BUDGET_MS) return null;
  if (input.elapsedMs < 20_000) return 2_000;
  if (input.elapsedMs < 120_000) return 5_000;
  return 15_000;
}
