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

export function managementCsrfCookieOptions(
  nodeEnv: ApiConfig['nodeEnv'],
): CookieSerializeOptions {
  return {
    httpOnly: false,
    path: '/api',
    sameSite: 'lax',
    secure: nodeEnv === 'production',
  };
}
