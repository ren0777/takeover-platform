import { SITE } from '@/lib/site';

export default function HomePage() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6 py-16"
      id="main-content"
    >
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
        Phase 0 foundation
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{SITE.name}</h1>
      <p className="text-xl text-[var(--color-muted)]">{SITE.tagline}</p>
      <p className="max-w-xl border-l border-[var(--color-border)] pl-4 text-sm leading-6 text-[var(--color-muted)]">
        The territory board and capture flow are planned. This deployment currently verifies only
        the independent web foundation.
      </p>
    </main>
  );
}
