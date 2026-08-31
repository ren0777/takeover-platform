import Link from 'next/link';
import { type TerritoryCategory } from '@takeover/shared';

/**
 * Category filter rendered as links rather than a client-side control.
 *
 * Filtering happens on the server via a query parameter, so the board stays a
 * server component and the filter survives a page reload and a shared URL.
 */
export function CategoryFilter({
  categories,
  activeSlug,
}: {
  categories: readonly TerritoryCategory[];
  activeSlug: string | null;
}) {
  const entries = [
    { slug: null, name: 'All' },
    ...categories.map((c) => ({ slug: c.slug, name: c.name })),
  ];

  return (
    <nav aria-label="Filter territories by category">
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const isActive = entry.slug === activeSlug;
          return (
            <li key={entry.slug ?? 'all'}>
              <Link
                href={entry.slug === null ? '/territories' : `/territories?category=${entry.slug}`}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-foreground)]',
                  isActive
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)] font-semibold text-[#09090b]'
                    : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-raised)]',
                ].join(' ')}
              >
                {entry.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
