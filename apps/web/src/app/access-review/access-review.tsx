'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { type AccessDecisionResult, type ManagementContext } from '@takeover/shared';
import { Notice } from '@/components/identity/notice';
import { ApiRequestError } from '@/lib/api/client';
import { approveAccessRequest, rejectAccessRequest } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { exchangeManagementLink } from '@/lib/api/identity';
import { useFragmentExchange } from '@/lib/identity/use-fragment-exchange';

type DecisionState =
  | { status: 'idle' }
  | { status: 'submitting'; decision: 'approve' | 'reject' }
  | { status: 'decided'; result: AccessDecisionResult }
  | { status: 'failed'; code: string; requestId: string | undefined };

/**
 * Explicit approve/reject controls.
 *
 * Reaching this screen only established a session — no security state changed on
 * GET. A decision happens solely through this submit, which is what keeps email
 * prefetchers and link scanners from granting access.
 */
function DecisionForm({ accessRequestId }: { accessRequestId: string }) {
  const [state, setState] = useState<DecisionState>({ status: 'idle' });
  const [reason, setReason] = useState('');

  async function decide(decision: 'approve' | 'reject') {
    const reasonValue = reason.trim();
    const input = reasonValue.length > 0 ? { reason: reasonValue } : {};

    setState({ status: 'submitting', decision });
    try {
      const result =
        decision === 'approve'
          ? await approveAccessRequest(accessRequestId, input)
          : await rejectAccessRequest(accessRequestId, input);
      setState({ status: 'decided', result });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  if (state.status === 'decided') {
    return (
      <Notice variant="info" title={`Request ${state.result.accessRequest.status}`}>
        <p>The requester has been notified. Checkout remains unavailable.</p>
      </Notice>
    );
  }

  const busy = state.status === 'submitting';

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label htmlFor="reason" className="block text-sm font-medium">
          Reason <span className="text-[var(--color-muted)]">(optional)</span>
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
          className="w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm disabled:opacity-60"
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('approve')}
            className="min-h-11 flex-1 rounded-[var(--radius-control)] bg-[var(--color-owner)] font-semibold text-[#09090b] disabled:opacity-60"
          >
            {busy && state.decision === 'approve' ? 'Approving…' : 'Approve access'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('reject')}
            className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--color-destructive)] font-semibold disabled:opacity-60"
          >
            {busy && state.decision === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>

      {state.status === 'failed' && (
        <Notice
          variant="error"
          title={describeIdentityError(state.code).title}
          {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
        >
          <p>{describeIdentityError(state.code).message}</p>
        </Notice>
      )}
    </div>
  );
}

export function AccessReview({ accessRequestId }: { accessRequestId: string | null }) {
  const exchange = useCallback(
    (token: string): Promise<ManagementContext> => exchangeManagementLink(token),
    [],
  );
  const state = useFragmentExchange(exchange);

  if (state.status === 'reading' || state.status === 'exchanging') {
    return <Notice variant="info" title="Opening your manager session…" />;
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
      <Notice
        variant="error"
        title={copy.title}
        {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
      >
        <p>{copy.message}</p>
        <p className="mt-2">No decision was recorded.</p>
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <Notice variant="info" title={`Reviewing access to ${state.result.company.name}`}>
        <p>
          Someone with a verified email asked to manage this company. Approving grants them
          management authority; it does not transfer ownership or move money.
        </p>
      </Notice>

      {accessRequestId === null ? (
        <Notice variant="warning" title="The request cannot be identified yet">
          <p>
            Your manager session is open, but this link does not carry the access request
            identifier, and there is no endpoint to list pending requests. The decision cannot be
            made from here yet.
          </p>
          <p className="mt-2">
            This is a known gap recorded for the backend team. Nothing was approved or rejected.
          </p>
        </Notice>
      ) : (
        <DecisionForm accessRequestId={accessRequestId} />
      )}

      <Link href="/manage/company" className="text-sm underline">
        Go to company management
      </Link>
    </div>
  );
}
