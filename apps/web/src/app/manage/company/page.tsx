import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';
import { CompanyManagement } from './company-management';

export const metadata: Metadata = {
  title: buildPageTitle('Company management'),
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyManagementPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const rawIntentId = query.intentId;
  const intentId = typeof rawIntentId === 'string' && rawIntentId.length > 0 ? rawIntentId : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Company management
      </h1>
      <div className="mt-6">
        <CompanyManagement intentId={intentId} />
      </div>
    </div>
  );
}
