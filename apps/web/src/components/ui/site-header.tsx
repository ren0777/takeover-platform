import Link from 'next/link';
import { SITE } from '@/lib/site';

/**
 * Brand header and primary navigation.
 *
 * Only links to destinations that actually exist. Leaderboard, battles, and
 * seasons are absent because those routes are not built; a nav item pointing at
 * a 404 is worse than no nav item.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-border)]">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6"
      >
        <Link
          href="/"
          className="rounded-[var(--radius-control)] font-[family-name:var(--font-display)] text-lg font-bold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-foreground)]"
        >
          {SITE.name}
        </Link>

        <ul className="flex items-center gap-1">
          <li>
            <Link
              href="/territories"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Territories
            </Link>
          </li>
          <li>
            <Link
              href="/manage"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Manage
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
