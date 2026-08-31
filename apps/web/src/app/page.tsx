import Link from 'next/link';
import { SITE } from '@/lib/site';

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <p className="font-[family-name:var(--font-mono)] text-xs tracking-[0.2em] text-[var(--color-muted)] uppercase">
        Foundation
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        {SITE.name}
      </h1>
      <p className="text-xl text-[var(--color-muted)]">{SITE.tagline}</p>
      <p className="max-w-xl border-l border-[var(--color-border)] pl-4 text-sm leading-6 text-[var(--color-muted)]">
        The territory board and capture flow are not built yet. Company identity is, so a company
        can be claimed and managed today — without an account or a password.
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/claim"
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-4 text-sm font-semibold text-[#09090b] transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-foreground)] motion-reduce:transition-none"
        >
          Claim a company
        </Link>
        <Link
          href="/manage"
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-foreground)]"
        >
          Manage your company
        </Link>
      </div>
    </div>
  );
}
