'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  type AccessDecisionResult,
  type CompanyAccessReviewItem,
  type ManagementContext,
} from '@takeover/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingRegion, LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Notice } from '@/components/ui/notice';
import { ApiRequestError } from '@/lib/api/client';
import {
  approveAccessRequest,
  exchangeManagementLink,
  listPendingAccessRequests,
  rejectAccessRequest,
} from '@/lib/api/identity';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { useFragmentExchange } from '@/lib/identity/use-fragment-exchange';

type DecisionState =
  | { status: 'idle' }
  | { status: 'submitting'; decision: 'approve' | 'reject' }
  | { status: 'decided'; result: AccessDecisionResult }
  | { status: 'failed'; code: string; requestId: string | undefined };

/**
 * Explicit approve/reject controls for one pending request.
 *
 * Reaching this screen only established a session — no security state changed
 * on GET. A decision happens solely through these buttons, which is what keeps
 * email prefetchers and link scanners from granting access.
 */
function RequestDecision({ request }: { request: CompanyAccessReviewItem }) {
  const [state, setState] = useState<DecisionState>({ status: 'idle' });
  const [reason, setReason] = useState('');

  async function decide(decision: 'approve' | 'reject') {
    const trimmed = reason.trim();
    const input = trimmed.length > 0 ? { reason: trimmed } : {};

    setState({ status: 'submitting', decision });
    try {
      const result =
        decision === 'approve'
          ? await approveAccessRequest(request.id, input)
          : await rejectAccessRequest(request.id, input);
      setState({ status: 'decided', result });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  const reasonId = `reason-${request.id}`;
  const busy = state.status === 'submitting';

  return (
    <li className="rounded-[var(--radius-tile)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Requested by</dt>
          <dd className="font-medium break-all">{request.requesterEmail}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Requested</dt>
          <dd className="font-[family-name:var(--font-mono)] text-xs">
            {formatAbsoluteDateTime(request.requestedAt)}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Expires</dt>
          <dd className="font-[family-name:var(--font-mono)] text-xs">
            {formatAbsoluteDateTime(request.expiresAt)}
          </dd>
        </div>
        {request.intent !== undefined && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Territory reference</dt>
            <dd className="font-[family-name:var(--font-mono)] text-xs break-all">
              {request.intent.territoryExternalRef}
            </dd>
          </div>
        )}
      </dl>

      {state.status === 'decided' ? (
        <div className="mt-4">
          <Notice variant="info" title={`Request ${state.result.accessRequest.status}`}>
            <p>The requester has been notified. Checkout remains unavailable.</p>
          </Notice>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label htmlFor={reasonId} className="block text-sm font-medium">
            Reason <span className="text-[var(--color-muted)]">(optional)</span>
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            className="w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-base disabled:opacity-60 sm:text-sm"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="affirmative"
              fullWidth
              disabled={busy}
              busy={busy && state.decision === 'approve'}
              busyLabel="Approving…"
              onClick={() => void decide('approve')}
            >
              Approve access
            </Button>
            <Button
              variant="destructive"
              fullWidth
              disabled={busy}
              busy={busy && state.decision === 'reject'}
              busyLabel="Rejecting…"
              onClick={() => void decide('reject')}
            >
              Reject
            </Button>
          </div>

          {state.status === 'failed' && (
            <ErrorState
              title={describeIdentityError(state.code).title}
              description={<p>{describeIdentityError(state.code).message}</p>}
              {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
            />
          )}
        </div>
      )}
    </li>
  );
}

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; items: CompanyAccessReviewItem[] }
  | { status: 'failed'; code: string; requestId: string | undefined };

function PendingRequests() {
  const [state, setState] = useState<ListState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    void listPendingAccessRequests()
      .then((page) => {
        if (active) setState({ status: 'ready', items: page.items });
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
  }, []);

  if (state.status === 'loading') {
    return (
      <LoadingRegion label="Loading pending requests…">
        <div className="mt-4">
          <LoadingSkeleton className="h-24 w-full" />
        </div>
      </LoadingRegion>
    );
  }

  if (state.status === 'failed') {
    const copy = describeIdentityError(state.code);
    return (
      <ErrorState
        title={copy.title}
        description={<p>{copy.message} No decision was recorded.</p>}
        {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
      />
    );
  }

  if (state.items.length === 0) {
    return (
      <EmptyState
        title="No pending requests"
        description={<p>Nobody is currently waiting for access to this company.</p>}
      />
    );
  }

  return (
    <ul className="space-y-4">
      {state.items.map((request) => (
        <RequestDecision key={request.id} request={request} />
      ))}
    </ul>
  );
}

export function AccessReview() {
  const exchange = useCallback(
    (token: string): Promise<ManagementContext> => exchangeManagementLink(token),
    [],
  );
  const state = useFragmentExchange(exchange);

  if (state.status === 'reading' || state.status === 'exchanging') {
    return <LoadingRegion label="Opening your manager session…" />;
  }

  if (state.status === 'no-token') {
    return (
      <Notice variant="warning" title="This page needs a review link">
        <p>Open the review link from the notification email. Links are single use and expire.</p>
      </Notice>
    );
  }

  if (state.status === 'failed') {
    const copy = describeIdentityError(state.code);
    return (
      <ErrorState
        title={copy.title}
        description={<p>{copy.message} No decision was recorded.</p>}
        {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Notice variant="info" title={`Reviewing access to ${state.result.company.name}`}>
        <p>
          Approving grants management authority for this company. It does not transfer ownership or
          move money.
        </p>
      </Notice>

      <section aria-labelledby="pending-heading">
        <h2
          id="pending-heading"
          className="font-[family-name:var(--font-display)] text-lg font-bold"
        >
          Pending requests
        </h2>
        <div className="mt-3">
          <PendingRequests />
        </div>
      </section>

      <Link href="/manage/company" className="inline-block text-sm underline">
        Go to company management
      </Link>
    </div>
  );
}
