import type { NextConfig } from 'next';
import path from 'node:path';

/**
 * The API sets its management cookies with `Path=/api`, `SameSite=Lax` and no
 * `Domain`, and registers no CORS plugin. The browser must therefore reach the
 * API on the web app's own origin, so `/api/*` is proxied rather than called
 * cross-origin. This also makes the browser send `Origin: WEB_APP_ORIGIN`, which
 * is what the API's mutation origin check requires.
 */
const apiOrigin = process.env.TAKEOVER_API_ORIGIN ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  reactStrictMode: true,
  transpilePackages: ['@takeover/shared'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
