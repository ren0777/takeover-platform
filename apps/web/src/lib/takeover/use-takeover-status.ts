'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type AttemptStatus } from '@takeover/shared';
import { ApiRequestError } from '@/lib/api/client';
import { getTakeoverStatus } from '@/lib/data/takeover';
import { nextPollDelayMs } from '@/lib/takeover/poll-schedule';
import { shouldPoll } from '@/lib/takeover/describe-state';

/**
 * Keeps one attempt's status current while the server says it is unresolved.
 *
 * A thin shell over pure pieces: `shouldPoll` decides whether to continue and
 * `nextPollDelayMs` decides when. Two rules matter more than the mechanics:
 *
 * - A failed poll means "we could not ask", never "it failed". The last known
 *   status stays on screen and `couldNotRefresh` explains it — and the
 *   schedule keeps going with backoff. It must not go quiet just because one
 *   request failed: the loop below continues itself from a ref rather than
 *   from React re-renders, because a failure produces no new `status` to
 *   re-render on.
 * - Running out of budget stops polling. It does not invent an outcome.
 */
export type TakeoverStatusView = {
  status: AttemptStatus | null;
  /** True while a refresh is in flight. */
  refreshing: boolean;
  /** Set when the most recent refresh failed. The status above is still valid. */
  couldNotRefresh: boolean;
  /** True once polling stopped without the attempt settling. */
  stoppedWaiting: boolean;
  refresh: () => void;
};

export function useTakeoverStatus(
  statusToken: string,
  initialStatus: AttemptStatus | null,
): TakeoverStatusView {
  const [status, setStatus] = useState<AttemptStatus | null>(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [couldNotRefresh, setCouldNotRefresh] = useState(false);
  const [stoppedWaiting, setStoppedWaiting] = useState(false);

  const startedAt = useRef(Date.now());
  const retryAfter = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Mirrors `status` for the polling loop below. A failed refresh never
  // updates React state with a new status, so the loop cannot rely on a
  // render dependency to know whether to keep going — it reads this instead.
  const statusRef = useRef<AttemptStatus | null>(initialStatus);
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getTakeoverStatus(statusToken);
      statusRef.current = next;
      setStatus(next);
      setCouldNotRefresh(false);
      retryAfter.current = undefined;
    } catch (error: unknown) {
      // Keep the last known status. Not knowing is not the same as failing.
      setCouldNotRefresh(true);
      retryAfter.current = error instanceof ApiRequestError ? error.retryAfterSeconds : undefined;
    } finally {
      setRefreshing(false);
    }
  }, [statusToken]);

  useEffect(() => {
    statusRef.current = initialStatus;
    stopped.current = false;
    startedAt.current = Date.now();

    function schedule() {
      const current = statusRef.current;
      if (current === null || !shouldPoll(current) || stopped.current) return;

      const delay = nextPollDelayMs({
        elapsedMs: Date.now() - startedAt.current,
        serverPollAfterMs: current.pollAfterMs,
        retryAfterSeconds: retryAfter.current,
      });

      if (delay === null) {
        stopped.current = true;
        setStoppedWaiting(true);
        return;
      }

      timer.current = setTimeout(() => {
        // Paused while the tab is hidden; the visibility listener resumes it,
        // and this loop keeps checking back rather than going quiet.
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          schedule();
          return;
        }
        // Reschedule regardless of outcome: a failed poll must retry with
        // backoff, not stop, and only `shouldPoll`/`stopped` above may end it.
        void refresh().then(schedule);
      }, delay);
    }

    schedule();
    return () => {
      stopped.current = true;
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, [statusToken, initialStatus, refresh]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    function onVisible() {
      if (document.visibilityState === 'visible' && status !== null && shouldPoll(status)) {
        void refresh();
      }
    }

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, refresh]);

  return {
    status,
    refreshing,
    couldNotRefresh,
    stoppedWaiting,
    refresh: () => void refresh(),
  };
}
