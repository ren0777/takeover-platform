'use client';

import Link from 'next/link';
import { type AttemptStatus } from '@takeover/shared';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { canStartNewCheckout, describeAttemptState } from '@/lib/takeover/describe-state';
import { useTakeoverStatus } from '@/lib/takeover/use-takeover-status';

/**
 * Renders one attempt's authoritative status.
 *
 * Everything shown comes from the server response. This component receives no
 * query parameters and has no way to reach them, which is the point: a browser
 * returning from the payment provider carries no authority whatsoever.
 */
export function TakeoverStatusView({
  statusToken,
  initialStatus,
}: {
  statusToken: string;
  initialStatus: AttemptStatus;
}) {
  const { status, refreshing, couldNotRefresh, stoppedWaiting, refresh } = useTakeoverStatus(
    statusToken,
    initialStatus,
  );

  const current = status ?? initialStatus;
  const presentation = describeAttemptState(current.state);
  const mayRestart = canStartNewCheckout(current);

  return (
    <div>
      {/* Polite live region: state changes are announced once, and a poll that
          changes nothing announces nothing. */}
      <div role="status" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
            {presentation.title}
          </h1>
          <StatusBadge tone={presentation.tone} label={presentation.badgeLabel} />
        </div>

        <p className="mt-3 max-w-prose text-sm text-[var(--color-muted)]">{presentation.body}</p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {current.amountCharged !== undefined && (
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Amount charged</dt>
            <dd className="mt-1 font-[family-name:var(--font-mono)] text-lg">
              {formatMoney(current.amountCharged)}
              <span className="sr-only"> {current.amountCharged.currency}</span>
            </dd>
          </div>
        )}
        {current.capturedAt !== undefined && (
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Captured</dt>
            <dd className="mt-1 font-[family-name:var(--font-mono)] text-sm">
              {formatAbsoluteDateTime(current.capturedAt)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Last updated</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)] text-sm">
            {formatAbsoluteDateTime(current.updatedAt)}
          </dd>
        </div>
        {presentation.showSupportReference && (
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Reference</dt>
            <dd className="mt-1 font-[family-name:var(--font-mono)] text-sm break-all">
              {current.checkoutId}
            </dd>
          </div>
        )}
      </dl>

      {couldNotRefresh && (
        <div className="mt-6">
          <Notice variant="warning" title="Could not refresh just now">
            <p>
              This is the last status we were given, not a new one. Nothing above has changed
              because of the failed check.
            </p>
          </Notice>
        </div>
      )}

      {stoppedWaiting && (
        <div className="mt-6">
          <Notice variant="pending" title="Still working on it">
            <p>
              This is taking longer than usual, so we stopped checking automatically. Nothing has
              gone wrong that we know of — refresh to check again.
            </p>
          </Notice>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {!current.terminal && (
          <Button variant="secondary" onClick={refresh} busy={refreshing} busyLabel="Checking…">
            Refresh now
          </Button>
        )}
        {mayRestart && (
          <Link
            href="/territories"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface-raised)]"
          >
            Browse territories
          </Link>
        )}
        <Link
          href="/territories"
          className="inline-flex min-h-11 items-center px-1 text-sm text-[var(--color-muted)] hover:underline"
        >
          Back to territories
        </Link>
      </div>
    </div>
  );
}
