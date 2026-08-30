'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent } from 'react';
import { type ManagementContext } from '@takeover/shared';
import { Notice } from '@/components/identity/notice';
import { TextField } from '@/components/identity/text-field';
import { ApiRequestError } from '@/lib/api/client';
import { exchangeManagementLink, requestManagementLink } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { useFragmentExchange } from '@/lib/identity/use-fragment-exchange';

type FormState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'accepted' }
  | { status: 'failed'; code: string; requestId: string | undefined };

function ManagementLinkForm() {
  const [state, setState] = useState<FormState>({ status: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const companyId = String(form.get('companyId') ?? '').trim();
    const contactEmail = String(form.get('contactEmail') ?? '').trim();

    setState({ status: 'submitting' });
    try {
      await requestManagementLink({ companyId, contactEmail });
      setState({ status: 'accepted' });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  // Deliberately identical whether or not the company/contact exists.
  if (state.status === 'accepted') {
    return (
      <Notice variant="info" title="Check your email">
        <p>
          If that company and contact are recognised, a management link is on its way. The link is
          single use and expires shortly after it is sent.
        </p>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <TextField
        id="companyId"
        name="companyId"
        label="Company ID"
        required
        disabled={state.status === 'submitting'}
        hint="Shown on your company management page."
      />
      <TextField
        id="contactEmail"
        name="contactEmail"
        label="Contact email"
        type="email"
        required
        autoComplete="email"
        disabled={state.status === 'submitting'}
      />

      <button
        type="submit"
        disabled={state.status === 'submitting'}
        className="min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-foreground)] font-semibold text-[#09090b] disabled:opacity-60"
      >
        {state.status === 'submitting' ? 'Sending…' : 'Email me a management link'}
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

export function ManageEntry() {
  const exchange = useCallback(
    (token: string): Promise<ManagementContext> => exchangeManagementLink(token),
    [],
  );
  const state = useFragmentExchange(exchange);

  if (state.status === 'reading' || state.status === 'exchanging') {
    return <Notice variant="info" title="Opening your management session…" />;
  }

  if (state.status === 'no-token') {
    return (
      <>
        <p className="mb-6 max-w-prose text-sm text-[var(--color-muted)]">
          TakeOver has no accounts and no passwords. Your company is created when you claim a
          territory, and you manage it through a single-use link sent to your contact email.
        </p>
        <ManagementLinkForm />
      </>
    );
  }

  if (state.status === 'failed') {
    const copy = describeIdentityError(state.code);
    return (
      <div className="space-y-4">
        <Notice
          variant="error"
          title={copy.title}
          {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
        >
          <p>{copy.message}</p>
        </Notice>
        <ManagementLinkForm />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Notice variant="info" title={`Management session open for ${state.result.company.name}`}>
        <p>This session manages one company and expires automatically.</p>
      </Notice>
      <Link
        href="/manage/company"
        className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-4 font-semibold text-[#09090b]"
      >
        Open company management
      </Link>
    </div>
  );
}
