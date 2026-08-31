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
    listAccessRequests: vi.fn(async () => ({
      items: [
        {
          companyId: company.id,
          expiresAt: '2026-09-06T13:00:00.000Z',
          id: '77777777-7777-4777-8777-777777777777',
          intent: { id: intent.id, territoryExternalRef: 'ai-coding' },
          requestedAt: '2026-08-30T12:00:00.000Z',
          requesterEmail: 'requester@example.com',
          status: 'pending' as const,
        },
      ],
      nextCursor: null,
    })),
    reissueEmailVerification: vi.fn(async () => ({ accepted: true as const })),
    revokeManagementSession: vi.fn(async () => undefined),
    requestManagementLink: vi.fn(async () => ({ accepted: true as const })),
    exchangeManagementLink: vi.fn(async () => ({
      context: {
        company,
        csrfToken: 'management-csrf-secret',
        sessionExpiresAt: '2026-08-30T21:00:00.000Z',
        verificationLevels: ['contact_verified'] as ['contact_verified'],
      },
      csrfToken: 'management-csrf-secret',
      sessionToken: 'management-session-secret',
    })),
    authorizeCompanyMutation: vi.fn(async () => ({
      companyId: company.id,
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
    })),
    approveAccessRequest: vi.fn(async () => ({
      accessRequest: {
        companyId: company.id,
        decidedAt: '2026-08-30T13:00:00.000Z',
        expiresAt: '2026-09-06T13:00:00.000Z',
        id: '77777777-7777-4777-8777-777777777777',
        requestedAt: '2026-08-30T12:00:00.000Z',
        status: 'approved' as const,
      },
      checkoutAvailable: false as const,
    })),
    rejectAccessRequest: vi.fn(async () => ({
      accessRequest: {
        companyId: company.id,
        decidedAt: '2026-08-30T13:00:00.000Z',
        expiresAt: '2026-09-06T13:00:00.000Z',
        id: '77777777-7777-4777-8777-777777777777',
        requestedAt: '2026-08-30T12:00:00.000Z',
        status: 'rejected' as const,
      },
      checkoutAvailable: false as const,
    })),
    requestManualRecovery: vi.fn(async () => ({
      executionAvailable: false as const,
      expiresAt: '2026-09-06T13:00:00.000Z',
      id: '77777777-7777-4777-8777-777777777777',
      status: 'pending' as const,
    })),
    updateTakeoverPreparation: vi.fn(async () => ({
      ...intent,
      intendedBid: { amountMinor: 26_000, currency: 'USD' },
      quoteSnapshot: {
        currentWinningAmount: { amountMinor: 25_000, currency: 'USD' },
        minimumTakeoverAmount: { amountMinor: 26_000, currency: 'USD' },
        observedAt: '2026-08-30T12:55:00.000Z',
        territoryVersion: 'version-7',
      },
      status: 'identity_ready' as const,
    })),
  };
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function buildIdentityApp(service = createService()): {
  app: FastifyInstance;
  service: CompanyIdentityService;
} {
  app = buildApp({
    companyIdentity: { config: config.identity, service },
    logger: false,
    nodeEnv: 'test',
  });
  return { app, service };
}

