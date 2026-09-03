import {
  type TerritoryCategory,
  type TerritoryDetail,
  type TerritoryHistoryEntry,
  type TerritoryListQuery,
  type TerritorySummary,
} from '@takeover/shared';
import {
  fetchTerritories,
  fetchTerritoryCategories,
  fetchTerritoryDetail,
  fetchTerritoryHistory,
} from '@/lib/api/territories';
import { ApiRequestError } from '@/lib/api/client';
import { resolveSource } from '@/lib/data/source';

/**
 * The only territory data entry points.
 *
 * Pages depend on these and never on fixtures or `fetch` directly, so moving a
 * resource to the live API is a change here and nowhere else. Each function
 * dispatches on its own resource, so resources go live one at a time.
 *
 * Fixtures are imported lazily so a production bundle that never selects them
 * does not pull development data into the module graph.
 */

async function fixtures() {
  return import('@/lib/fixtures/territories');
}

/**
 * A page of results plus the cursor that continues it.
 *
 * The paginated reads carry `meta.nextCursor`, and the whole point of parsing
 * the envelope rather than `data` alone is that the cursor is not thrown away
 * between the API and this layer. Fixtures are a single page and report no
 * cursor, which is true of them rather than a placeholder.
 */
export type Page<T> = {
  items: T[];
  nextCursor: string | undefined;
};

export async function getTerritoryCategories(): Promise<TerritoryCategory[]> {
  if (resolveSource('territory-categories') === 'live') {
    return fetchTerritoryCategories();
  }

  const { TERRITORY_CATEGORY_FIXTURES } = await fixtures();
  return TERRITORY_CATEGORY_FIXTURES;
}

export async function getTerritoryPage(
  query: Partial<TerritoryListQuery> = {},
): Promise<Page<TerritorySummary>> {
  if (resolveSource('territory-list') === 'live') {
    const page = await fetchTerritories(query);
    return { items: page.data, nextCursor: page.meta.nextCursor ?? undefined };
  }

  const { TERRITORY_FIXTURES } = await fixtures();
  return { items: TERRITORY_FIXTURES, nextCursor: undefined };
}

export async function getTerritories(
  query: Partial<TerritoryListQuery> = {},
): Promise<TerritorySummary[]> {
  return (await getTerritoryPage(query)).items;
}

export async function getTerritoryBySlug(slug: string): Promise<TerritoryDetail | null> {
  if (resolveSource('territory-detail') === 'live') {
    try {
      return await fetchTerritoryDetail(slug);
    } catch (error: unknown) {
      // A missing territory is a legitimate 404, not a failure to surface.
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  }

  const { detailFor, TERRITORY_FIXTURES } = await fixtures();
  const summary = TERRITORY_FIXTURES.find((territory) => territory.slug === slug);
  return summary === undefined ? null : detailFor(summary);
}

export async function getTerritoryHistoryPage(
  slug: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<Page<TerritoryHistoryEntry>> {
  if (resolveSource('territory-history') === 'live') {
    const page = await fetchTerritoryHistory(slug, query);
    return { items: page.data, nextCursor: page.meta.nextCursor ?? undefined };
  }

  const { historyFor } = await fixtures();
  return { items: historyFor(slug), nextCursor: undefined };
}

export async function getTerritoryHistory(slug: string): Promise<TerritoryHistoryEntry[]> {
  return (await getTerritoryHistoryPage(slug)).items;
}
