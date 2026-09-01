/**
 * Per-resource data source selection.
 *
 * Each public read resource flips from fixtures to the live API independently,
 * so a resource goes live the moment its endpoint exists without waiting for
 * the others and without touching any component.
 */
export const DATA_RESOURCES = [
  'territory-categories',
  'territory-list',
  'territory-detail',
  'territory-history',
  'public-company',
  'company-territories',
] as const;

export type DataResource = (typeof DATA_RESOURCES)[number];
export type DataSourceMode = 'fixture' | 'live';

function isDataResource(value: string): value is DataResource {
  return (DATA_RESOURCES as readonly string[]).includes(value);
}

/**
 * Resources configured to use the live API, from `TAKEOVER_LIVE_RESOURCES`.
 *
 * Accepts a comma-separated list of resource names, or `all`. Unknown names
 * throw rather than being ignored, because a silently misspelled resource would
 * look like it went live while still serving fixtures.
 */
function liveResources(raw: string | undefined): ReadonlySet<DataResource> {
  if (raw === undefined) return new Set();

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.includes('all')) return new Set(DATA_RESOURCES);

  const selected = new Set<DataResource>();
  for (const entry of entries) {
    if (!isDataResource(entry)) {
      throw new Error(
        `Unknown data resource in TAKEOVER_LIVE_RESOURCES: "${entry}". Known resources: ${DATA_RESOURCES.join(', ')}`,
      );
    }
    selected.add(entry);
  }

  return selected;
}

export type SourceEnvironment = {
  liveResources: string | undefined;
  nodeEnv: string | undefined;
};

/**
 * Resolves the source for one resource.
 *
 * Fixtures are development-only. In production a resource that is not
 * configured as live throws, rather than quietly serving invented data — a
 * silent fixture fallback in production would present fabricated territories
 * and ownership as real.
 *
 * There is deliberately no fallback in the other direction either: if a live
 * resource is unreachable the error propagates, so an outage surfaces as an
 * error state rather than as stale fiction.
 */
export function resolveSourceWith(
  resource: DataResource,
  environment: SourceEnvironment,
): DataSourceMode {
  const live = liveResources(environment.liveResources);
  if (live.has(resource)) return 'live';

  if (environment.nodeEnv === 'production') {
    throw new Error(
      `Data resource "${resource}" has no live source configured. Fixtures are development-only, so production cannot serve this resource. Add it to TAKEOVER_LIVE_RESOURCES once its endpoint exists.`,
    );
  }

  return 'fixture';
}

export function resolveSource(resource: DataResource): DataSourceMode {
  return resolveSourceWith(resource, {
    liveResources: process.env.TAKEOVER_LIVE_RESOURCES,
    nodeEnv: process.env.NODE_ENV,
  });
}
