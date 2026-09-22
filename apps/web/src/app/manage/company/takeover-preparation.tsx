'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_CURRENCY, type TakeoverPreparationView } from '@takeover/shared';
import { LoadingRegion, LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Notice } from '@/components/ui/notice';
import { ApiRequestError } from '@/lib/api/client';
import {
  cancelTakeoverIntent,
  generateTakeoverQuote,
  getTakeoverPreparation,
  startTakeoverPreparation,
} from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { TakeoverPreparationForm } from './takeover-preparation-form';
import { TakeoverPreparationPanel } from './takeover-preparation-panel';

type Failure = { code: string; requestId: string | undefined };

type PreparationState =
  | { status: 'loading' }
  | { status: 'ready'; view: TakeoverPreparationView; busy: boolean; failure: Failure | null }
  | { status: 'failed'; failure: Failure };

function failureFrom(error: unknown): Failure {
  if (error instanceof ApiRequestError) return { code: error.code, requestId: error.requestId };
  return { code: 'INTERNAL_ERROR', requestId: undefined };
}

/**
 * Owns the preparation lifecycle for the management session.
 *
 * The server is the only source of what is being prepared: the view is read
 * from the session, so a refresh, a management-link login, or a second tab all
 * see the same preparation without any URL state. Every mutation replaces the
 * view with the server's response rather than editing it locally.
 */
export function TakeoverPreparation({ company }: { company: { id: string; name: string } }) {
  const [state, setState] = useState<PreparationState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void getTakeoverPreparation()
      .then((view) => {
        if (active) setState({ status: 'ready', view, busy: false, failure: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'failed', failure: failureFrom(error) });
      });
    return () => {
      active = false;
    };
  }, []);

  async function mutate(run: () => Promise<TakeoverPreparationView>) {
    if (state.status !== 'ready' || state.busy) return;
    setState({ ...state, busy: true, failure: null });
    try {
      const view = await run();
      setState({ status: 'ready', view, busy: false, failure: null });
    } catch (error: unknown) {
      // Keep the last known view: a failed mutation changed nothing server-side.
      setState({ ...state, busy: false, failure: failureFrom(error) });
    }
  }

  if (state.status === 'loading') {
    return (
      <LoadingRegion label="Loading takeover preparation…">
        <div className="mt-3 space-y-3">
          <LoadingSkeleton className="h-4 w-1/2" />
          <LoadingSkeleton className="h-4 w-2/3" />
        </div>
      </LoadingRegion>
    );
  }

  if (state.status === 'failed') {
    const copy = describeIdentityError(state.failure.code);
    return (
      <Notice
        variant="error"
        title={copy.title}
        {...(state.failure.requestId === undefined ? {} : { requestId: state.failure.requestId })}
      >
        <p>{copy.message}</p>
      </Notice>
    );
  }

  const activeIntent =
    state.view.intent !== null && state.view.intent.status === 'identity_ready'
      ? state.view.intent
      : null;

  return (
    <div className="space-y-4">
      <TakeoverPreparationPanel
        busy={state.busy}
        company={company}
        onCancel={(intentId) => void mutate(() => cancelTakeoverIntent(intentId))}
        onQuote={() => void mutate(() => generateTakeoverQuote())}
        onRestart={(territoryExternalRef) =>
          void mutate(() => startTakeoverPreparation({ territoryExternalRef }))
        }
        view={state.view}
      />

      {state.failure !== null && (
        <Notice
          variant="error"
          title={describeIdentityError(state.failure.code).title}
          {...(state.failure.requestId === undefined ? {} : { requestId: state.failure.requestId })}
        >
          <p>{describeIdentityError(state.failure.code).message}</p>
        </Notice>
      )}

      {activeIntent !== null && state.view.territory !== null && (
        <details className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Record an intended bid (reference only)
          </summary>
          <TakeoverPreparationForm
            intentId={activeIntent.id}
            territoryExternalRef={activeIntent.territoryExternalRef}
            currency={state.view.territory.minimumTakeoverAmount.currency || DEFAULT_CURRENCY}
          />
        </details>
      )}
    </div>
  );
}
