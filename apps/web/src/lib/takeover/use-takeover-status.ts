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
 *   status stays on screen and `staleSince` explains it.
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getTakeoverStatus(statusToken);
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
    if (status === null || !shouldPoll(status)) return;
    if (stoppedWaiting) return;

    function schedule() {
      const delay = nextPollDelayMs({
        elapsedMs: Date.now() - startedAt.current,
        serverPollAfterMs: status?.pollAfterMs,
        retryAfterSeconds: retryAfter.current,
      });

      if (delay === null) {
        setStoppedWaiting(true);
        return;
      }

      timer.current = setTimeout(() => {
        // Paused while the tab is hidden; the visibility listener resumes it.
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          schedule();
          return;
        }
        void refresh();
      }, delay);
    }

    schedule();
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, [status, refresh, stoppedWaiting]);

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
