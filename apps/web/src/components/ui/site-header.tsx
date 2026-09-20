import Link from 'next/link';
import { SITE } from '@/lib/site';

/**
 * Brand header and primary navigation.
 *
 * Public navigation follows the implemented V1 routes.
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

        <ul className="flex flex-wrap items-center gap-1">
          {[
            ['/leaderboard', 'Leaderboard'], ['/activity', 'Activity'],
            ['/seasons', 'Seasons'], ['/hall-of-fame', 'Hall of Fame'],
          ].map(([href, label]) => (
            <li key={href}><Link href={href!} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2">{label}</Link></li>
          ))}
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
