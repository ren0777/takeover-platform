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

function createTakeoverService(): Pick<TakeoverService, 'createQuote' | 'createCheckout' | 'getStatus'> {
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
): {
  app: FastifyInstance;
  identityService: Pick<CompanyIdentityService, 'getManagementContext'>;
  takeoverService: Pick<TakeoverService, 'createQuote' | 'createCheckout' | 'getStatus'>;
} {
  app = buildApp({
    logger: false,
    nodeEnv: 'test',
    takeover: {
      config: { webAppOrigin: config.identity.webAppOrigin },
      identityService: identityService as CompanyIdentityService,
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
});
