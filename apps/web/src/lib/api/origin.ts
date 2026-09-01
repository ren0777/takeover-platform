/**
 * Resolves an API path to something `fetch` can actually request.
 *
 * The browser calls `/api/*` on its own origin: `next.config.ts` proxies that
 * to the API so cookies stay first-party and the mutation origin check passes.
 * Server components have no origin to be relative to, so a bare `/api/...`
 * path throws inside Node. Public territory reads run on the server, so they
 * must be given an absolute URL built from `TAKEOVER_API_ORIGIN` — the same
 * variable the rewrite already uses, so there is one origin to configure.
 */

/** Matches the `next.config.ts` rewrite default so local dev needs no setup. */
export const DEFAULT_DEV_API_ORIGIN = 'http://127.0.0.1:4000';

export type OriginEnvironment = {
  apiOrigin: string | undefined;
  nodeEnv: string | undefined;
  isBrowser: boolean;
};

export function resolveRequestUrlWith(path: string, environment: OriginEnvironment): string {
  // An already-absolute URL is passed through untouched.
  if (/^https?:\/\//i.test(path)) return path;

  // In the browser the proxy handles it, and same-origin keeps cookies working.
  if (environment.isBrowser) return path;

  const configured = environment.apiOrigin?.trim();

  if (configured === undefined || configured.length === 0) {
    if (environment.nodeEnv === 'production') {
      // Falling back to localhost in production would turn a misconfiguration
      // into a silent outage on a surface that is supposed to fail loudly.
      throw new Error(
        'TAKEOVER_API_ORIGIN is not set. Server-side API reads have no origin to call in production.',
      );
    }
    return `${DEFAULT_DEV_API_ORIGIN}${path}`;
  }

  return `${configured.replace(/\/+$/, '')}${path}`;
}

export function resolveRequestUrl(path: string): string {
  return resolveRequestUrlWith(path, {
    apiOrigin: process.env.TAKEOVER_API_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    isBrowser: typeof window !== 'undefined',
  });
}
