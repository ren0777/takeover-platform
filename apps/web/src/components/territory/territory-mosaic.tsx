import { type TerritorySummary } from '@takeover/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { orderForMosaic, tierForDisplayWeight, type TerritoryTier } from '@/lib/board/tiers';
import { TerritoryCard } from './territory-card';

const TIER_SPAN: Record<TerritoryTier, string> = {
  flagship: 'col-span-2 row-span-2',
  major: 'col-span-2 row-span-1',
  standard: 'col-span-1 row-span-1',
};

/**
 * Value Mosaic: tile size encodes territory importance via the authoritative
 * `displayWeight`.
 *
 * Position and physical adjacency carry NO gameplay meaning. Layout is pure CSS
 * grid with dense packing, so the board is fully server-rendered with no layout
 * measurement and no cumulative layout shift.
 *
 * At the two-column base this collapses into the approved ranked feed:
 * flagship and major become full width, standard half width, and the board
 * never scrolls horizontally.
 */
export function TerritoryMosaic({ territories }: { territories: readonly TerritorySummary[] }) {
  if (territories.length === 0) {
    return (
      <EmptyState
        title="No territories to show"
        description={<p>Nothing matches the current filter.</p>}
      />
    );
  }

  const ordered = orderForMosaic(territories);
  const nowMs = Date.now();

  return (
    <ul className="grid auto-rows-[minmax(11rem,auto)] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {ordered.map((territory) => {
        const tier = tierForDisplayWeight(territory.displayWeight);
        return (
          <li key={territory.slug} className={TIER_SPAN[tier]}>
            <TerritoryCard territory={territory} tier={tier} nowMs={nowMs} />
          </li>
        );
      })}
    </ul>
  );
}
