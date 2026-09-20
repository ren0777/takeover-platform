import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { healthPlugin } from '../src/plugins/health.js';
import { safeRequestUrl } from '../src/security/request-log.js';
import { buildApp } from '../src/app.js';
import { parseApiConfig } from '../src/config/env.js';

describe('runtime security', () => {
  it('removes capability paths and query strings from request logs', () => {
    expect(safeRequestUrl('/api/takeover-status/secret_token?email=private@example.com'))
      .toBe('/api/takeover-status/[redacted]');
    expect(safeRequestUrl('/api/territories?cursor=private')).toBe('/api/territories');
  });

  it('prevents browser caching and referrer leaks on API responses', async () => {
    const app = buildApp({ logger: false, nodeEnv: 'test' });
    try {
      const response = await app.inject('/api/missing');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally { await app.close(); }
  });

  it('applies the configured LOG_LEVEL to the runtime logger', async () => {
    const app = buildApp({ config: parseApiConfig({ LOG_LEVEL: 'warn' }) });
    try {
      expect(app.log.level).toBe('warn');
    } finally { await app.close(); }
  });

  it('rejects oversized bodies before invoking a route', async () => {
    const app = buildApp({ logger: false, nodeEnv: 'test' });
    app.post('/body-probe', async () => ({ accepted: true }));
    try {
      const response = await app.inject({ method: 'POST', url: '/body-probe',
        payload: { value: 'x'.repeat(262_144) } });
      expect(response.statusCode).toBe(413);
      expect(response.json().error.requestId).toEqual(expect.any(String));
    } finally { await app.close(); }
  });

  it('reports a failed database readiness probe without exposing its error', async () => {
    const app = Fastify();
    await healthPlugin(app, { checkDatabase: async () => { throw new Error('password=private'); } });
    try {
      expect((await app.inject('/health')).statusCode).toBe(200);
      const response = await app.inject('/ready');
      expect(response.statusCode).toBe(503);
      expect(response.json().data.checks.database).toBe('unavailable');
      expect(response.body).not.toContain('private');
    } finally { await app.close(); }
  });

  it('reports a successful database readiness probe', async () => {
    const app = Fastify();
    await healthPlugin(app, { checkDatabase: async () => undefined });
    try {
      const response = await app.inject('/ready');
      expect(response.statusCode).toBe(200);
      expect(response.json().data.checks.database).toBe('ok');
    } finally { await app.close(); }
  });
});
