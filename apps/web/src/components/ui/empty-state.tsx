import { type ReactNode } from 'react';

/**
 * Shown when a surface legitimately has nothing to display.
 *
 * Distinct from an error: the request succeeded. Copy should say whether the
 * thing does not exist, is filtered out, or is unavailable.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-dashed border-[var(--color-border)] p-8 text-center">
      <p className="font-[family-name:var(--font-display)] font-semibold">{title}</p>
      {description !== undefined && (
        <div className="mt-1 text-sm text-[var(--color-muted)]">{description}</div>
      )}
      {action !== undefined && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
