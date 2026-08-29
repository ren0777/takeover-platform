const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Formats how long a reign has lasted.
 *
 * `nowMs` is injected rather than read from the clock so the function stays
 * deterministic and testable, and so server and client render the same string
 * for a given instant. Callers pass `Date.now()`.
 */
export function formatReign(startedAtIso: string, nowMs: number): string {
  const startedMs = Date.parse(startedAtIso);
  if (Number.isNaN(startedMs)) return '—';

  // A start in the future is a data problem, not a negative duration.
  const elapsed = Math.max(0, nowMs - startedMs);

  if (elapsed >= DAY_MS) {
    const days = Math.floor(elapsed / DAY_MS);
    const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
    return `${days}d ${hours}h`;
  }

  if (elapsed >= HOUR_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  return `${Math.floor(elapsed / MINUTE_MS)}m`;
}
