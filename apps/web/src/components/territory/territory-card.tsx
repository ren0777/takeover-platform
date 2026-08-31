import Link from 'next/link';
import { type CSSProperties } from 'react';
import { type TerritorySummary } from '@takeover/shared';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { type TerritoryTier } from '@/lib/board/tiers';
import { sanitizeAccentColor } from '@/lib/format/color';
import { formatReign } from '@/lib/format/duration';

type StatusPresentation = { label: string; tone: BadgeTone };

const STATUS: Record<TerritorySummary['status'], StatusPresentation> = {
  unclaimed: { label: 'Unclaimed', tone: 'info' },
  claimed: { label: 'Claimed', tone: 'neutral' },
  disabled: { label: 'Unavailable', tone: 'warning' },
};

type TerritoryCardProps = {
  territory: TerritorySummary;
  tier: TerritoryTier;
  /** Injected so the whole board renders from one clock and stays deterministic. */
  nowMs: number;
};

/**
 * A single mosaic tile.
 *
 * Deliberately a server component with no interactive state: the whole action
 * is a link, so a board of 100+ tiles ships no per-tile JavaScript.
 *
 * No price appears anywhere. Phase 2 publishes no money field, so the action
 * must not imply an amount it cannot show.
 */
export function TerritoryCard({ territory, tier, nowMs }: TerritoryCardProps) {
  const status = STATUS[territory.status];
  const accent = sanitizeAccentColor(territory.visualMetadata.accentColor);
  const isFlagship = tier === 'flagship';
  const ownership = territory.currentOwnership;
  const isDisabled = territory.status === 'disabled';

  // Decorative only: the accent tints a corner bleed, never text or state.
  const style: CSSProperties | undefined =
    accent === null ? undefined : ({ ['--tile-accent']: accent } as CSSProperties);

  return (
    <article
      style={style}
      className="relative flex h-full flex-col justify-between overflow-hidden rounded-[var(--radius-tile)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      {accent !== null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
          style={{ background: 'var(--tile-accent)' }}
        />
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={[
              'font-[family-name:var(--font-display)] font-semibold tracking-tight text-balance',
              isFlagship ? 'text-2xl' : 'text-base',
            ].join(' ')}
          >
            <Link
              href={`/territory/${territory.slug}`}
              className="rounded-[var(--radius-control)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-foreground)]"
            >
              {territory.name}
            </Link>
          </h3>
          <StatusBadge tone={status.tone} label={status.label} />
        </div>

        <p className="mt-1 text-xs tracking-wide text-[var(--color-muted)] uppercase">
          {territory.category.name}
        </p>

        <p className="mt-3 text-sm">
          {ownership === undefined ? (
            <span className="text-[var(--color-unclaimed)]">No owner yet</span>
          ) : (
            <>
              <span aria-hidden="true">👑 </span>
              <Link
                href={`/company/${ownership.owner.slug}`}
                className="font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {ownership.owner.name}
              </Link>
              {ownership.owner.status === 'suspended' && (
                <span className="ml-2 text-xs text-[var(--color-destructive)]">Suspended</span>
              )}
            </>
          )}
        </p>

        {ownership !== undefined && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Held for {formatReign(ownership.capturedAt, nowMs)}
          </p>
        )}
      </div>

      <div className="relative mt-4">
        {isDisabled ? (
          // A disabled territory offers no action rather than a dead control.
          <p className="text-xs text-[var(--color-muted)]">
            This territory is not available right now.
          </p>
        ) : (
          <Link
            href={
              territory.status === 'unclaimed'
                ? `/claim?territory=${encodeURIComponent(territory.slug)}`
                : `/territory/${territory.slug}`
            }
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 text-sm font-semibold hover:bg-[var(--color-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-foreground)]"
          >
            {territory.status === 'unclaimed' ? 'Claim this territory' : 'View territory'}
          </Link>
        )}
      </div>
    </article>
  );
}
