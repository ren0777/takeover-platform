export type DataResource = 'territories' | 'territory-history' | 'company-territories';
export type DataSourceMode = 'fixture' | 'live';

/**
 * Per-resource source switch.
 *
 * Each resource flips to 'live' independently as Codex ships its endpoint, so
 * the frontend never maintains two parallel implementations. Every entry is
 * 'fixture' today because `apps/api` exposes no public territory route yet.
 */
const SOURCE_BY_RESOURCE: Record<DataResource, DataSourceMode> = {
  territories: 'fixture',
  'territory-history': 'fixture',
  'company-territories': 'fixture',
};

export function resolveSource(resource: DataResource): DataSourceMode {
  return SOURCE_BY_RESOURCE[resource];
}
