import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';
import { ManageEntry } from './manage-entry';

export const metadata: Metadata = {
  title: buildPageTitle('Manage your company'),
  robots: { index: false, follow: false },
};

export default function ManagePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Manage your company
      </h1>
      <div className="mt-6">
        <ManageEntry />
      </div>
    </div>
  );
}
