import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { buildPageTitle } from '@/lib/site';

export const metadata = { title: buildPageTitle('Territory not found') };

/** Reached when the API answers 404 for a slug, or the slug never existed. */
export default function TerritoryNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <EmptyState
        title="Territory not found"
        description={<p>No territory uses this address. It may have been renamed or removed.</p>}
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
