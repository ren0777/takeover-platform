import { type ReactNode } from 'react';

/**
 * The single `<h1>` for a route, with optional supporting copy.
 *
 * Centralised so every page keeps one top-level heading and a consistent
 * measure for readable prose.
 */
export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-balance">
        {title}
      </h1>
      {description !== undefined && (
        <p className="mt-2 max-w-prose text-sm text-[var(--color-muted)]">{description}</p>
      )}
    </header>
  );
}
