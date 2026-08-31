import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { CompanyManagement } from './company-management';

export const metadata: Metadata = privatePageMetadata('Company management');

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyManagementPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const rawIntentId = query.intentId;
  const intentId = typeof rawIntentId === 'string' && rawIntentId.length > 0 ? rawIntentId : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title="Company management" />
      <div className="mt-6">
        <CompanyManagement intentId={intentId} />
      </div>
    </div>
  );
}
