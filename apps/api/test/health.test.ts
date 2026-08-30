import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health endpoints', () => {
  it('reports process liveness', async () => {
    app = buildApp({ logger: false, nodeEnv: 'test' });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toMatchObject({
      data: { status: 'ok' },
      meta: { requestId: expect.any(String) },
    });
  }, 20_000);

  it('reports only the readiness check it performs', async () => {
    app = buildApp({ logger: false, nodeEnv: 'test' });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { status: 'ready', checks: { application: 'ok' } },
    });
    expect(response.json().data.checks.database).toBeUndefined();
  });

  it('returns the shared error envelope for unknown routes', async () => {
    app = buildApp({ logger: false, nodeEnv: 'production' });

    const response = await app.inject({ method: 'GET', url: '/missing' });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: expect.any(String),
    });
    expect(response.body).not.toMatch(/at .*\(/);
  });
});
