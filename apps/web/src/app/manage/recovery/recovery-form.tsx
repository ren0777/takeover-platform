'use client';

import { useState, type FormEvent } from 'react';
import { type RecoveryRequestResult } from '@takeover/shared';
import { Notice } from '@/components/identity/notice';
import { TextField } from '@/components/identity/text-field';
import { ApiRequestError } from '@/lib/api/client';
import { requestManualRecovery } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';

type RecoveryState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'recorded'; result: RecoveryRequestResult }
  | { status: 'failed'; code: string; requestId: string | undefined };

export function RecoveryForm() {
  const [state, setState] = useState<RecoveryState>({ status: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setState({ status: 'submitting' });
    try {
      const result = await requestManualRecovery({
        accessRequestId: String(form.get('accessRequestId') ?? '').trim(),
        contactEmail: String(form.get('contactEmail') ?? '').trim(),
      });
      setState({ status: 'recorded', result });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  if (state.status === 'recorded') {
    return (
      <Notice variant="warning" title="Recorded, but not yet actionable">
        <p>
          Your recovery request was stored with status{' '}
          <span className="font-[family-name:var(--font-mono)]">{state.result.status}</span>.
        </p>
        <p className="mt-2">
          There is no review process yet, so do not expect a decision from this step. It expires on{' '}
          {new Date(state.result.expiresAt).toLocaleDateString()}.
        </p>
      </Notice>
    );
  }

  const busy = state.status === 'submitting';

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <TextField
        id="accessRequestId"
        name="accessRequestId"
        label="Access request ID"
        required
        disabled={busy}
        hint="Shown when your access request was created."
      />
      <TextField
        id="contactEmail"
        name="contactEmail"
        label="Verified contact email"
        type="email"
        required
        disabled={busy}
        autoComplete="email"
      />

      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] font-medium disabled:opacity-60"
      >
        {busy ? 'Recording…' : 'Record a recovery request'}
      </button>

      {state.status === 'failed' && (
        <Notice
          variant="error"
          title={describeIdentityError(state.code).title}
          {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
        >
          <p>{describeIdentityError(state.code).message}</p>
        </Notice>
      )}
    </form>
  );
}
