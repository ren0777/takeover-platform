'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ApiRequestError } from '@/lib/api/client';
import { reissueEmailVerification } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';

/**
 * Re-request of the verification email for a claim that was submitted but not
 * yet exchanged.
 *
 * This is the only recovery path for a claim whose email never arrived: the
 * management-link form cannot help (no grant exists until verification is
 * exchanged), manual recovery needs an access request, and re-submitting the
 * claim would fork a second draft company.
 *
 * The API answers `accepted` identically whether or not the claim exists, so
 * the copy must too: never confirm that an email was dispatched, only that the
 * request was accepted.
 */

export type ResendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | {
      status: 'failed';
      code: string;
      requestId: string | undefined;
      retryAfterSeconds: number | undefined;
    };

export function resendDelaySuffix(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined || retryAfterSeconds <= 0) return '';
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return ` Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

type ViewProps = {
  state: ResendState;
  contactEmail: string;
  onResend: () => void;
};

/** Pure render for one resend state, so copy is testable without a browser. */
export function VerificationResendView({ state, contactEmail, onResend }: ViewProps) {
  if (state.status === 'sent') {
    return (
      <Notice variant="info" title="Resend accepted">
        <p>
          If this claim is still open, a fresh verification link is on its way to{' '}
          <strong>{contactEmail}</strong>. Only the newest email&rsquo;s link works, and it expires
          like the first.
        </p>
        <p className="mt-2">
          If no email arrives within a few minutes, this claim may have expired. Submit the claim
          form again with the same details.
        </p>
      </Notice>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={onResend} busy={state.status === 'sending'} busyLabel="Resending…">
        Resend verification email
      </Button>
      <p className="text-xs text-[var(--color-muted)]">
        Sends a fresh link to {contactEmail}. The previous link stops working.
      </p>
      {state.status === 'failed' && (
        <Notice
          variant="error"
          title={describeIdentityError(state.code).title}
          {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
        >
          <p>
            {describeIdentityError(state.code).message}
            {state.code === 'RATE_LIMITED' ? resendDelaySuffix(state.retryAfterSeconds) : ''}
          </p>
        </Notice>
      )}
    </div>
  );
}

export function VerificationResend({
  companyId,
  contactEmail,
}: {
  companyId: string;
  contactEmail: string;
}) {
  const [state, setState] = useState<ResendState>({ status: 'idle' });

  async function onResend() {
    setState({ status: 'sending' });
    try {
      await reissueEmailVerification({ companyId, contactEmail });
      setState({ status: 'sent' });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({
          status: 'failed',
          code: error.code,
          requestId: error.requestId,
          retryAfterSeconds: error.retryAfterSeconds,
        });
        return;
      }
      setState({
        status: 'failed',
        code: 'INTERNAL_ERROR',
        requestId: undefined,
        retryAfterSeconds: undefined,
      });
    }
  }

  return <VerificationResendView state={state} contactEmail={contactEmail} onResend={onResend} />;
}
