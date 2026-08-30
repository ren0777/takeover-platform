'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { type EmailTokenExchangeResult } from '@takeover/shared';
import { Notice } from '@/components/identity/notice';
import { exchangeEmailVerification } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { useFragmentExchange } from '@/lib/identity/use-fragment-exchange';

export function VerifyExchange() {
  const exchange = useCallback(
    (token: string): Promise<EmailTokenExchangeResult> => exchangeEmailVerification(token),
    [],
  );
  const state = useFragmentExchange(exchange);

  if (state.status === 'reading' || state.status === 'exchanging') {
    return <Notice variant="info" title="Verifying your contact email…" />;
  }

  if (state.status === 'no-token') {
    return (
      <Notice variant="warning" title="This page needs a verification link">
        <p>
          Open the most recent verification email and follow its link. Links are single use and
          expire.
        </p>
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
        <p className="mt-2">
          Nothing was verified and nothing was charged.{' '}
          <Link href="/manage" className="underline">
            Request a new link
          </Link>
          .
        </p>
      </Notice>
    );
  }

  const { company, intent, accessRequest, nextAction } = state.result;

  if (nextAction === 'await_company_access') {
    return (
      <div className="space-y-4">
        <Notice variant="pending" title="Your email is verified, but access is not granted yet">
          <p>
            {company.name} is already managed by someone else. A manager has been notified and must
            approve your request before you can act for this company.
          </p>
          <p className="mt-2">
            Nothing has been charged, and verifying your email does not grant access on its own.
          </p>
        </Notice>

        {accessRequest !== undefined && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted)]">Request status</dt>
              <dd className="font-[family-name:var(--font-mono)]">{accessRequest.status}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Request expires</dt>
              <dd className="font-[family-name:var(--font-mono)]">
                {new Date(accessRequest.expiresAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        )}

        <p className="text-sm text-[var(--color-muted)]">
          If no manager is reachable, you can{' '}
          <Link href="/manage/recovery" className="underline">
            open a recovery request
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Notice variant="info" title="Contact email verified">
        <p>
          You can now manage <strong>{company.name}</strong> in this browser.
        </p>
      </Notice>

      <Notice variant="warning" title="This company is a private draft">
        <p>
          It is not published, does not appear on the board, and owns no territory. Only a completed
          capture can activate it — and capture is not available yet.
        </p>
      </Notice>

      <Link
        href={`/manage/company?intentId=${encodeURIComponent(intent.id)}`}
        className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-4 font-semibold text-[#09090b]"
      >
        Open company management
      </Link>
    </div>
  );
}
