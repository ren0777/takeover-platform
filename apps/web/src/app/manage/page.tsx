import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { ManageEntry } from './manage-entry';

export const metadata: Metadata = privatePageMetadata('Manage your company');

export default function ManagePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title="Manage your company" />
      <div className="mt-6">
        <ManageEntry />
      </div>
    </div>
  );
}
