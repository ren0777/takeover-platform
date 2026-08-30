type TextFieldProps = {
  id: string;
  name: string;
  label: string;
  type?: 'text' | 'email' | 'url';
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
};

export function TextField({
  id,
  name,
  label,
  type = 'text',
  required = false,
  autoComplete,
  placeholder,
  hint,
  disabled = false,
}: TextFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;

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
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(hintId === undefined ? {} : { 'aria-describedby': hintId })}
        className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-[var(--color-foreground)] disabled:opacity-60"
      />
    </div>
  );
}
