'use client';

import { useState, type FormEvent } from 'react';
import { type CompanyClaimResult } from '@takeover/shared';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ApiRequestError } from '@/lib/api/client';
import { beginCompanyClaim } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';

type ClaimState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'submitted'; result: CompanyClaimResult }
  | { status: 'failed'; code: string; requestId: string | undefined };

export function ClaimForm({ territoryExternalRef }: { territoryExternalRef: string | null }) {
  const [state, setState] = useState<ClaimState>({ status: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const logoUrl = String(form.get('logoUrl') ?? '').trim();

    setState({ status: 'submitting' });
    try {
      const result = await beginCompanyClaim({
        company: {
          name: String(form.get('name') ?? '').trim(),
          websiteUrl: String(form.get('websiteUrl') ?? '').trim(),
          ...(logoUrl.length > 0 ? { logoUrl } : {}),
        },
        contactEmail: String(form.get('contactEmail') ?? '').trim(),
        intent: { territoryExternalRef: String(form.get('territoryExternalRef') ?? '').trim() },
      });
      setState({ status: 'submitted', result });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  if (state.status === 'submitted') {
    const { company, contactVerification, nextAction } = state.result;

    return (
      <div className="space-y-4">
        <Notice variant="info" title="Check your email">
          <p>
            If delivery succeeded, a verification link is on its way. It is single use and expires
            shortly.
          </p>
        </Notice>

        {contactVerification.deliveryAccepted === false && (
          <Notice variant="warning" title="Email delivery is not connected">
            <p>
              The request was recorded, but no email could be sent in this environment. Nothing was
              verified.
            </p>
          </Notice>
        )}

        {nextAction === 'await_company_access' && (
          <Notice variant="pending" title={`${company.name} is already managed`}>
            <p>
              After you verify your email, a manager must approve your access. Verifying alone does
              not grant it, and nothing is charged.
            </p>
          </Notice>
        )}

        <Notice variant="warning" title="Nothing has been captured or charged">
          <p>
            This creates a private draft company only. Territory ownership and payment are not
            available yet.
          </p>
        </Notice>
      </div>
    );
  }

  const busy = state.status === 'submitting';

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <FormField
        id="name"
        name="name"
        label="Company name"
        required
        disabled={busy}
        autoComplete="organization"
      />
      <FormField
        id="websiteUrl"
        name="websiteUrl"
        label="Website"
        type="url"
        required
        disabled={busy}
        placeholder="https://example.com"
        hint="Must be HTTPS. One company per website."
      />
      <FormField
        id="logoUrl"
        name="logoUrl"
        label="Logo URL"
        type="url"
        disabled={busy}
        placeholder="https://example.com/logo.png"
      />
      <FormField
        id="contactEmail"
        name="contactEmail"
        label="Contact email"
        type="email"
        required
        disabled={busy}
        autoComplete="email"
        hint="Any address works, including a personal one. Management links are sent here."
      />
      {/* defaultValue, not placeholder: a placeholder is never submitted, so a
          deep link from a territory used to post an empty reference. */}
      <FormField
        id="territoryExternalRef"
        name="territoryExternalRef"
        label="Territory reference"
        required
        disabled={busy}
        {...(territoryExternalRef === null ? {} : { defaultValue: territoryExternalRef })}
        hint="Territories are not modelled yet, so this is an opaque reference."
      />

      <Button type="submit" fullWidth busy={busy} busyLabel="Submitting…">
        Claim this company
      </Button>

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
