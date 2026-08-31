export type TerritoryTier = 'flagship' | 'major' | 'standard';

/**
 * Mosaic tile size, derived only from the backend-authoritative `displayWeight`.
 *
 * There is deliberately no price-derived fallback: Phase 2 publishes no money
 * field, and tile prominence must never be a frontend-invented property. The
 * bands are presentation guidance, not backend enums — `displayWeight` itself
 * carries no price, ownership, volume, company-size, or adjacency meaning.
 */
const FLAGSHIP_FLOOR = 80;
const MAJOR_FLOOR = 50;

export function tierForDisplayWeight(displayWeight: number): TerritoryTier {
  if (displayWeight >= FLAGSHIP_FLOOR) return 'flagship';
  if (displayWeight >= MAJOR_FLOOR) return 'major';
  return 'standard';
}

/**
 * Orders territories for the mosaic.
 *
 * Ties break on slug so the server and client render an identical layout, and
 * the input array is never mutated.
 */
export function orderForMosaic<T extends { slug: string; displayWeight: number }>(
  territories: readonly T[],
): T[] {
  return [...territories].sort((left, right) => {
    const delta = right.displayWeight - left.displayWeight;
    return delta !== 0 ? delta : left.slug.localeCompare(right.slug);
  });
}
