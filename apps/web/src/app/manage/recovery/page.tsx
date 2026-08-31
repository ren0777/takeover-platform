import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { RecoveryForm } from './recovery-form';

export const metadata: Metadata = privatePageMetadata('Recovery request');

export default function RecoveryPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Recovery request"
        description="Use this only when no manager of the company is reachable. Recovery is recorded for manual review, and there is no automated approval — payment can never grant access."
      />
      <div className="mt-6">
        <RecoveryForm />
      </div>
    </div>
  );
}
