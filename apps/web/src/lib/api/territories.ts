import {
  companyPublicSummarySchema,
  companyTerritoriesSchema,
  territoryCategorySchema,
  territoryDetailSchema,
  territoryHistoryPageSchema,
  territoryPageSchema,
  type CompanyPublicSummary,
  type CompanyTerritories,
  type TerritoryCategory,
  type TerritoryDetail,
  type TerritoryHistoryPage,
  type TerritoryListQuery,
  type TerritoryPage,
} from '@takeover/shared';
import { apiRequest, apiRequestEnvelope, arrayOf } from '@/lib/api/client';
import { TERRITORY_API_PATHS } from '@/lib/api/territory-paths';

/**
 * Re-exported so callers and tests keep a single import for the read client
 * and the paths it uses. The table itself lives in a dependency-free module so
 * the contract smoke script can load it under plain Node.
 */
export { TERRITORY_API_PATHS };

/**
 * Typed read client for the public territory API.
 *
 * IMPORTANT: none of these run in production yet. They are reached only when
 * `resolveSource` reports `live` for their resource, and every resource
 * currently defaults to `fixture`. Nothing here creates a route; these are the
 * client halves waiting for endpoints to exist.
 *
 * Every request and response shape comes from `@takeover/shared`. No contract
 * is restated here.
 */

function listQueryString(query: Partial<TerritoryListQuery>): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  if (query.category !== undefined) params.set('category', query.category);
  if (query.status !== undefined) params.set('status', query.status);

  const encoded = params.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

/** Categories. The contract publishes an item shape but no list wrapper. */
export function fetchTerritoryCategories(): Promise<TerritoryCategory[]> {
  return apiRequest({
    method: 'GET',
    path: TERRITORY_API_PATHS.categories,
    schema: arrayOf(territoryCategorySchema),
  });
}

/**
 * Territory list. Parsed as a full envelope because `territoryPageSchema`
 * makes `meta` required and carries the pagination cursor.
 */
export function fetchTerritories(query: Partial<TerritoryListQuery> = {}): Promise<TerritoryPage> {
  return apiRequestEnvelope({
    method: 'GET',
    path: `${TERRITORY_API_PATHS.territories}${listQueryString(query)}`,
    schema: territoryPageSchema,
  });
}

export function fetchTerritoryDetail(slug: string): Promise<TerritoryDetail> {
  return apiRequest({
    method: 'GET',
    path: TERRITORY_API_PATHS.territoryDetail(slug),
    schema: territoryDetailSchema,
  });
}

/**
 * Territory history. Also a full-envelope parse: `territoryHistoryPageSchema`
 * requires `meta`, and dropping it would silently lose the cursor.
 */
export function fetchTerritoryHistory(
  slug: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<TerritoryHistoryPage> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const encoded = params.toString();

  return apiRequestEnvelope({
    method: 'GET',
    path: `${TERRITORY_API_PATHS.territoryHistory(slug)}${encoded.length > 0 ? `?${encoded}` : ''}`,
    schema: territoryHistoryPageSchema,
  });
}

export function fetchPublicCompany(slug: string): Promise<CompanyPublicSummary> {
  return apiRequest({
    method: 'GET',
    path: TERRITORY_API_PATHS.company(slug),
    schema: companyPublicSummarySchema,
  });
}

export function fetchCompanyTerritories(slug: string): Promise<CompanyTerritories> {
  return apiRequest({
    method: 'GET',
    path: TERRITORY_API_PATHS.companyTerritories(slug),
    schema: companyTerritoriesSchema,
  });
}
