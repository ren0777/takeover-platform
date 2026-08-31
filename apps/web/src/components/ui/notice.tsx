import { type ReactNode } from 'react';

export type NoticeVariant = 'info' | 'warning' | 'error' | 'pending';

const VARIANT_BORDER: Record<NoticeVariant, string> = {
  info: 'border-[var(--color-border)]',
  warning: 'border-[var(--color-warning)]',
  error: 'border-[var(--color-destructive)]',
  pending: 'border-[var(--color-challenger)]',
};

type NoticeProps = {
  variant: NoticeVariant;
  title: string;
  children?: ReactNode;
  /** Rendered in mono so a support reference stays copyable. */
  requestId?: string;
};

/**
 * Status surface for identity flows.
 *
 * Variant is a visual accent only — the title and body always carry the meaning,
 * so state is never communicated by colour alone.
 */
export function Notice({ variant, title, children, requestId }: NoticeProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-[var(--radius-control)] border bg-[var(--color-surface)] p-4 ${VARIANT_BORDER[variant]}`}
    >
      <p className="font-[family-name:var(--font-display)] font-semibold">{title}</p>
      {children !== undefined && <div className="mt-1 text-sm">{children}</div>}
      {requestId !== undefined && (
        <p className="mt-2 font-[family-name:var(--font-mono)] text-xs text-[var(--color-muted)]">
          Reference {requestId}
        </p>
      )}
    </div>
  );
}
