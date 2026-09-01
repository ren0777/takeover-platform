import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CompanyTerritories } from '@takeover/shared';
import { TerritoryMosaic } from '@/components/territory/territory-mosaic';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getCompanyTerritories } from '@/lib/data/companies';
import { describeReadFailure } from '@/lib/data/failure';
import { publicPageMetadata } from '@/lib/metadata';
import { buildPageTitle } from '@/lib/site';

type PageProps = { params: Promise<{ slug: string }> };

const COMPANY_TONE = {
  active: 'positive',
  suspended: 'danger',
  archived: 'neutral',
} as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let held: CompanyTerritories | null;
  try {
    held = await getCompanyTerritories(slug);
  } catch {
    // Metadata must never take the page down; the body renders the failure.
    return { title: buildPageTitle('Company') };
  }
  if (held === null) return { title: buildPageTitle('Company not found') };

  return publicPageMetadata({
    title: held.company.name,
    description: `${held.company.name} controls ${held.currentTerritoryCount} territories on TakeOver.`,
    path: `/company/${held.company.slug}`,
  });
}

export default async function CompanyPage({ params }: PageProps) {
  const { slug } = await params;

  let held: CompanyTerritories | null;
  try {
    held = await getCompanyTerritories(slug);
  } catch (error: unknown) {
    const failure = describeReadFailure(error, 'this company');
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <ErrorState
          title={failure.title}
          description={<p>{failure.description}</p>}
          {...(failure.requestId === undefined ? {} : { requestId: failure.requestId })}
        />
      </div>
    );
  }

  // A company that does not exist is a 404, not a service failure, so
  // `notFound()` stays outside the catch above.
  if (held === null) notFound();

  const { company, currentTerritoryCount, territories } = held;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={company.name} />
        <StatusBadge
          tone={COMPANY_TONE[company.status]}
          label={
            company.status === 'active'
              ? 'Active'
              : company.status === 'suspended'
                ? 'Suspended'
                : 'Archived'
          }
        />
      </div>

      <p className="mt-2 text-sm text-[var(--color-muted)]">
        <a href={company.websiteUrl} rel="nofollow noopener noreferrer" className="hover:underline">
          {company.websiteUrl}
        </a>
      </p>

      {company.status === 'suspended' && (
        <p className="mt-3 max-w-prose text-sm text-[var(--color-destructive)]">
          This company is suspended. It remains publicly named, and suspension does not change who
          owns a territory.
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Territories held</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)] text-3xl">
            {currentTerritoryCount}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Verification</dt>
          <dd className="mt-1 text-sm">
            {company.verificationLevels.length === 0
              ? 'None'
              : company.verificationLevels.map((level) => level.replace(/_/g, ' ')).join(', ')}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="holdings-heading" className="mt-10">
        <h2
          id="holdings-heading"
          className="font-[family-name:var(--font-display)] text-lg font-bold"
        >
          Territory holdings
        </h2>
        <div className="mt-4">
          {territories.length === 0 ? (
            <EmptyState
              title="No territories held"
              description={<p>This company does not currently control any territory.</p>}
            />
          ) : (
            <TerritoryMosaic territories={territories} />
          )}
        </div>
      </section>
    </div>
  );
}
