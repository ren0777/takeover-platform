'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/lib/api/client';
import { readFragmentToken } from '@/lib/identity/fragment-token';

export type FragmentExchangeState<T> =
  | { status: 'reading' }
  | { status: 'no-token' }
  | { status: 'exchanging' }
  | { status: 'succeeded'; result: T }
  | { status: 'failed'; code: string; requestId: string | undefined };

/**
 * Reads a single-use token from the URL fragment, scrubs it, and exchanges it.
 *
 * The scrub happens before the network call and is unconditional, so the secret
 * leaves `location.hash` and the history entry even if the exchange fails or the
 * user navigates away mid-flight. The token is held only in a local variable and
 * is never stored, logged, or placed in component state.
 *
 * The exchange is a POST: opening the emailed link performs no mutation, which
 * matters because prefetchers and email scanners issue GET requests.
 */
export function useFragmentExchange<T>(
  exchange: (token: string) => Promise<T>,
): FragmentExchangeState<T> {
  const [state, setState] = useState<FragmentExchangeState<T>>({ status: 'reading' });
  // React 18/19 development mode mounts effects twice; a single-use token must
  // only ever be submitted once.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const token = readFragmentToken(window.location.hash);

    if (token === null) {
      setState({ status: 'no-token' });
      return;
    }

    // Scrub before the request so the secret cannot survive in history.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

    setState({ status: 'exchanging' });

    let active = true;
    void exchange(token)
      .then((result) => {
        if (active) setState({ status: 'succeeded', result });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError) {
          setState({ status: 'failed', code: error.code, requestId: error.requestId });
          return;
        }
        setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
      });

    return () => {
      active = false;
    };
  }, [exchange]);

  return state;
}
