import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { CompanyManagement } from './company-management';

export const metadata: Metadata = privatePageMetadata('Company management');

/**
 * No URL state: the management session identifies the company, and the
 * server reports which territory that session's contact is preparing, so a
 * refresh, a management-link login, or a second tab all land on the same
 * preparation.
 */
export default function CompanyManagementPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title="Company management" />
      <div className="mt-6">
        <CompanyManagement />
      </div>
    </div>
  );
}
