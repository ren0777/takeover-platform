import { type ReactNode } from 'react';

type FormFieldProps = {
  id: string;
  name: string;
  label: string;
  type?: 'text' | 'email' | 'url';
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  /** Field-level validation message. Announced and linked to the input. */
  error?: string;
  inputMode?: 'text' | 'email' | 'url' | 'numeric' | 'decimal';
};

/**
 * Labelled text input.
 *
 * The label is always a real `<label>` bound by `htmlFor`; hint and error text
 * are linked through `aria-describedby` so screen readers announce them with
 * the field rather than as orphaned text.
 */
export function FormField({
  id,
  name,
  label,
  type = 'text',
  required = false,
  autoComplete,
  placeholder,
  hint,
  disabled = false,
  error,
  inputMode,
}: FormFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter((value): value is string => value !== undefined);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {!required && <span className="ml-1 text-[var(--color-muted)]">(optional)</span>}
      </label>

      {hint !== undefined && (
        <p id={hintId} className="mt-0.5 text-xs text-[var(--color-muted)]">
          {hint}
        </p>
      )}

      <input
        id={id}
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        aria-invalid={error !== undefined}
        {...(describedBy.length > 0 ? { 'aria-describedby': describedBy.join(' ') } : {})}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(inputMode === undefined ? {} : { inputMode })}
        className={[
          'mt-1 min-h-11 w-full rounded-[var(--radius-control)] border bg-[var(--color-background)]',
          'px-3 text-base text-[var(--color-foreground)] sm:text-sm',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-foreground)]',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error === undefined
            ? 'border-[var(--color-border)]'
            : 'border-[var(--color-destructive)]',
        ].join(' ')}
      />

      {error !== undefined && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-[var(--color-destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
