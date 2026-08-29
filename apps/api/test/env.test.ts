import { describe, expect, it } from 'vitest';
import { parseApiConfig } from '../src/config/env.js';

describe('parseApiConfig', () => {
  it('applies safe development defaults', () => {
    expect(parseApiConfig({})).toEqual({
      host: '127.0.0.1',
      logLevel: 'info',
      nodeEnv: 'development',
      port: 4000,
    });
  });

  it('parses valid production configuration', () => {
    expect(
      parseApiConfig({
        API_HOST: '0.0.0.0',
        API_PORT: '8080',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/takeover',
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
      }),
    ).toMatchObject({ host: '0.0.0.0', logLevel: 'warn', nodeEnv: 'production', port: 8080 });
  });

  it.each([
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['API_PORT', { API_PORT: 'not-a-port' }],
    ['API_PORT', { API_PORT: '70000' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'chatty' }],
    ['DATABASE_URL', { DATABASE_URL: 'not-a-url' }],
  ])('rejects invalid %s without echoing secret values', (name, source) => {
    expect(() => parseApiConfig(source)).toThrow(name);
    try {
      parseApiConfig(source);
    } catch (error) {
      expect(String(error)).not.toContain('user:pass');
    }
  });
});
