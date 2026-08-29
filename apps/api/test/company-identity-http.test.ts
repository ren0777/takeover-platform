import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseApiConfig } from '../src/config/env.js';
import {
  IdentityRateLimitError,
  InvalidCapabilityTokenError,
  type CompanyIdentityService,
} from '../src/modules/company-identity/service.js';

const config = parseApiConfig({ NODE_ENV: 'test' });
const company = {
  activatedAt: null,
  expiresAt: '2026-08-31T13:00:00.000Z',
  id: '11111111-1111-4111-8111-111111111111',
  logoUrl: null,
  name: 'My Cool Startup',
  slug: null,
  status: 'draft' as const,
  websiteUrl: 'https://mycoolstartup.com/',
};
const intent = {
  checkoutAvailable: false as const,
  companyId: company.id,
  expiresAt: '2026-08-31T13:00:00.000Z',
  id: '33333333-3333-4333-8333-333333333333',
  quoteAuthority: 'reference_only' as const,
  status: 'awaiting_email_verification' as const,
  territoryExternalRef: 'ai-coding',
};

function createService(): CompanyIdentityService {
  return {
    beginCompanyClaim: vi.fn(async () => ({
      checkoutAvailable: false as const,
      company,
      contactVerification: { deliveryAccepted: true, status: 'verification_required' as const },
      intent,
      nextAction: 'verify_email' as const,
    })),
    exchangeEmailVerification: vi.fn(async () => ({
      csrfToken: 'csrf-secret-for-browser',
      response: {
        checkoutAvailable: false as const,
        company,
        intent: { ...intent, status: 'identity_ready' as const },
        managementContext: {
          company,
          csrfToken: 'csrf-secret-for-browser',
          sessionExpiresAt: '2026-08-30T21:00:00.000Z',
          verificationLevels: ['contact_verified'] as ['contact_verified'],
        },
        nextAction: 'manage_company' as const,
      },
      sessionToken: 'opaque-session-secret',
    })),
    getManagementContext: vi.fn(async (_sessionToken, csrfToken) => ({
      company,
      csrfToken,
      sessionExpiresAt: '2026-08-30T21:00:00.000Z',
      verificationLevels: ['contact_verified'] as ['contact_verified'],
    })),
    reissueEmailVerification: vi.fn(async () => ({ accepted: true as const })),
    revokeManagementSession: vi.fn(async () => undefined),
  };
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function buildIdentityApp(service = createService()): { app: FastifyInstance; service: CompanyIdentityService } {
  app = buildApp({
    companyIdentity: { config: config.identity, service },
    logger: false,
    nodeEnv: 'test',
  });
  return { app, service };
}

describe('company identity HTTP surface', () => {
  it('validates claims and returns the shared success envelope', async () => {
    const harness = buildIdentityApp();
    const invalid = await harness.app.inject({
      method: 'POST',
      url: '/api/company-claims',
      payload: { company: { name: 'X', websiteUrl: 'not-a-url' } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');

    const valid = await harness.app.inject({
      method: 'POST',
      url: '/api/company-claims',
      payload: {
        company: { name: 'My Cool Startup', websiteUrl: 'https://mycoolstartup.com' },
        contactEmail: 'founder@gmail.com',
        intent: { territoryExternalRef: 'ai-coding' },
      },
    });
    expect(valid.statusCode).toBe(202);
    expect(valid.json()).toMatchObject({
      data: { checkoutAvailable: false, nextAction: 'verify_email' },
      meta: { requestId: expect.any(String) },
    });
  });

  it('keeps reissue enumeration-resistant', async () => {
    const harness = buildIdentityApp();
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/email-verifications',
      payload: { companyId: company.id, contactEmail: 'unknown@gmail.com' },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toEqual({ accepted: true });
  });

  it('exchanges by POST, sets separate scoped cookies, and never returns the session token', async () => {
    const harness = buildIdentityApp();
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/email-verifications/exchange',
      payload: { token: 'selector-secret.selector-secret-value' },
    });

    expect(response.statusCode).toBe(200);
    const cookies = response.cookies;
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          httpOnly: true,
          name: 'takeover_management',
          path: '/api',
          sameSite: 'Lax',
          value: 'opaque-session-secret',
        }),
        expect.objectContaining({
          name: 'takeover_management_csrf',
          path: '/api',
          sameSite: 'Lax',
          value: 'csrf-secret-for-browser',
        }),
      ]),
    );
    expect(response.body).not.toContain('opaque-session-secret');
    expect(response.json().data.checkoutAvailable).toBe(false);
  });

  it('protects cookie-authenticated mutation with exact Origin and CSRF', async () => {
    const harness = buildIdentityApp();
    const response = await harness.app.inject({
      method: 'DELETE',
      url: '/api/company-management/session',
      headers: {
        cookie: 'takeover_management=session; takeover_management_csrf=csrf',
        'x-csrf-token': 'csrf',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(harness.service.revokeManagementSession).not.toHaveBeenCalled();
  });

  it.each([
    [new InvalidCapabilityTokenError(), 401, 'INVALID_OR_EXPIRED_TOKEN'],
    [new IdentityRateLimitError(60), 429, 'RATE_LIMITED'],
    [Object.assign(new Error('Conflict'), { code: 'CONFLICT', statusCode: 409 }), 409, 'CONFLICT'],
  ] as const)('maps typed service failures to stable envelopes', async (error, status, code) => {
    const service = createService();
    vi.mocked(service.exchangeEmailVerification).mockRejectedValueOnce(error);
    const harness = buildIdentityApp(service);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/email-verifications/exchange',
      payload: { token: 'selector-secret.selector-secret-value' },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json().error).toMatchObject({ code, requestId: expect.any(String) });
    expect(response.body).not.toContain('selector-secret-value');
  });

  it('has no state-changing GET or checkout route', async () => {
    const harness = buildIdentityApp();
    expect(
      (await harness.app.inject({ method: 'GET', url: '/api/email-verifications/exchange' }))
        .statusCode,
    ).toBe(404);
    expect((await harness.app.inject({ method: 'POST', url: '/api/checkout' })).statusCode).toBe(
      404,
    );
  });
});
