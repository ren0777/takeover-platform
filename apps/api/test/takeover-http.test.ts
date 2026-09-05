import { Webhook } from 'standardwebhooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseApiConfig } from '../src/config/env.js';
import type { CompanyIdentityService } from '../src/modules/company-identity/service.js';
import type { TakeoverService } from '../src/modules/takeover/service.js';

vi.setConfig({ testTimeout: 20_000 });

const config = parseApiConfig({
  NODE_ENV: 'test',
  WEB_APP_ORIGIN: 'https://app.example',
});
const webhookSecret = `whsec_${Buffer.from('takeover-dodo-webhook-secret').toString('base64')}`;
const companyId = '11111111-1111-4111-8111-111111111111';
const quoteId = '33333333-3333-4333-8333-333333333333';

function createIdentityService(): Pick<CompanyIdentityService, 'getManagementContext'> {
  return {
    getManagementContext: vi.fn(async (_sessionToken: string, csrfToken: string) => ({
      company: {
        activatedAt: '2026-09-01T00:00:00.000Z',
        expiresAt: null,
        id: companyId,
        logoUrl: null,
        name: 'Acme',
        slug: 'acme',
        status: 'active' as const,
        updatedAt: '2026-09-01T00:00:00.000Z',
        websiteUrl: 'https://acme.example/',
      },
      csrfToken,
      sessionExpiresAt: '2026-09-03T18:00:00.000Z',
      verificationLevels: ['contact_verified'] as ['contact_verified'],
    })),
  };
}

function createTakeoverService(): Pick<
  TakeoverService,
  'createQuote' | 'createCheckout' | 'getStatus' | 'processVerifiedProviderWebhook'
> {
  return {
    createCheckout: vi.fn(async () => ({
      checkoutId: '44444444-4444-4444-8444-444444444444',
      providerCheckoutUrl: 'https://pay.example/checkout',
      statusToken: 'A'.repeat(43),
    })),
    createQuote: vi.fn(async () => ({
      checkoutAvailable: true,
      expiresAt: '2026-09-03T10:05:00.000Z',
      minimumAmount: { amountMinor: 1500, currency: 'USD' },
      quoteId,
      status: 'ACTIVE' as const,
      territoryId: '22222222-2222-4222-8222-222222222222',
      territorySlug: 'ai-coding',
      territoryVersion: '7',
    })),
    getStatus: vi.fn(async () => ({
      amountCharged: { amountMinor: 1500, currency: 'USD' },
      checkoutId: '44444444-4444-4444-8444-444444444444',
      state: 'PENDING_PAYMENT' as const,
      terminal: false,
      updatedAt: '2026-09-03T10:00:00.000Z',
    })),
    processVerifiedProviderWebhook: vi.fn(async () => undefined),
  };
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function buildTakeoverApp(
  takeoverService = createTakeoverService(),
  identityService = createIdentityService(),
  reconciliationDriver?: {
    runOnce(): Promise<unknown>;
    start(): void;
    stop(): void;
  },
): {
  app: FastifyInstance;
  identityService: Pick<CompanyIdentityService, 'getManagementContext'>;
  takeoverService: Pick<
    TakeoverService,
    'createQuote' | 'createCheckout' | 'getStatus' | 'processVerifiedProviderWebhook'
  >;
} {
  app = buildApp({
    logger: false,
    nodeEnv: 'test',
    takeover: {
      config: { dodoWebhookSecret: webhookSecret, webAppOrigin: config.identity.webAppOrigin },
      identityService: identityService as CompanyIdentityService,
      ...(reconciliationDriver === undefined ? {} : { reconciliationDriver }),
      service: takeoverService as TakeoverService,
    },
  });
  return { app, identityService, takeoverService };
}

const mutationHeaders = {
  cookie: 'takeover_management=session; takeover_management_csrf=csrf',
  origin: config.identity.webAppOrigin,
  'x-csrf-token': 'csrf',
};

describe('provider-neutral takeover HTTP routes', () => {
  it('starts and stops the takeover reconciliation driver through app lifecycle', async () => {
    const reconciliationDriver = {
      runOnce: vi.fn(async () => undefined),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const harness = buildTakeoverApp(
      createTakeoverService(),
      createIdentityService(),
      reconciliationDriver,
    );

    await harness.app.ready();
    await harness.app.close();
    app = undefined;

    expect(reconciliationDriver.runOnce).toHaveBeenCalledTimes(1);
    expect(reconciliationDriver.start).toHaveBeenCalledTimes(1);
    expect(reconciliationDriver.stop).toHaveBeenCalledTimes(1);
  });

  it('registers POST /api/takeover-quotes and uses the session company as authority', async () => {
    const harness = buildTakeoverApp();

    const response = await harness.app.inject({
      headers: mutationHeaders,
      method: 'POST',
      payload: { territorySlug: 'ai-coding' },
      url: '/api/takeover-quotes',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { quoteId, territoryVersion: '7' },
      meta: { requestId: expect.any(String) },
    });
    expect(harness.takeoverService.createQuote).toHaveBeenCalledWith({
      companyId,
      territorySlug: 'ai-coding',
    });
  });

  it('rejects quote mutation without trusted Origin and CSRF', async () => {
    const harness = buildTakeoverApp();

    const response = await harness.app.inject({
      method: 'POST',
      payload: { territorySlug: 'ai-coding' },
      url: '/api/takeover-quotes',
    });

    expect(response.statusCode).toBe(403);
    expect(harness.takeoverService.createQuote).not.toHaveBeenCalled();
  });

  it('registers POST /api/takeover-checkouts with quoteId-only contract', async () => {
    const harness = buildTakeoverApp();

    const response = await harness.app.inject({
      headers: mutationHeaders,
      method: 'POST',
      payload: { amount: 1500, quoteId, returnUrl: 'https://evil.example' },
      url: '/api/takeover-checkouts',
    });

    expect(response.statusCode).toBe(400);

    const accepted = await harness.app.inject({
      headers: mutationHeaders,
      method: 'POST',
      payload: { quoteId },
      url: '/api/takeover-checkouts',
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      data: {
        providerCheckoutUrl: 'https://pay.example/checkout',
        statusToken: 'A'.repeat(43),
      },
      meta: { requestId: expect.any(String) },
    });
    expect(harness.takeoverService.createCheckout).toHaveBeenCalledWith({ companyId, quoteId });
  });

  it('registers GET /api/takeover-status/:statusToken without management cookies', async () => {
    const harness = buildTakeoverApp();

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/takeover-status/${'A'.repeat(43)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { state: 'PENDING_PAYMENT', terminal: false },
      meta: { requestId: expect.any(String) },
    });
    expect(harness.identityService.getManagementContext).not.toHaveBeenCalled();
  });

  it('exposes no mutating route on the browser-facing status endpoint', async () => {
    const harness = buildTakeoverApp();

    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      const response = await harness.app.inject({
        headers: mutationHeaders,
        method,
        payload: { state: 'CAPTURED' },
        url: `/api/takeover-status/${'A'.repeat(43)}`,
      });

      expect(response.statusCode).toBe(404);
    }
    expect(harness.takeoverService.getStatus).not.toHaveBeenCalled();
    expect(harness.identityService.getManagementContext).not.toHaveBeenCalled();
  });
});

