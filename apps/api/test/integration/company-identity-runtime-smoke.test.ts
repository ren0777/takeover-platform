import { getDatabaseClient } from '@takeover/database';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseApiConfig } from '../../src/config/env.js';
import {
  createDevelopmentEmailProvider,
  type DevelopmentEmailCapture,
} from '../../src/integrations/email/development-email-provider.js';
import { PrismaCompanyIdentityRepository } from '../../src/modules/company-identity/prisma-repository.js';
import { createCompanyIdentityService } from '../../src/modules/company-identity/service.js';
import { createOpaqueTokenService } from '../../src/security/opaque-token.js';

const prisma = getDatabaseClient();

type ClaimResponse = {
  data: {
    checkoutAvailable: boolean;
    company: { id: string; status: string };
    intent: { id: string; status: string };
  };
};

type ExchangeResponse = {
  data: {
    accessRequest?: { id: string; status: string };
    checkoutAvailable: boolean;
    company: { id: string; status: string };
  };
};

type ManagementContextResponse = {
  data: {
    company: { id: string };
    csrfToken: string;
    verificationLevels: string[];
  };
};

async function resetIdentityTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "takeover_intents", "company_contacts", "companies"
    RESTART IDENTITY CASCADE`);
}

function capturedFragmentToken(capture: DevelopmentEmailCapture, type: string): string {
  const messages = capture.list();
  expect(messages).toHaveLength(1);
  const message = messages[0];
  if (message === undefined || message.type !== type) {
    throw new Error(`Expected one ${type} development email capture`);
  }
  const link = message.body.match(/https?:\/\/[^\s]+/)?.[0];
  if (link === undefined) throw new Error('Expected a development email link');
  const token = new URL(link).hash.match(/^#token=(.+)$/)?.[1];
  if (token === undefined) throw new Error('Expected a fragment capability token');
  return decodeURIComponent(token);
}

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  expect(cookies).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^takeover_management=.*HttpOnly/i),
      expect.stringMatching(/^takeover_management_csrf=/i),
    ]),
  );
  return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function loopbackOrigin(address: string | { port: number } | null): string {
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the runtime smoke server to listen on TCP loopback');
  }
  return `http://127.0.0.1:${address.port}`;
}

