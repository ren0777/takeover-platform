import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseApiConfig } from '../src/config/env.js';

describe('trusted proxy addresses', () => {
  it.each(['true', '*', '0.0.0.0/0', '172.30.85.0/29', 'web', '172.30.85.999'])('rejects non-address trust configuration %s', (value) => {
    expect(() => parseApiConfig({ API_TRUSTED_PROXIES: value })).toThrow('API_TRUSTED_PROXIES');
  });

  it('preserves client separation and ignores spoofed entries before the real client', async () => {
    const app = buildApp({ logger: false, config: parseApiConfig({ NODE_ENV: 'test', API_TRUSTED_PROXIES: '172.30.85.3, ::1' }) });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    try {
      for (const client of ['203.0.113.1', '203.0.113.2']) {
        const response = await app.inject({ url: '/ip', remoteAddress: '172.30.85.3', headers: { 'x-forwarded-for': `198.51.100.99, ${client}` } });
        expect(response.json()).toEqual({ ip: client });
      }
      const untrusted = await app.inject({ url: '/ip', remoteAddress: '172.30.85.4', headers: { 'x-forwarded-for': '198.51.100.99' } });
      expect(untrusted.json()).toEqual({ ip: '172.30.85.4' });
    } finally { await app.close(); }
  });

  it('ignores forwarding headers when no proxy is configured', async () => {
    const app = buildApp({ logger: false, config: parseApiConfig({ NODE_ENV: 'test' }) });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    try {
      const response = await app.inject({ url: '/ip', remoteAddress: '172.30.85.3', headers: { 'x-forwarded-for': '203.0.113.1' } });
      expect(response.json()).toEqual({ ip: '172.30.85.3' });
    } finally { await app.close(); }
  });
});
