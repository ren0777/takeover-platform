import { describe, expect, it } from 'vitest';
import { parseApiConfig } from '../src/config/env.js';

describe('parseApiConfig', () => {
  it('applies safe development defaults', () => {
    const config = parseApiConfig({});

    expect(config).toMatchObject({
      host: '127.0.0.1',
      logLevel: 'info',
      nodeEnv: 'development',
      port: 4000,
      identity: {
        accessRequestTtlSeconds: 604_800,
        developmentEmailCaptureEnabled: false,
        draftTtlSeconds: 86_400,
        emailProvider: 'development',
        emailVerificationTtlSeconds: 900,
        managementLinkTtlSeconds: 900,
        managementSessionTtlSeconds: 28_800,
        recoveryRequestTtlSeconds: 604_800,
        webAppOrigin: 'http://localhost:3000',
      },
    });
    expect(config.identity.tokenHmacSecret).toHaveLength(32);
    expect(Object.isFrozen(config.identity)).toBe(true);
  });

  it('parses valid production configuration', () => {
    expect(
      parseApiConfig({
        API_HOST: '0.0.0.0',
        API_PORT: '8080',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/takeover',
        DEV_EMAIL_CAPTURE_ENABLED: 'false',
        EMAIL_PROVIDER: 'unavailable',
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        TOKEN_HMAC_SECRET: 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk',
        WEB_APP_ORIGIN: 'https://takeover.com',
      }),
    ).toMatchObject({ host: '0.0.0.0', logLevel: 'warn', nodeEnv: 'production', port: 8080 });
  });

  it('rejects secrets shorter than 256 bits after decoding', () => {
    expect(() => parseApiConfig({ TOKEN_HMAC_SECRET: 'dG9vLXNob3J0' })).toThrow(
      'TOKEN_HMAC_SECRET',
    );
  });

  it.each([
    {
      EMAIL_PROVIDER: 'development',
      NODE_ENV: 'production',
      TOKEN_HMAC_SECRET: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
      WEB_APP_ORIGIN: 'https://takeover.com',
    },
    {
      DEV_EMAIL_CAPTURE_ENABLED: 'true',
      EMAIL_PROVIDER: 'unavailable',
      NODE_ENV: 'production',
      TOKEN_HMAC_SECRET: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
      WEB_APP_ORIGIN: 'https://takeover.com',
    },
    {
      EMAIL_PROVIDER: 'unavailable',
      NODE_ENV: 'production',
      TOKEN_HMAC_SECRET: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
      WEB_APP_ORIGIN: 'http://takeover.com',
    },
  ])('rejects insecure production identity configuration', (source) => {
    expect(() => parseApiConfig(source)).toThrow('Invalid API configuration');
  });

  it.each([
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['API_PORT', { API_PORT: 'not-a-port' }],
    ['API_PORT', { API_PORT: '70000' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'chatty' }],
    ['DATABASE_URL', { DATABASE_URL: 'not-a-url' }],
    ['EMAIL_VERIFICATION_TTL_SECONDS', { EMAIL_VERIFICATION_TTL_SECONDS: '0' }],
    ['DEV_EMAIL_CAPTURE_ENABLED', { DEV_EMAIL_CAPTURE_ENABLED: 'sometimes' }],
  ])('rejects invalid %s without echoing secret values', (name, source) => {
    expect(() => parseApiConfig(source)).toThrow(name);
    try {
      parseApiConfig(source);
    } catch (error) {
      expect(String(error)).not.toContain('user:pass');
    }
  });
});
