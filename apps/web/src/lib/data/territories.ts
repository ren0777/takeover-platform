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

export async function getTerritoryCategories(): Promise<TerritoryCategory[]> {
  if (resolveSource('territory-categories') === 'live') {
    return fetchTerritoryCategories();
  }

  const { TERRITORY_CATEGORY_FIXTURES } = await fixtures();
  return TERRITORY_CATEGORY_FIXTURES;
}

export async function getTerritories(
  query: Partial<TerritoryListQuery> = {},
): Promise<TerritorySummary[]> {
  if (resolveSource('territory-list') === 'live') {
    const page = await fetchTerritories(query);
    return page.data;
  }

  const { TERRITORY_FIXTURES } = await fixtures();
  return TERRITORY_FIXTURES;
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

export async function getTerritoryHistory(slug: string): Promise<TerritoryHistoryEntry[]> {
  if (resolveSource('territory-history') === 'live') {
    const page = await fetchTerritoryHistory(slug);
    return page.data;
  }

  const { historyFor } = await fixtures();
  return historyFor(slug);
}