function signedWebhook(payload: unknown, overrides: Record<string, string> = {}) {
  const rawPayload = JSON.stringify(payload);
  const webhookId = overrides['webhook-id'] ?? 'msg_valid';
  const timestamp = new Date();
  const signature = new Webhook(webhookSecret).sign(webhookId, timestamp, rawPayload);
  return {
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-signature': overrides['webhook-signature'] ?? signature,
      'webhook-timestamp':
        overrides['webhook-timestamp'] ?? String(Math.floor(timestamp.getTime() / 1000)),
    },
    rawPayload,
  };
}

function paymentSucceededPayload(overrides: Record<string, unknown> = {}) {
  return {
    business_id: 'bus_123',
    data: {
      checkout_session_id: 'checkout-session-1',
      currency: 'USD',
      metadata: {
        amount_minor: 1500,
        checkout_id: '44444444-4444-4444-8444-444444444444',
        currency: 'USD',
        quote_id: quoteId,
      },
      payment_id: 'pay_123',
      status: 'succeeded',
      total_amount: 1500,
      ...overrides,
    },
    timestamp: '2026-09-03T10:00:00.000Z',
    type: 'payment.succeeded',
  };
}

function refundPayload(
  type: 'refund.succeeded' | 'refund.failed',
  overrides: Record<string, unknown> = {},
) {
  return {
    business_id: 'bus_123',
    data: {
      amount: 1500,
      currency: 'USD',
      metadata: {
        amount_minor: 1500,
        currency: 'USD',
        payment_id: 'payment-row-1',
      },
      payment_id: 'pay_123',
      refund_id: 'ref_123',
      status: type === 'refund.succeeded' ? 'succeeded' : 'failed',
      ...overrides,
    },
    timestamp: '2026-09-03T10:00:00.000Z',
    type,
  };
}

