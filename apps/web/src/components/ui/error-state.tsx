import { type ReactNode } from 'react';

/**
 * Terminal failure surface for a whole region or route.
 *
 * `role="alert"` so the failure is announced. The request id is rendered in the
 * mono face so it stays copyable for support.
 */
export function ErrorState({
  title,
  description,
  requestId,
  action,
}: {
  title: string;
  description?: ReactNode;
  requestId?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-control)] border border-[var(--color-destructive)] bg-[var(--color-surface)] p-4"
    >
      <p className="font-[family-name:var(--font-display)] font-semibold">{title}</p>
      {description !== undefined && <div className="mt-1 text-sm">{description}</div>}
      {requestId !== undefined && (
        <p className="mt-2 font-[family-name:var(--font-mono)] text-xs break-all text-[var(--color-muted)]">
          Reference {requestId}
        </p>
      )}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
