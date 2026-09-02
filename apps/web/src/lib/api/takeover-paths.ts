/**
 * The single place any Phase 3 takeover route string is written down.
 *
 * Mirrors `territory-paths.ts`: this module imports nothing, so it can be
 * loaded by the app through the `@/` alias and directly by scripts under plain
 * Node, and a route correction stays a one-line change.
 */
export const TAKEOVER_API_PATHS = {
  quotes: '/api/takeover-quotes',
  checkouts: '/api/takeover-checkouts',
  status: (statusToken: string) => `/api/takeover-status/${encodeURIComponent(statusToken)}`,
} as const;