describe('Dodo payment webhook route', () => {
  it('accepts a valid raw-body signed payment webhook without management cookies', async () => {
    const harness = buildTakeoverApp();
    const { headers, rawPayload } = signedWebhook(paymentSucceededPayload());

    const response = await harness.app.inject({
      headers,
      method: 'POST',
      payload: rawPayload,
      url: '/api/payment/webhooks/dodo',
    });

    expect(response.statusCode).toBe(200);
    expect(harness.identityService.getManagementContext).not.toHaveBeenCalled();
    expect(harness.takeoverService.processVerifiedProviderWebhook).toHaveBeenCalledWith({
      amountMinor: 1500n,
      currency: 'USD',
      eventType: 'payment.succeeded',
      metadata: {
        amount_minor: 1500,
        checkout_id: '44444444-4444-4444-8444-444444444444',
        currency: 'USD',
        quote_id: quoteId,
      },
      payload: paymentSucceededPayload(),
      provider: 'DODO',
      providerCheckoutId: 'checkout-session-1',
      providerEventId: 'msg_valid',
      providerPaymentId: 'pay_123',
      signatureDigest: expect.any(Uint8Array),
    });
  });

  it.each([['webhook-id'], ['webhook-signature'], ['webhook-timestamp']])(
    'rejects a Dodo webhook missing %s',
    async (missingHeader) => {
      const harness = buildTakeoverApp();
      const { headers, rawPayload } = signedWebhook(paymentSucceededPayload());
      delete headers[missingHeader as keyof typeof headers];

      const response = await harness.app.inject({
        headers,
        method: 'POST',
        payload: rawPayload,
        url: '/api/payment/webhooks/dodo',
      });

      expect(response.statusCode).toBe(401);
      expect(harness.takeoverService.processVerifiedProviderWebhook).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid signatures before trusting event data', async () => {
    const harness = buildTakeoverApp();
    const { headers, rawPayload } = signedWebhook(paymentSucceededPayload(), {
      'webhook-signature': 'v1,not-valid',
    });

    const response = await harness.app.inject({
      headers,
      method: 'POST',
      payload: rawPayload,
      url: '/api/payment/webhooks/dodo',
    });

    expect(response.statusCode).toBe(401);
    expect(harness.takeoverService.processVerifiedProviderWebhook).not.toHaveBeenCalled();
  });

  it('rejects body tampering because verification uses exact raw bytes', async () => {
    const harness = buildTakeoverApp();
    const { headers } = signedWebhook(paymentSucceededPayload());
    const tampered = JSON.stringify(paymentSucceededPayload({ total_amount: 1499 }));

    const response = await harness.app.inject({
      headers,
      method: 'POST',
      payload: tampered,
      url: '/api/payment/webhooks/dodo',
    });

    expect(response.statusCode).toBe(401);
    expect(harness.takeoverService.processVerifiedProviderWebhook).not.toHaveBeenCalled();
  });

  it('rejects stale and malformed timestamps', async () => {
    const stale = Math.floor(Date.now() / 1000) - 301;
    const cases = [String(stale), 'not-a-timestamp'];

    for (const webhookTimestamp of cases) {
      const harness = buildTakeoverApp();
      const { headers, rawPayload } = signedWebhook(paymentSucceededPayload(), {
        'webhook-timestamp': webhookTimestamp,
      });

      const response = await harness.app.inject({
        headers,
        method: 'POST',
        payload: rawPayload,
        url: '/api/payment/webhooks/dodo',
      });

      expect(response.statusCode).toBe(401);
      expect(harness.takeoverService.processVerifiedProviderWebhook).not.toHaveBeenCalled();
      await harness.app.close();
      app = undefined;
    }
  });

  it('fails malformed JSON safely only after signature verification', async () => {
    const harness = buildTakeoverApp();
    const rawPayload = '{"type":"payment.succeeded",';
    const timestamp = new Date();
    const headers = {
      'content-type': 'application/json',
      'webhook-id': 'msg_malformed',
      'webhook-signature': new Webhook(webhookSecret).sign('msg_malformed', timestamp, rawPayload),
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    };

    const response = await harness.app.inject({
      headers,
      method: 'POST',
      payload: rawPayload,
      url: '/api/payment/webhooks/dodo',
    });

    expect(response.statusCode).toBe(400);
    expect(harness.takeoverService.processVerifiedProviderWebhook).not.toHaveBeenCalled();
  });

  it('accepts signed refund success webhooks as authoritative refund evidence', async () => {
    const harness = buildTakeoverApp();
    const payload = refundPayload('refund.succeeded');
    const { headers, rawPayload } = signedWebhook(payload, { 'webhook-id': 'msg_refund' });

    const response = await harness.app.inject({
      headers,
      method: 'POST',
      payload: rawPayload,
      url: '/api/payment/webhooks/dodo',
    });

    expect(response.statusCode).toBe(200);
    expect(harness.takeoverService.processVerifiedProviderWebhook).toHaveBeenCalledWith({
      amountMinor: 1500n,
      currency: 'USD',
      eventType: 'refund.succeeded',
      metadata: {
        amount_minor: 1500,
        currency: 'USD',
        payment_id: 'payment-row-1',
      },
      payload,
      provider: 'DODO',
      providerEventId: 'msg_refund',
      providerPaymentId: 'pay_123',
      providerRefundId: 'ref_123',
      signatureDigest: expect.any(Uint8Array),
    });
  });

  it('accepts signed refund failed webhooks without capture side effects', async () => {
    const harness = buildTakeoverApp();
    const payload = refundPayload('refund.failed');
    const { headers, rawPayload } = signedWebhook(payload, { 'webhook-id': 'msg_refund_failed' });

    const response = await harness.app.inject({
      headers,
      method: 'POST',
      payload: rawPayload,
      url: '/api/payment/webhooks/dodo',
    });

    expect(response.statusCode).toBe(200);
    expect(harness.takeoverService.processVerifiedProviderWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'refund.failed',
        providerPaymentId: 'pay_123',
        providerRefundId: 'ref_123',
      }),
    );
  });
});
