'use client';

import { ErrorState } from '@/components/ui/error-state';

/**
 * Last-resort boundary for a failure a page did not catch itself.
 *
 * The public reads render their own honest failure states; this catches what
 * escapes them (a throw in metadata, a misconfiguration, a render bug). Next
 * strips server error messages in production and leaves only `digest`, so the
 * copy stays truthful without pretending to know the cause.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <ErrorState
        title="This page could not be loaded"
        description={
          <p>Nothing shown here is stale — the data never arrived. Try again in a moment.</p>
        }
        {...(error.digest === undefined ? {} : { requestId: error.digest })}
        action={
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface-raised)]"
          >
            Try again
          </button>
        }
      />
    </div>
  );
}
