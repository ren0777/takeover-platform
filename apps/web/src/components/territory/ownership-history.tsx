import Link from 'next/link';
import { type TerritoryHistoryEntry } from '@takeover/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';

const SOURCE_LABEL: Record<TerritoryHistoryEntry['source'], string> = {
  // A seeded owner is a real owner and is never styled as provisional.
  initial_seed: 'Seeded',
  paid_capture: 'Captured',
};

export function OwnershipHistory({ entries }: { entries: readonly TerritoryHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No ownership history"
        description={<p>This territory has never changed hands.</p>}
      />
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-[var(--radius-tile)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">
              <Link href={`/company/${entry.owner.slug}`} className="hover:underline">
                {entry.owner.name}
              </Link>
              {entry.owner.status === 'suspended' && (
                <span className="ml-2 text-xs text-[var(--color-destructive)]">Suspended</span>
              )}
            </p>
            <span className="text-xs text-[var(--color-muted)]">{SOURCE_LABEL[entry.source]}</span>
          </div>

          <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-muted)]">
            {formatAbsoluteDateTime(entry.capturedAt)}
            {entry.endedAt === undefined
              ? ' — present'
              : ` — ${formatAbsoluteDateTime(entry.endedAt)}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
