/**
 * The single place any public territory route string is written down.
 *
 * ASSUMED, not published. Phase 2 shipped contracts but the routes landed
 * separately, so these paths are centralised precisely so a correction is a
 * one-line change per resource rather than a hunt through the codebase.
 * `scripts/territory-contract-smoke.ts` verifies them against a running API.
 *
 * This module deliberately imports nothing: it is loaded both by the app
 * (through the `@/` alias) and directly by the smoke script under Node, so it
 * must stay free of aliases, JSX, and runtime dependencies.
 */
export const TERRITORY_API_PATHS = {
  categories: '/api/territory-categories',
  territories: '/api/territories',
  territoryDetail: (slug: string) => `/api/territories/${encodeURIComponent(slug)}`,
  territoryHistory: (slug: string) => `/api/territories/${encodeURIComponent(slug)}/history`,
  company: (slug: string) => `/api/companies/${encodeURIComponent(slug)}`,
  companyTerritories: (slug: string) => `/api/companies/${encodeURIComponent(slug)}/territories`,
} as const;
