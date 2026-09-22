import type { CookieSerializeOptions } from '@fastify/cookie';
import type { ApiConfig } from '../config/env.js';

export const MANAGEMENT_SESSION_COOKIE_NAME = 'takeover_management';
export const MANAGEMENT_CSRF_COOKIE_NAME = 'takeover_management_csrf';

export function managementSessionCookieOptions(
  nodeEnv: ApiConfig['nodeEnv'],
): CookieSerializeOptions {
  return {
    httpOnly: true,
    path: '/api',
    sameSite: 'lax',
    secure: nodeEnv === 'production',
  };
}

/**
 * The scope the CSRF cookie used to be issued at. Nothing sets a cookie with
 * these options any more; they exist only so responses can expire a cookie a
 * browser still holds from before the scope moved to '/'. A browser that keeps
 * both sends the more specific '/api' one first, and the request then carries a
 * cookie value that no longer matches the header, locking every mutation out
 * with a 401 that clearing site data is the only other way to escape.
 */
export function legacyManagementCsrfCookieOptions(
  nodeEnv: ApiConfig['nodeEnv'],
): CookieSerializeOptions {
  return {
    httpOnly: false,
    path: '/api',
    sameSite: 'lax',
    secure: nodeEnv === 'production',
  };
}

export function managementCsrfCookieOptions(nodeEnv: ApiConfig['nodeEnv']): CookieSerializeOptions {
  return {
    httpOnly: false,
    // Site-wide, unlike the session cookie: the double-submit token only works
    // if page scripts can read it, and a script on /manage or /takeover cannot
    // see a cookie scoped to /api. It is not a credential on its own -- the
    // session cookie stays HttpOnly and API-scoped -- and widening the path
    // exposes it to nothing beyond this same origin, which such a script can
    // already reach.
    path: '/',
    sameSite: 'lax',
    secure: nodeEnv === 'production',
  };
}
