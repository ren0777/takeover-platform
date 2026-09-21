import { LoadingRegion, LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageHeader } from '@/components/ui/page-header';

/** Enough tiles to fill the first viewport at the widest grid without a scroll. */
export const TERRITORY_BOARD_SKELETON_TILES = 12;

/**
 * Streamed by Next while `page.tsx` awaits the territory API.
 *
 * Mirrors the real page's wrapper, header and mosaic grid classes so the
 * skeleton occupies the same footprint the board will, and the swap causes no
 * layout shift. The tiles are decorative; the region announces the state.
 */
export default function TerritoriesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader title="Territories" />

      <div className="mt-6">
        <LoadingRegion label="Loading territories…">
          <ul
            aria-hidden="true"
            className="mt-4 grid auto-rows-[minmax(11rem,auto)] grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          >
            {Array.from({ length: TERRITORY_BOARD_SKELETON_TILES }, (_, index) => (
              <li key={index}>
                <LoadingSkeleton className="h-full w-full" />
              </li>
            ))}
          </ul>
        </LoadingRegion>
      </div>
    </div>
  );
}
