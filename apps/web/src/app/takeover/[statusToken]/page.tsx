import type { Metadata } from 'next';
import { type AttemptStatus } from '@takeover/shared';
import { TakeoverStatusView } from '@/components/territory/takeover-status-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { getTakeoverStatus } from '@/lib/data/takeover';
import { describeReadFailure } from '@/lib/data/failure';
import { privatePageMetadata } from '@/lib/metadata';

export const metadata: Metadata = privatePageMetadata('Takeover status');

/**
 * The authoritative status surface for one takeover attempt, and the target
 * the payment provider returns the browser to.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **The URL carries no authority.** `searchParams` is deliberately not read
 *    — not to display, not to branch on, not to log. A provider that appends
 *    `?status=succeeded` changes nothing, and a person who types this URL cold
 *    sees exactly what a returning payer sees.
 * 2. **It works cold.** Authorisation is the opaque status token in the path,
 *    so a payer with no management session, in a different browser, on another
 *    device, can still see what happened to their money.
 */
type PageProps = { params: Promise<{ statusToken: string }> };

export default async function TakeoverStatusPage({ params }: PageProps) {
  const { statusToken } = await params;

  let status: AttemptStatus | null;
  try {
    status = await getTakeoverStatus(statusToken);
  } catch (error: unknown) {
    // An outage is not an outcome. Say we could not check, never that it failed.
    const failure = describeReadFailure(error, 'this takeover');
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <ErrorState
          title={failure.title}
          description={
            <p>
              {failure.description} Your payment is unaffected by this page failing to load — this
              is only a status check.
            </p>
          }
          {...(failure.requestId === undefined ? {} : { requestId: failure.requestId })}
        />
      </div>
    );
  }

  if (status === null) {
    // Unknown, expired, or revoked token. Emphatically not a failed payment.
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <EmptyState
          title="We cannot identify this takeover"
          description={
            <p>
              This link is unknown, expired, or no longer valid. That does not mean a payment failed
              — it means we cannot look it up from this link. If you paid and need the outcome,
              contact support with the link you used.
            </p>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <TakeoverStatusView statusToken={statusToken} initialStatus={status} />
    </div>
  );
}
