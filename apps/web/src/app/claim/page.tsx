import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';
import { ClaimForm } from './claim-form';

export const metadata: Metadata = {
  title: buildPageTitle('Claim a company'),
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClaimPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = query.territory;
  const territoryExternalRef = typeof raw === 'string' && raw.length > 0 ? raw : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Claim a company
      </h1>
      <p className="mt-2 max-w-prose text-sm text-[var(--color-muted)]">
        No account and no password. Enter your company details and verify your email — that creates
        a private draft. Capturing territory is a separate step that is not available yet.
      </p>
      <div className="mt-6">
        <ClaimForm territoryExternalRef={territoryExternalRef} />
      </div>
    </div>
  );
}
