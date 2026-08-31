/**
 * Placeholder block for content being fetched.
 *
 * `aria-hidden` because the surrounding region announces the loading state in
 * words; a screen reader gains nothing from the shapes. Pulsing is dropped
 * under reduced-motion.
 */
export function LoadingSkeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-[var(--radius-tile)] bg-[var(--color-surface-raised)] motion-reduce:animate-none ${className}`}
    />
  );
}

/** Announces a loading region in words while skeletons render inside it. */
export function LoadingRegion({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      {children}
    </div>
  );
}
