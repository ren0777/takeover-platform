import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { buildPageTitle } from '@/lib/site';

export const metadata = { title: buildPageTitle('Company not found') };

/** Reached when the API answers 404 for a company slug. */
export default function CompanyNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <EmptyState
        title="Company not found"
        description={<p>No company uses this address on TakeOver.</p>}
        action={
          <Link
            href="/territories"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface-raised)]"
          >
            Browse territories
          </Link>
        }
      />
    </div>
  );
}
