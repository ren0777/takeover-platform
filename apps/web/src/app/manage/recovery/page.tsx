import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';
import { RecoveryForm } from './recovery-form';

export const metadata: Metadata = {
  title: buildPageTitle('Recovery request'),
  robots: { index: false, follow: false },
};

export default function RecoveryPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Recovery request
      </h1>
      <p className="mt-2 max-w-prose text-sm text-[var(--color-muted)]">
        Use this only when no manager of the company is reachable. Recovery is recorded for manual
        review, and there is no automated approval — payment can never grant access.
      </p>
      <div className="mt-6">
        <RecoveryForm />
      </div>
    </div>
  );
}
