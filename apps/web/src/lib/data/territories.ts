import {
  type TerritoryCategory,
  type TerritoryDetail,
  type TerritoryHistoryEntry,
  type TerritorySummary,
} from '@takeover/shared';
import {
  detailFor,
  historyFor,
  TERRITORY_CATEGORY_FIXTURES,
  TERRITORY_FIXTURES,
} from '@/lib/fixtures/territories';
import { resolveSource } from '@/lib/data/source';

/**
 * Pages depend on these functions, never on fixtures or fetch directly.
 * When `resolveSource` returns 'live', the fixture branch is replaced here and
 * nowhere else.
 */

function notImplemented(resource: string): never {
  throw new Error(`Live ${resource} source is not implemented yet`);
}

export async function getTerritories(): Promise<TerritorySummary[]> {
  if (resolveSource('territories') === 'fixture') return TERRITORY_FIXTURES;
  return notImplemented('territories');
}

export async function getTerritoryCategories(): Promise<TerritoryCategory[]> {
  if (resolveSource('territories') === 'fixture') return TERRITORY_CATEGORY_FIXTURES;
  return notImplemented('territory categories');
}

export async function getTerritoryBySlug(slug: string): Promise<TerritoryDetail | null> {
  if (resolveSource('territories') !== 'fixture') return notImplemented('territory detail');

  const summary = TERRITORY_FIXTURES.find((territory) => territory.slug === slug);
  return summary === undefined ? null : detailFor(summary);
}

export async function getTerritoryHistory(slug: string): Promise<TerritoryHistoryEntry[]> {
  if (resolveSource('territory-history') !== 'fixture') return notImplemented('territory history');
  return historyFor(slug);
}
