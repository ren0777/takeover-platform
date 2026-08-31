import Link from 'next/link';
import { SITE } from '@/lib/site';

/**
 * Minimal brand header.
 *
 * Carries only the wordmark on purpose: no public product section exists yet,
 * and linking to routes that are not built would be a dead end. Navigation
 * items are added as their destinations ship.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="rounded-[var(--radius-control)] font-[family-name:var(--font-display)] text-lg font-bold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-foreground)]"
        >
          {SITE.name}
        </Link>
      </div>
    </header>
  );
}
