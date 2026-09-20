import { describe, expect, it } from 'vitest';
import { parseApiConfig } from '../src/config/env.js';

const dodo = {
  DODO_API_KEY: 'test-placeholder', DODO_PRODUCT_IDS: '{"USD":"test-product"}',
  DODO_WEBHOOK_SECRET: `whsec_${Buffer.from('test-webhook-secret-32-bytes-long!').toString('base64')}`,
};

describe('launch configuration', () => {
  it('requires production email credentials and HTTPS links', () => {
    expect(() => parseApiConfig({ EMAIL_PROVIDER: 'resend' })).toThrow('RESEND_API_KEY');
    const config = parseApiConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only',
      EMAIL_FROM: 'notifications@example.com', WEB_APP_ORIGIN: 'https://takeover.example' });
    expect(config.identity.productionEmail?.fromEmail).toBe('notifications@example.com');
  });
  it('keeps operator authority independently configured and fails closed on partial configuration', () => {
    expect(() => parseApiConfig({ OPERATOR_ID: '11111111-1111-4111-8111-111111111111' })).toThrow('OPERATOR_CREDENTIAL');
    const config = parseApiConfig({ OPERATOR_ID: '11111111-1111-4111-8111-111111111111',
      OPERATOR_CREDENTIAL: Buffer.from('operator-test-secret-at-least-32-bytes').toString('base64url'), OPERATOR_PERMISSIONS: 'read,moderate' });
    expect(config.operator?.permissions).toEqual(['read', 'moderate']);
    expect(() => parseApiConfig({ OPERATOR_PERMISSIONS: 'administrator' })).toThrow('OPERATOR_PERMISSIONS');
  });
  it('requires explicit live-mode enablement for the live payment host', () => {
    expect(() => parseApiConfig({ ...dodo, DODO_BASE_URL: 'https://live.dodopayments.com' }))
      .toThrow('DODO_LIVE_ENABLED');
    expect(parseApiConfig({ ...dodo, DODO_BASE_URL: 'https://live.dodopayments.com', DODO_LIVE_ENABLED: 'true' }).dodo)
      .toBeDefined();
  });
  it('rejects credential-bearing and non-origin provider URLs', () => {
    for (const url of ['https://user:secret@test.dodopayments.com', 'https://test.dodopayments.com/api', 'https://test.dodopayments.com?key=secret']) {
      expect(() => parseApiConfig({ ...dodo, DODO_BASE_URL: url })).toThrow('DODO_BASE_URL');
    }
  });
  it('requires the database in production', () => {
    expect(() => parseApiConfig({ NODE_ENV: 'production', EMAIL_PROVIDER: 'unavailable',
      WEB_APP_ORIGIN: 'https://takeover.example', TOKEN_HMAC_SECRET: Buffer.from('production-test-secret-at-least-32-bytes').toString('base64url'),
    })).toThrow('DATABASE_URL');
  });
});
