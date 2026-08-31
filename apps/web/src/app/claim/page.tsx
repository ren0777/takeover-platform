import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { ClaimForm } from './claim-form';

export const metadata: Metadata = privatePageMetadata('Claim a company');

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClaimPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = query.territory;
  const territoryExternalRef = typeof raw === 'string' && raw.length > 0 ? raw : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Claim a company"
        description="No account and no password. Enter your company details and verify your email — that creates a private draft. Capturing territory is a separate step that is not available yet."
      />
      <div className="mt-6">
        <ClaimForm territoryExternalRef={territoryExternalRef} />
      </div>
    </div>
  );
}