describe('Phase 1 loopback runtime identity smoke', () => {
  it('runs the passwordless claim, management, and access-review flow over HTTP', async () => {
    const config = parseApiConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DEV_EMAIL_CAPTURE_ENABLED: 'true',
      EMAIL_PROVIDER: 'development',
      NODE_ENV: 'development',
    });
    const { capture, provider } = createDevelopmentEmailProvider({
      webAppOrigin: config.identity.webAppOrigin,
    });
    const service = createCompanyIdentityService({
      clock: { now: () => new Date() },
      config: config.identity,
      emailProvider: provider,
      repository: new PrismaCompanyIdentityRepository(prisma),
      tokens: createOpaqueTokenService(config.identity.tokenHmacSecret),
    });
    const app = buildApp({
      companyIdentity: { config: config.identity, service },
      logger: false,
      nodeEnv: config.nodeEnv,
    });

    try {
      await resetIdentityTables();
      await app.listen({ host: '127.0.0.1', port: 0 });
      const origin = loopbackOrigin(app.server.address());
      const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, init);
      const jsonHeaders = { 'content-type': 'application/json' };

      const initialClaim = await request('/api/company-claims', {
        body: JSON.stringify({
          company: { name: 'Runtime Acme', websiteUrl: 'https://runtime-acme.example' },
          contactEmail: 'manager@runtime-acme.example',
          intent: { territoryExternalRef: 'runtime-acme' },
        }),
        headers: jsonHeaders,
        method: 'POST',
      });
      expect(initialClaim.status).toBe(202);
      const initialClaimBody = (await initialClaim.json()) as ClaimResponse;
      expect(initialClaimBody.data).toMatchObject({
        checkoutAvailable: false,
        company: { status: 'draft' },
        intent: { status: 'awaiting_email_verification' },
      });
      expect(initialClaimBody.data).not.toHaveProperty('ownership');
      expect(initialClaimBody.data).not.toHaveProperty('payment');

      const verificationToken = capturedFragmentToken(capture, 'verification');
      capture.clear();
      const verificationExchange = await request('/api/email-verifications/exchange', {
        body: JSON.stringify({ token: verificationToken }),
        headers: jsonHeaders,
        method: 'POST',
      });
      expect(verificationExchange.status).toBe(200);
      const managerCookies = cookieHeader(verificationExchange);
      const verificationBody = (await verificationExchange.json()) as ExchangeResponse;
      expect(verificationBody.data.checkoutAvailable).toBe(false);
      expect(verificationBody.data.company.id).toBe(initialClaimBody.data.company.id);

      const initialContext = await request('/api/company-management/context', {
        headers: { cookie: managerCookies },
      });
      expect(initialContext.status).toBe(200);
      const initialContextBody = (await initialContext.json()) as ManagementContextResponse;
      expect(initialContextBody.data).toMatchObject({
        company: { id: initialClaimBody.data.company.id },
        csrfToken: expect.any(String),
        verificationLevels: ['contact_verified'],
      });

      await prisma.company.update({
        where: { id: initialClaimBody.data.company.id },
        data: { expiresAt: null, status: 'ACTIVE' },
      });

      const managementLink = await request('/api/company-management-links', {
        body: JSON.stringify({
          companyWebsiteUrl: 'https://runtime-acme.example',
          contactEmail: 'manager@runtime-acme.example',
        }),
        headers: jsonHeaders,
        method: 'POST',
      });
      const invalidDiscovery = await request('/api/company-management-links', {
        body: JSON.stringify({
          companySlug: 'not-a-runtime-company',
          contactEmail: 'nobody@runtime-acme.example',
        }),
        headers: jsonHeaders,
        method: 'POST',
      });
      expect(managementLink.status).toBe(invalidDiscovery.status);
      expect(((await managementLink.json()) as { data: unknown }).data).toEqual({ accepted: true });
      expect(((await invalidDiscovery.json()) as { data: unknown }).data).toEqual({
        accepted: true,
      });

      const managementLinkToken = capturedFragmentToken(capture, 'management_link');
      capture.clear();
      const managementExchange = await request('/api/company-management-links/exchange', {
        body: JSON.stringify({ token: managementLinkToken }),
        headers: jsonHeaders,
        method: 'POST',
      });
      expect(managementExchange.status).toBe(200);
      const renewedManagerCookies = cookieHeader(managementExchange);
      const managementExchangeBody = (await managementExchange.json()) as ManagementContextResponse;
      expect(managementExchangeBody.data.company.id).toBe(initialClaimBody.data.company.id);

      const replayedManagementLink = await request('/api/company-management-links/exchange', {
        body: JSON.stringify({ token: managementLinkToken }),
        headers: jsonHeaders,
        method: 'POST',
      });
      expect(replayedManagementLink.status).toBe(401);

      const createAccessRequest = async (
        contactEmail: string,
        territoryExternalRef: string,
      ): Promise<string> => {
        const claim = await request('/api/company-claims', {
          body: JSON.stringify({
            company: {
              name: 'Different supplied name',
              websiteUrl: 'https://runtime-acme.example',
            },
            contactEmail,
            intent: { territoryExternalRef },
          }),
          headers: jsonHeaders,
          method: 'POST',
        });
        expect(claim.status).toBe(202);
        expect(((await claim.json()) as ClaimResponse).data.checkoutAvailable).toBe(false);
        const requesterVerificationToken = capturedFragmentToken(capture, 'verification');
        capture.clear();
        const exchange = await request('/api/email-verifications/exchange', {
          body: JSON.stringify({ token: requesterVerificationToken }),
          headers: jsonHeaders,
          method: 'POST',
        });
        expect(exchange.status).toBe(200);
        const exchangeBody = (await exchange.json()) as ExchangeResponse;
        expect(exchangeBody.data).toMatchObject({
          accessRequest: { id: expect.any(String), status: 'pending' },
          checkoutAvailable: false,
          company: { id: initialClaimBody.data.company.id, status: 'active' },
        });
        capture.clear();
        const accessRequestId = exchangeBody.data.accessRequest?.id;
        if (accessRequestId === undefined) throw new Error('Expected a pending access request');
        return accessRequestId;
      };

      const approvedRequestId = await createAccessRequest(
        'approve-requester@runtime-acme.example',
        'runtime-approve',
      );
      const rejectedRequestId = await createAccessRequest(
        'reject-requester@runtime-acme.example',
        'runtime-reject',
      );

      const pendingRequests = await request('/api/company-management/access-requests', {
        headers: { cookie: renewedManagerCookies },
      });
      expect(pendingRequests.status).toBe(200);
      const pendingRequestsBody = (await pendingRequests.json()) as {
        data: { items: Array<{ id: string; status: string }>; nextCursor: string | null };
      };
      expect(pendingRequestsBody.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: approvedRequestId, status: 'pending' }),
          expect.objectContaining({ id: rejectedRequestId, status: 'pending' }),
        ]),
      );

      const rejectedWithoutOrigin = await request(
        `/api/company-access-requests/${rejectedRequestId}/reject`,
        {
          body: JSON.stringify({ reason: 'Not recognized' }),
          headers: {
            ...jsonHeaders,
            cookie: renewedManagerCookies,
            'x-csrf-token': managementExchangeBody.data.csrfToken,
          },
          method: 'POST',
        },
      );
      expect(rejectedWithoutOrigin.status).toBe(403);

      const approvedWithBadCsrf = await request(
        `/api/company-access-requests/${approvedRequestId}/approve`,
        {
          body: JSON.stringify({}),
          headers: {
            ...jsonHeaders,
            cookie: renewedManagerCookies,
            origin: config.identity.webAppOrigin,
            'x-csrf-token': 'incorrect-csrf-token',
          },
          method: 'POST',
        },
      );
      expect(approvedWithBadCsrf.status).toBe(401);

      const approved = await request(`/api/company-access-requests/${approvedRequestId}/approve`, {
        body: JSON.stringify({}),
        headers: {
          ...jsonHeaders,
          cookie: renewedManagerCookies,
          origin: config.identity.webAppOrigin,
          'x-csrf-token': managementExchangeBody.data.csrfToken,
        },
        method: 'POST',
      });
      expect(approved.status).toBe(200);
      expect(
        (
          (await approved.json()) as {
            data: { checkoutAvailable: boolean; accessRequest: { status: string } };
          }
        ).data,
      ).toMatchObject({
        accessRequest: { status: 'approved' },
        checkoutAvailable: false,
      });
      capture.clear();

      const rejected = await request(`/api/company-access-requests/${rejectedRequestId}/reject`, {
        body: JSON.stringify({ reason: 'Not recognized' }),
        headers: {
          ...jsonHeaders,
          cookie: renewedManagerCookies,
          origin: config.identity.webAppOrigin,
          'x-csrf-token': managementExchangeBody.data.csrfToken,
        },
        method: 'POST',
      });
      expect(rejected.status).toBe(200);
      expect(
        (
          (await rejected.json()) as {
            data: { checkoutAvailable: boolean; accessRequest: { status: string } };
          }
        ).data,
      ).toMatchObject({
        accessRequest: { status: 'rejected' },
        checkoutAvailable: false,
      });
    } finally {
      capture.clear();
      await app.close();
      await resetIdentityTables();
    }
  }, 30_000);
});
