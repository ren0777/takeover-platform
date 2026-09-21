'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { type CompanyClaimResult, type TerritorySummary } from '@takeover/shared';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { ApiRequestError } from '@/lib/api/client';
import { beginCompanyClaim } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { VerificationResend } from './verification-resend';

type ClaimState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'submitted'; result: CompanyClaimResult; contactEmail: string }
  | { status: 'failed'; code: string; requestId: string | undefined };

/** The board's territory, resolved by the page: name and state come from the server. */
export type SelectedTerritory = Pick<TerritorySummary, 'name' | 'slug' | 'status'> & {
  category: Pick<TerritorySummary['category'], 'name' | 'slug'>;
};

const TERRITORY_STATUS: Record<SelectedTerritory['status'], { label: string; tone: BadgeTone }> = {
  unclaimed: { label: 'Unclaimed', tone: 'info' },
  claimed: { label: 'Claimed', tone: 'neutral' },
  disabled: { label: 'Unavailable', tone: 'warning' },
};

export function ClaimForm({ territory }: { territory: SelectedTerritory }) {
  const [state, setState] = useState<ClaimState>({ status: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const logoUrl = String(form.get('logoUrl') ?? '').trim();
    const contactEmail = String(form.get('contactEmail') ?? '').trim();

    setState({ status: 'submitting' });
    try {
      const result = await beginCompanyClaim({
        company: {
          name: String(form.get('name') ?? '').trim(),
          websiteUrl: String(form.get('websiteUrl') ?? '').trim(),
          ...(logoUrl.length > 0 ? { logoUrl } : {}),
        },
        contactEmail,
        intent: { territoryExternalRef: territory.slug },
      });
      // The result carries no contact email; resending the verification
      // needs the exact address this claim was submitted with.
      setState({ status: 'submitted', result, contactEmail });
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

        <VerificationResend companyId={company.id} contactEmail={state.contactEmail} />
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
      {/* The territory is chosen on the board, never typed here. The hidden
          field carries it through the form post; the summary shows it. */}
      <input type="hidden" name="territoryExternalRef" value={territory.slug} />
      <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-4 text-sm">
        <p className="text-[var(--color-muted)]">Selected territory</p>
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <Link href={`/territory/${territory.slug}`} className="font-medium underline">
            {territory.name}
          </Link>
          <span className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
            {territory.category.name}
          </span>
          <StatusBadge
            tone={TERRITORY_STATUS[territory.status].tone}
            label={TERRITORY_STATUS[territory.status].label}
          />
        </p>
        <p className="mt-2 text-[var(--color-muted)]">
          It stays attached to your company through email verification and appears under takeover
          preparation once you can manage the company.
        </p>
      </div>

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
