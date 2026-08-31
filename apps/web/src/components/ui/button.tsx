import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'affirmative';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-foreground)] text-[#09090b] font-semibold hover:opacity-90',
  secondary:
    'border border-[var(--color-border)] font-medium hover:bg-[var(--color-surface-raised)]',
  destructive: 'border border-[var(--color-destructive)] font-semibold hover:bg-[#2a1416]',
  affirmative: 'bg-[var(--color-owner)] text-[#09090b] font-semibold hover:opacity-90',
};

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  /** Shows busy text, sets aria-busy, and prevents double submission. */
  busy?: boolean;
  busyLabel?: string;
  fullWidth?: boolean;
  children: ReactNode;
};

/**
 * The single button primitive.
 *
 * `type` defaults to `button` because an unspecified button inside a form
 * submits it, which has caused accidental submissions elsewhere. Height is
 * fixed at 44px to meet the minimum touch target on mobile.
 */
export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  fullWidth = false,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy}
      className={[
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm',
        'transition-opacity duration-150 motion-reduce:transition-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-foreground)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        fullWidth ? 'w-full' : '',
        VARIANT_CLASS[variant],
      ].join(' ')}
    >
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
}