describe('company identity HTTP surface', () => {
  it('accepts recovery as pending without exposing an approval endpoint', async () => {
    const harness = buildIdentityApp();
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/company-recovery-requests',
      payload: {
        accessRequestId: '77777777-7777-4777-8777-777777777777',
        contactEmail: 'requester@gmail.com',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ executionAvailable: false, status: 'pending' });
    const approval = await harness.app.inject({
      method: 'POST',
      url: '/api/company-recovery-requests/77777777-7777-4777-8777-777777777777/approve',
    });
    expect(approval.statusCode).toBe(404);
  }, 20_000);

  it('updates a reference-only intent behind company-scoped session and CSRF checks', async () => {
    const harness = buildIdentityApp();
    const payload = {
      intendedBid: { amountMinor: 26_000, currency: 'USD' },
      quoteSnapshot: {
        currentWinningAmount: { amountMinor: 25_000, currency: 'USD' },
        minimumTakeoverAmount: { amountMinor: 26_000, currency: 'USD' },
        observedAt: '2026-08-30T12:55:00.000Z',
        territoryVersion: 'version-7',
      },
      territoryExternalRef: 'ai-coding',
    };
    const denied = await harness.app.inject({
      method: 'PUT',
      url: `/api/takeover-intents/${intent.id}/preparation`,
      payload,
    });
    expect(denied.statusCode).toBe(403);

    const response = await harness.app.inject({
      method: 'PUT',
      url: `/api/takeover-intents/${intent.id}/preparation`,
      headers: {
        cookie: 'takeover_management=session; takeover_management_csrf=csrf',
        origin: config.identity.webAppOrigin,
        'x-csrf-token': 'csrf',
      },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      checkoutAvailable: false,
      quoteAuthority: 'reference_only',
    });
  });

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
    if (error instanceof IdentityRateLimitError) {
      expect(response.headers['retry-after']).toBe('60');
      expect(response.json().error.details).toEqual({ retryAfterSeconds: 60 });
    }
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

  it('issues and exchanges management links without exposing the session secret', async () => {
    const harness = buildIdentityApp();
    const issued = await harness.app.inject({
      method: 'POST',
      url: '/api/company-management-links',
      payload: { companyId: company.id, contactEmail: 'founder@gmail.com' },
    });
    expect(issued.statusCode).toBe(202);
    expect(issued.json().data).toEqual({ accepted: true });

    const exchanged = await harness.app.inject({
      method: 'POST',
      url: '/api/company-management-links/exchange',
      payload: { token: 'selector-secret.selector-secret-value' },
    });
    expect(exchanged.statusCode).toBe(200);
    expect(exchanged.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'takeover_management', httpOnly: true }),
        expect.objectContaining({ name: 'takeover_management_csrf' }),
      ]),
    );
    expect(exchanged.body).not.toContain('management-session-secret');
    expect(exchanged.json().data.company.id).toBe(company.id);
  });

  it('returns exactly one scoped context and revokes with valid Origin and CSRF', async () => {
    const harness = buildIdentityApp();
    const cookie = 'takeover_management=session; takeover_management_csrf=management-csrf-secret';
    const context = await harness.app.inject({
      method: 'GET',
      url: '/api/company-management/context',
      headers: { cookie },
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().data.company.id).toBe(company.id);
    expect(context.json().data.companies).toBeUndefined();

    const revoked = await harness.app.inject({
      method: 'DELETE',
      url: '/api/company-management/session',
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        'x-csrf-token': 'management-csrf-secret',
      },
    });
    expect(revoked.statusCode).toBe(204);
    expect(harness.service.revokeManagementSession).toHaveBeenCalledOnce();
    expect(revoked.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'takeover_management', value: '' }),
        expect.objectContaining({ name: 'takeover_management_csrf', value: '' }),
      ]),
    );
  });

  it('lists pending access requests with the management session alone', async () => {
    const harness = buildIdentityApp();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/company-management/access-requests?limit=1',
      headers: { cookie: 'takeover_management=session' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      items: [
        expect.objectContaining({
          id: '77777777-7777-4777-8777-777777777777',
          requesterEmail: 'requester@example.com',
          status: 'pending',
        }),
      ],
      nextCursor: null,
    });
    expect(harness.service.listAccessRequests).toHaveBeenCalledWith({ limit: 1 }, 'session');
  });

  it('returns the validation envelope for a malformed access-request cursor', async () => {
    const harness = buildIdentityApp();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/company-management/access-requests?cursor=not%21a%21cursor',
      headers: { cookie: 'takeover_management=session' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(harness.service.listAccessRequests).not.toHaveBeenCalled();
  });

  it.each(['approve', 'reject'] as const)(
    '%s access decisions require the scoped cookie, Origin, and CSRF',
    async (decision) => {
      const harness = buildIdentityApp();
      const response = await harness.app.inject({
        method: 'POST',
        url: `/api/company-access-requests/77777777-7777-4777-8777-777777777777/${decision}`,
        headers: {
          cookie: 'takeover_management=session; takeover_management_csrf=management-csrf-secret',
          origin: 'http://localhost:3000',
          'x-csrf-token': 'management-csrf-secret',
        },
        payload: decision === 'reject' ? { reason: 'Not recognized' } : {},
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ checkoutAvailable: false });
      const method =
        decision === 'approve'
          ? harness.service.approveAccessRequest
          : harness.service.rejectAccessRequest;
      expect(method).toHaveBeenCalledWith(
        '77777777-7777-4777-8777-777777777777',
        decision === 'reject' ? { reason: 'Not recognized' } : {},
        'session',
        'management-csrf-secret',
        expect.objectContaining({ requestId: expect.any(String) }),
      );
    },
  );
});
