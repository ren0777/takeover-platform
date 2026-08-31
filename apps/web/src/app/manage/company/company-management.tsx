'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DEFAULT_CURRENCY, type ManagementContext } from '@takeover/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Notice } from '@/components/ui/notice';
import { ApiRequestError } from '@/lib/api/client';
import { getManagementContext, revokeManagementSession } from '@/lib/api/identity';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { TakeoverPreparationForm } from './takeover-preparation-form';

type SignOutState =
  | { status: 'idle' }
  | { status: 'revoking' }
  | { status: 'failed'; code: string; requestId: string | undefined };

type ContextState =
  | { status: 'loading' }
  | { status: 'ready'; context: ManagementContext }
  | { status: 'failed'; code: string; requestId: string | undefined };

export function CompanyManagement({ intentId }: { intentId: string | null }) {
  const [state, setState] = useState<ContextState>({ status: 'loading' });
  const [signOut, setSignOut] = useState<SignOutState>({ status: 'idle' });

  useEffect(() => {
    let active = true;

    void getManagementContext()
      .then((context) => {
        if (active) setState({ status: 'ready', context });
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

  async function onSignOut() {
    setSignOut({ status: 'revoking' });
    try {
      await revokeManagementSession();
      window.location.assign('/manage');
    } catch (error: unknown) {
      // Revocation failed server-side. Never imply the session ended.
      if (error instanceof ApiRequestError) {
        setSignOut({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setSignOut({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  if (state.status === 'loading') {
    return <Notice variant="info" title="Loading your company…" />;
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
        <Link
          href="/manage"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium"
        >
          Request a management link
        </Link>
      </div>
    );
  }

  const { company, verificationLevels, sessionExpiresAt } = state.context;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">{company.name}</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--color-muted)]">Status</dt>
            <dd className="font-[family-name:var(--font-mono)]">{company.status}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Website</dt>
            <dd className="truncate">{company.websiteUrl}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--color-muted)]">Company ID</dt>
            <dd className="font-[family-name:var(--font-mono)] text-xs break-all">{company.id}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Verification</dt>
            <dd>{verificationLevels.length === 0 ? 'None' : verificationLevels.join(', ')}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Session expires</dt>
            <dd className="font-[family-name:var(--font-mono)]">
              {formatAbsoluteDateTime(sessionExpiresAt)}
            </dd>
          </div>
        </dl>
      </section>

      {company.status === 'draft' && (
        <Notice variant="warning" title="This company is a private draft">
          <p>
            It is not published, does not appear on the board, and owns no territory. Only a
            completed capture can activate it.
          </p>
        </Notice>
      )}

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">
          Takeover preparation
        </h2>
        {intentId === null ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            No takeover intent is open in this browser. Preparation is reached from a claim or a
            verification link.
          </p>
        ) : (
          <TakeoverPreparationForm intentId={intentId} currency={DEFAULT_CURRENCY} />
        )}
      </section>

      <Notice variant="warning" title="Checkout is not available">
        <p>
          Payment and territory capture are not implemented. Nothing on this page can charge you or
          transfer ownership.
        </p>
      </Notice>

      <div className="space-y-3">
        <Button
          variant="secondary"
          onClick={onSignOut}
          busy={signOut.status === 'revoking'}
          busyLabel="Ending session…"
        >
          End management session
        </Button>

        {signOut.status === 'failed' && (
          <ErrorState
            title={describeIdentityError(signOut.code).title}
            description={
              <p>
                Your session was not ended. {describeIdentityError(signOut.code).message} Close this
                browser if you need to stop using it immediately.
              </p>
            }
            {...(signOut.requestId === undefined ? {} : { requestId: signOut.requestId })}
          />
        )}
      </div>
    </div>
  );
}
