import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { TerritoryDetail, TerritoryHistoryEntry } from '@takeover/shared';
import { OwnershipHistory } from '@/components/territory/ownership-history';
import { ErrorState } from '@/components/ui/error-state';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { describeReadFailure } from '@/lib/data/failure';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';
import { formatReign } from '@/lib/format/duration';
import { getTerritoryBySlug, getTerritoryHistory } from '@/lib/data/territories';
import { publicPageMetadata } from '@/lib/metadata';
import { buildPageTitle } from '@/lib/site';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let territory: TerritoryDetail | null;
  try {
    territory = await getTerritoryBySlug(slug);
  } catch {
    // Metadata must never take the page down; the body renders the failure.
    return { title: buildPageTitle('Territory') };
  }
  if (territory === null) return { title: buildPageTitle('Territory not found') };

  return publicPageMetadata({
    title: territory.name,
    description: territory.description,
    path: `/territory/${territory.slug}`,
  });
}

export default async function TerritoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;

  let territory: TerritoryDetail | null;
  try {
    territory = await getTerritoryBySlug(slug);
  } catch (error: unknown) {
    const failure = describeReadFailure(error, 'this territory');
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <ErrorState
          title={failure.title}
          description={<p>{failure.description}</p>}
          {...(failure.requestId === undefined ? {} : { requestId: failure.requestId })}
        />
      </div>
    );
  }

  // `notFound()` throws its own control-flow signal, so it stays outside the
  // catch above: a missing territory is a 404, not a service failure.
  if (territory === null) notFound();

  const query = await searchParams;
  const showFullHistory = query.history === 'all';

  let history: TerritoryHistoryEntry[] | null = territory.ownershipHistoryPreview;
  if (showFullHistory) {
    try {
      history = await getTerritoryHistory(slug);
    } catch {
      // The rest of the page is loaded and true; only the history is missing.
      history = null;
    }
  }

  const ownership = territory.currentOwnership;
  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <p className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
        {territory.category.name}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <PageHeader title={territory.name} />
        <StatusBadge
          tone={
            territory.status === 'unclaimed'
              ? 'info'
              : territory.status === 'disabled'
                ? 'warning'
                : 'neutral'
          }
          label={
            territory.status === 'unclaimed'
              ? 'Unclaimed'
              : territory.status === 'disabled'
                ? 'Unavailable'
                : 'Claimed'
          }
        />
      </div>

      <p className="mt-3 max-w-prose text-sm text-[var(--color-muted)]">{territory.description}</p>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Current owner</dt>
          <dd className="mt-1">
            {ownership === undefined ? (
              <span className="text-[var(--color-unclaimed)]">Unclaimed</span>
            ) : (
              <>
                <Link href={`/company/${ownership.owner.slug}`} className="hover:underline">
                  👑 {ownership.owner.name}
                </Link>
                {ownership.owner.status === 'suspended' && (
                  <span className="ml-2 text-xs text-[var(--color-destructive)]">Suspended</span>
                )}
              </>
            )}
          </dd>
        </div>

        {ownership !== undefined && (
          <>
            <div>
              <dt className="text-sm text-[var(--color-muted)]">Held for</dt>
              <dd className="mt-1">{formatReign(ownership.capturedAt, nowMs)}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-muted)]">Captured</dt>
              <dd className="mt-1 font-[family-name:var(--font-mono)] text-sm">
                {formatAbsoluteDateTime(ownership.capturedAt)}
              </dd>
            </div>
            {ownership.previousOwner !== undefined && (
              <div>
                <dt className="text-sm text-[var(--color-muted)]">Previous owner</dt>
                <dd className="mt-1">
                  <Link
                    href={`/company/${ownership.previousOwner.slug}`}
                    className="hover:underline"
                  >
                    {ownership.previousOwner.name}
                  </Link>
                </dd>
              </div>
            )}
          </>
        )}

        <div>
          <dt className="text-sm text-[var(--color-muted)]">Version</dt>
          {/* Opaque decimal string; never parsed into a number. */}
          <dd className="mt-1 font-[family-name:var(--font-mono)] text-sm break-all">
            {territory.version}
          </dd>
        </div>
      </dl>

      {territory.status === 'disabled' ? (
        <div className="mt-8">
          <Notice variant="warning" title="This territory is unavailable">
            <p>It cannot be claimed or captured right now.</p>
          </Notice>
        </div>
      ) : (
        territory.status === 'unclaimed' && (
          <div className="mt-8">
            <Link
              href={`/claim?territory=${encodeURIComponent(territory.slug)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-4 text-sm font-semibold text-[#09090b] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Claim this territory
            </Link>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Claiming registers your company and verifies your email. It does not purchase the
              territory — payment and capture are not available yet.
            </p>
          </div>
        )
      )}

      <section aria-labelledby="history-heading" className="mt-10">
        <h2
          id="history-heading"
          className="font-[family-name:var(--font-display)] text-lg font-bold"
        >
          Ownership history
        </h2>
        <div className="mt-3">
          {history === null ? (
            <ErrorState
              title="Ownership history could not be loaded"
              description={
                <p>The rest of this page is current. Reload to try the full history again.</p>
              }
            />
          ) : (
            <OwnershipHistory entries={history} />
          )}
        </div>

        {history !== null && !showFullHistory && territory.ownershipHistoryPreview.length >= 5 && (
          <Link
            href={`/territory/${territory.slug}?history=all`}
            className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface-raised)]"
          >
            Show full history
          </Link>
        )}
      </section>
    </div>
  );
}
