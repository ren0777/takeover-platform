export type BadgeTone = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-[var(--color-border)] text-[var(--color-muted)]',
  info: 'border-[var(--color-unclaimed)] text-[var(--color-unclaimed)]',
  positive: 'border-[var(--color-owner)] text-[var(--color-owner)]',
  warning: 'border-[var(--color-warning)] text-[var(--color-warning)]',
  danger: 'border-[var(--color-destructive)] text-[var(--color-destructive)]',
};

/**
 * Compact status pill.
 *
 * Tone is an accent only: the label always carries the meaning, so status is
 * never communicated by colour alone.
 */
export function StatusBadge({ tone = 'neutral', label }: { tone?: BadgeTone; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
