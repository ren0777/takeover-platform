import { describe, expect, it } from 'vitest';
import { parseApiConfig } from '../src/config/env.js';

const dodoWebhookSecret = `whsec_${Buffer.from('takeover-dodo-webhook-secret').toString('base64')}`;

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
        developmentEmailLogEnabled: false,
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
    expect(config.takeoverReconciliation).toEqual({
      batchSize: 25,
      enabled: true,
      intervalSeconds: 300,
    });
  });

  it('parses takeover reconciliation worker configuration', () => {
    const config = parseApiConfig({
      TAKEOVER_RECONCILIATION_BATCH_SIZE: '7',
      TAKEOVER_RECONCILIATION_ENABLED: 'false',
      TAKEOVER_RECONCILIATION_INTERVAL_SECONDS: '60',
    });

    expect(config.takeoverReconciliation).toEqual({
      batchSize: 7,
      enabled: false,
      intervalSeconds: 60,
    });
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

  it('enables development email logging outside production', () => {
    const config = parseApiConfig({ DEV_EMAIL_LOG_ENABLED: 'true', EMAIL_PROVIDER: 'development' });

    expect(config.identity.developmentEmailLogEnabled).toBe(true);
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
      DEV_EMAIL_LOG_ENABLED: 'true',
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
    ['DEV_EMAIL_LOG_ENABLED', { DEV_EMAIL_LOG_ENABLED: 'sometimes' }],
    ['TAKEOVER_RECONCILIATION_BATCH_SIZE', { TAKEOVER_RECONCILIATION_BATCH_SIZE: '0' }],
    ['TAKEOVER_RECONCILIATION_INTERVAL_SECONDS', { TAKEOVER_RECONCILIATION_INTERVAL_SECONDS: '0' }],
  ])('rejects invalid %s without echoing secret values', (name, source) => {
    expect(() => parseApiConfig(source)).toThrow(name);
    try {
      parseApiConfig(source);
    } catch (error) {
      expect(String(error)).not.toContain('user:pass');
    }
  });
});

// Dodo configuration tests

describe('Dodo configuration', () => {
  it('accepts valid DODO_PRODUCT_IDS and DODO_BASE_URL', () => {
    const config = parseApiConfig({
      DODO_API_KEY: 'test-key',
      DODO_BASE_URL: 'https://example.com',
      DODO_PRODUCT_IDS: '{"USD":"prod_usd","INR":"prod_inr"}',
      DODO_WEBHOOK_SECRET: dodoWebhookSecret,
    });
    expect(config.dodo?.productIds).toEqual({ USD: 'prod_usd', INR: 'prod_inr' });
    expect(config.dodo?.apiKey).toBe('test-key');
    expect(config.dodo?.baseUrl).toBe('https://example.com');
    expect(config.dodo?.webhookSecret).toBe(dodoWebhookSecret);
  });

  it('rejects missing DODO_WEBHOOK_SECRET when DODO_API_KEY set', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
        DODO_PRODUCT_IDS: '{"USD":"prod_usd"}',
      }),
    ).toThrow('DODO_WEBHOOK_SECRET must be configured when DODO_API_KEY is configured');
  });

  it('rejects invalid DODO_WEBHOOK_SECRET values', () => {
    expect(() =>
      parseApiConfig({
        DODO_WEBHOOK_SECRET: 'not-a-standard-webhooks-secret',
      }),
    ).toThrow('DODO_WEBHOOK_SECRET');
  });

  it('rejects missing DODO_PRODUCT_IDS when DODO_API_KEY set', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
      }),
    ).toThrow('DODO_PRODUCT_IDS must be a non-empty JSON object when DODO_API_KEY is configured');
  });

  it('rejects empty DODO_PRODUCT_IDS object', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
        DODO_PRODUCT_IDS: '{}',
      }),
    ).toThrow('DODO_PRODUCT_IDS must be a non-empty JSON object when DODO_API_KEY is configured');
  });

  it('rejects malformed JSON in DODO_PRODUCT_IDS', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
        DODO_PRODUCT_IDS: '{invalid',
      }),
    ).toThrow('Invalid DODO_PRODUCT_IDS JSON');
  });

  it('rejects array in DODO_PRODUCT_IDS', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
        DODO_PRODUCT_IDS: '["USD","INR"]',
      }),
    ).toThrow('DODO_PRODUCT_IDS must be a JSON object');
  });

  it('rejects invalid currency key in DODO_PRODUCT_IDS', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
        DODO_PRODUCT_IDS: '{"usd":"prod_usd"}',
      }),
    ).toThrow('Invalid currency code in DODO_PRODUCT_IDS: usd');
  });

  it('rejects empty product ID in DODO_PRODUCT_IDS', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'https://example.com',
        DODO_PRODUCT_IDS: '{"USD":""}',
      }),
    ).toThrow('Invalid product ID for currency USD in DODO_PRODUCT_IDS');
  });

  it('rejects non‑HTTPS DODO_BASE_URL', () => {
    expect(() =>
      parseApiConfig({
        DODO_API_KEY: 'test-key',
        DODO_BASE_URL: 'http://example.com',
        DODO_PRODUCT_IDS: '{"USD":"prod_usd"}',
        DODO_WEBHOOK_SECRET: dodoWebhookSecret,
      }),
    ).toThrow('DODO_BASE_URL must be HTTPS');
  });
});

describe('payment enablement gates', () => {
  it('keeps checkout enablement independent of the live-host gate', () => {
    expect(parseApiConfig({}).paymentsEnabled).toBe(false);
    expect(parseApiConfig({ DODO_LIVE_ENABLED: 'true' }).paymentsEnabled).toBe(false);
    expect(parseApiConfig({ PAYMENTS_ENABLED: 'true' }).paymentsEnabled).toBe(true);
    // The live provider host still needs its own explicit enablement.
    expect(() =>
      parseApiConfig({ PAYMENTS_ENABLED: 'true', DODO_BASE_URL: 'https://live.dodopayments.com' }),
    ).toThrow('DODO_LIVE_ENABLED');
  });
});
