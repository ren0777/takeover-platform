import { randomUUID } from 'node:crypto';
import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseApiConfig } from '../../src/config/env.js';
import {
  PrismaCompanyIdentityRepository,
  mapMinorAmountToSafeInteger,
} from '../../src/modules/company-identity/prisma-repository.js';
import { createOpaqueTokenService } from '../../src/security/opaque-token.js';

const prisma = getDatabaseClient();

async function resetIdentityTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "takeover_intents", "company_contacts", "companies"
    RESTART IDENTITY CASCADE`);
}

async function createCompany(
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
  normalizedWebsite: string,
) {
  return prisma.company.create({
    data: {
      expiresAt: status === 'DRAFT' ? new Date(Date.now() + 86_400_000) : null,
      name: 'Acme',
      normalizedName: 'acme',
      normalizedWebsite,
      status,
      websiteUrl: normalizedWebsite,
    },
  });
}

beforeEach(resetIdentityTables);

describe('Phase 1 PostgreSQL invariants', () => {
  it("lists only its company's unexpired pending requests in deterministic cursor order", async () => {
    const companyA = await createCompany('ACTIVE', 'https://company-a-review.example/');
    const companyB = await createCompany('ACTIVE', 'https://company-b-review.example/');
    const manager = await prisma.companyContact.create({
      data: { email: 'manager@company-a.example', normalizedEmail: 'manager@company-a.example' },
    });
    const grant = await prisma.companyManagementGrant.create({
      data: { companyId: companyA.id, contactId: manager.id, source: 'INITIAL_CONTACT' },
    });
    const apiConfig = parseApiConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      EMAIL_PROVIDER: 'development',
      NODE_ENV: 'test',
    });
    const tokens = createOpaqueTokenService(apiConfig.identity.tokenHmacSecret);
    const session = tokens.issueSessionToken();
    await prisma.companyManagementSession.create({
      data: {
        companyId: companyA.id,
        csrfDigest: Buffer.from(tokens.issueSessionToken().digest),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        grantId: grant.id,
        tokenDigest: Buffer.from(session.digest),
      },
    });
    const [firstRequester, secondRequester, expiredRequester, otherRequester] = await Promise.all(
      [
        'first@requester.example',
        'second@requester.example',
        'expired@requester.example',
        'other@requester.example',
      ].map((email) => prisma.companyContact.create({ data: { email, normalizedEmail: email } })),
    );
    if (
      firstRequester === undefined ||
      secondRequester === undefined ||
      expiredRequester === undefined ||
      otherRequester === undefined
    ) {
      throw new Error('Expected four requester contacts');
    }
    const [firstIntent, secondIntent, otherIntent] = await Promise.all([
      prisma.takeoverIntent.create({
        data: {
          companyId: companyA.id,
          contactId: firstRequester.id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          status: 'AWAITING_COMPANY_ACCESS',
          territoryExternalRef: 'first-territory',
        },
      }),
      prisma.takeoverIntent.create({
        data: {
          companyId: companyA.id,
          contactId: secondRequester.id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          status: 'AWAITING_COMPANY_ACCESS',
          territoryExternalRef: 'second-territory',
        },
      }),
      prisma.takeoverIntent.create({
        data: {
          companyId: companyB.id,
          contactId: otherRequester.id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          status: 'AWAITING_COMPANY_ACCESS',
          territoryExternalRef: 'other-company-territory',
        },
      }),
    ]);
    const requestedAt = new Date('2026-08-30T12:00:00.000Z');
    await Promise.all([
      prisma.companyAccessRequest.create({
        data: {
          companyId: companyA.id,
          contactId: firstRequester.id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          id: '10000000-0000-4000-8000-000000000000',
          requestedAt,
          takeoverIntentId: firstIntent.id,
        },
      }),
      prisma.companyAccessRequest.create({
        data: {
          companyId: companyA.id,
          contactId: secondRequester.id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          id: '20000000-0000-4000-8000-000000000000',
          requestedAt,
          takeoverIntentId: secondIntent.id,
        },
      }),
      prisma.companyAccessRequest.create({
        data: {
          companyId: companyA.id,
          contactId: expiredRequester.id,
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
          id: '30000000-0000-4000-8000-000000000000',
          requestedAt: new Date('2019-12-31T00:00:00.000Z'),
        },
      }),
      prisma.companyAccessRequest.create({
        data: {
          companyId: companyB.id,
          contactId: otherRequester.id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          id: '40000000-0000-4000-8000-000000000000',
          requestedAt,
          takeoverIntentId: otherIntent.id,
        },
      }),
    ]);
    const app = buildApp({ config: apiConfig, logger: false });
    try {
      const firstPage = await app.inject({
        method: 'GET',
        url: '/api/company-management/access-requests?limit=1',
        headers: { cookie: `takeover_management=${session.rawToken}` },
      });
      expect(firstPage.statusCode).toBe(200);
      expect(firstPage.json().data).toEqual({
        items: [
          {
            companyId: companyA.id,
            expiresAt: '2030-01-01T00:00:00.000Z',
            id: '10000000-0000-4000-8000-000000000000',
            intent: { id: firstIntent.id, territoryExternalRef: 'first-territory' },
            requestedAt: requestedAt.toISOString(),
            requesterEmail: 'first@requester.example',
            status: 'pending',
          },
        ],
        nextCursor: expect.any(String),
      });
      expect(firstPage.body).not.toContain(companyB.id);
      expect(firstPage.body).not.toContain('contactId');

      const secondPage = await app.inject({
        method: 'GET',
        url: `/api/company-management/access-requests?limit=1&cursor=${firstPage.json().data.nextCursor}`,
        headers: { cookie: `takeover_management=${session.rawToken}` },
      });
      expect(secondPage.statusCode).toBe(200);
      expect(secondPage.json().data).toMatchObject({
        items: [
          expect.objectContaining({
            id: '20000000-0000-4000-8000-000000000000',
            intent: { id: secondIntent.id, territoryExternalRef: 'second-territory' },
          }),
        ],
        nextCursor: null,
      });

      const malformedCursor = await app.inject({
        method: 'GET',
        url: '/api/company-management/access-requests?cursor=e30',
        headers: { cookie: `takeover_management=${session.rawToken}` },
      });
      expect(malformedCursor.statusCode).toBe(400);
      expect(malformedCursor.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('wires the real claim route when validated database configuration is supplied', async () => {
    const apiConfig = parseApiConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      EMAIL_PROVIDER: 'development',
      NODE_ENV: 'test',
    });
    const app = buildApp({ config: apiConfig, logger: false });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/company-claims',
        payload: {
          company: { name: 'My Cool Startup', websiteUrl: 'https://mycoolstartup.com' },
          contactEmail: 'founder@gmail.com',
          intent: { territoryExternalRef: 'ai-coding' },
        },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json().data).toMatchObject({ checkoutAvailable: false });
      await expect(prisma.emailVerificationChallenge.count()).resolves.toBe(1);
    } finally {
      await app.close();
    }
  });

  it('creates a new-company claim atomically without storing a raw token', async () => {
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const tokenDigest = new Uint8Array(32).fill(9);
    const result = await repository.beginCompanyClaim({
      challenge: {
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        selector: 'selector-new-company',
        tokenDigest,
      },
      company: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        name: 'Acme',
        normalizedName: 'acme',
        normalizedWebsite: 'https://acme.example/',
        websiteUrl: 'https://acme.example/',
      },
      contact: { email: 'founder@gmail.com', normalizedEmail: 'founder@gmail.com' },
      intent: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        territoryExternalRef: 'ai-coding',
      },
      now: new Date('2026-08-30T13:00:00.000Z'),
      requestId: randomUUID(),
    });

    expect(result.kind).toBe('new_company');
    expect(result.company.status).toBe('DRAFT');
    expect(result.challenge.tokenDigest).toEqual(tokenDigest);
    expect(JSON.stringify(result)).not.toContain('raw-verification-token');
    await expect(prisma.auditLog.count()).resolves.toBe(1);
  });

  it('consumes new-company verification once and atomically creates scoped authority', async () => {
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const tokenDigest = new Uint8Array(32).fill(4);
    const claim = await repository.beginCompanyClaim({
      challenge: {
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        selector: 'selector-draft-exchange',
        tokenDigest,
      },
      company: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        name: 'Acme',
        normalizedName: 'acme',
        normalizedWebsite: 'https://acme.example/',
        websiteUrl: 'https://acme.example/',
      },
      contact: { email: 'founder@gmail.com', normalizedEmail: 'founder@gmail.com' },
      intent: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        territoryExternalRef: 'ai-coding',
      },
      now: new Date('2026-08-30T13:00:00.000Z'),
    });
    await repository.markChallengeDelivery(claim.challenge.id, 'SENT');

    const exchange = await repository.consumeContactVerification({
      accessRequestExpiresAt: new Date('2026-09-06T13:05:00.000Z'),
      candidateDigest: tokenDigest,
      csrfDigest: new Uint8Array(32).fill(6),
      maxFailedAttempts: 10,
      now: new Date('2026-08-30T13:05:00.000Z'),
      selector: 'selector-draft-exchange',
      sessionExpiresAt: new Date('2026-08-30T21:05:00.000Z'),
      sessionTokenDigest: new Uint8Array(32).fill(5),
    });

    expect(exchange.kind).toBe('management_session');
    expect(await prisma.companyManagementGrant.count()).toBe(1);
    expect(await prisma.companyManagementSession.count()).toBe(1);
    expect(await prisma.companyVerification.count({ where: { status: 'VERIFIED' } })).toBe(1);
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: claim.intent.id } }),
    ).resolves.toMatchObject({ status: 'IDENTITY_READY' });

    await expect(
      repository.consumeContactVerification({
        accessRequestExpiresAt: new Date('2026-09-06T13:06:00.000Z'),
        candidateDigest: tokenDigest,
        csrfDigest: new Uint8Array(32).fill(8),
        maxFailedAttempts: 10,
        now: new Date('2026-08-30T13:06:00.000Z'),
        selector: 'selector-draft-exchange',
        sessionExpiresAt: new Date('2026-08-30T21:06:00.000Z'),
        sessionTokenDigest: new Uint8Array(32).fill(7),
      }),
    ).resolves.toEqual({ kind: 'invalid' });
    expect(await prisma.companyManagementSession.count()).toBe(1);
    await expect(
      prisma.auditLog.count({ where: { action: 'email_challenge.exchange_failed' } }),
    ).resolves.toBe(1);
  });

  it('routes a verified contact for an authoritative company into pending access', async () => {
    const company = await createCompany('ACTIVE', 'https://acme.example/');
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const tokenDigest = new Uint8Array(32).fill(3);
    const claim = await repository.beginCompanyClaim({
      challenge: {
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        selector: 'selector-existing-company',
        tokenDigest,
      },
      company: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        name: 'Attacker Supplied Name',
        normalizedName: 'attacker supplied name',
        normalizedWebsite: company.normalizedWebsite,
        websiteUrl: company.websiteUrl,
      },
      contact: { email: 'other@gmail.com', normalizedEmail: 'other@gmail.com' },
      intent: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        territoryExternalRef: 'ai-coding',
      },
      now: new Date('2026-08-30T13:00:00.000Z'),
    });
    await repository.markChallengeDelivery(claim.challenge.id, 'SENT');

    const exchange = await repository.consumeContactVerification({
      accessRequestExpiresAt: new Date('2026-09-06T13:05:00.000Z'),
      candidateDigest: tokenDigest,
      csrfDigest: new Uint8Array(32).fill(2),
      maxFailedAttempts: 10,
      now: new Date('2026-08-30T13:05:00.000Z'),
      selector: 'selector-existing-company',
      sessionExpiresAt: new Date('2026-08-30T21:05:00.000Z'),
      sessionTokenDigest: new Uint8Array(32).fill(1),
    });

    expect(claim.kind).toBe('existing_company');
    expect(claim.company.name).toBe('Acme');
    expect(exchange.kind).toBe('access_request');
    expect(await prisma.companyAccessRequest.count({ where: { status: 'PENDING' } })).toBe(1);
    expect(await prisma.companyManagementGrant.count()).toBe(0);
    expect(await prisma.companyManagementSession.count()).toBe(0);
  });

  it('rejects a contact-verification challenge after the contact is revoked', async () => {
    const company = await createCompany('ACTIVE', 'https://revoked-contact.example/');
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const tokenDigest = new Uint8Array(32).fill(18);
    const claim = await repository.beginCompanyClaim({
      challenge: {
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        selector: 'selector-revoked-contact',
        tokenDigest,
      },
      company: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        name: 'Ignored',
        normalizedName: 'ignored',
        normalizedWebsite: company.normalizedWebsite,
        websiteUrl: company.websiteUrl,
      },
      contact: { email: 'revoked@gmail.com', normalizedEmail: 'revoked@gmail.com' },
      intent: {
        expiresAt: new Date('2026-08-31T13:00:00.000Z'),
        territoryExternalRef: 'ai-coding',
      },
      now: new Date('2026-08-30T13:00:00.000Z'),
    });
    await repository.markChallengeDelivery(claim.challenge.id, 'SENT');
    await prisma.companyContact.update({
      where: { id: claim.contact.id },
      data: { revokedAt: new Date('2026-08-30T13:01:00.000Z') },
    });

    await expect(
      repository.getContactVerificationAccessScope({
        candidateDigest: tokenDigest,
        maxFailedAttempts: 10,
        now: new Date('2026-08-30T13:05:00.000Z'),
        selector: 'selector-revoked-contact',
      }),
    ).resolves.toBeNull();
    await expect(
      repository.consumeContactVerification({
        accessRequestExpiresAt: new Date('2026-09-06T13:05:00.000Z'),
        candidateDigest: tokenDigest,
        csrfDigest: new Uint8Array(32).fill(19),
        maxFailedAttempts: 10,
        now: new Date('2026-08-30T13:05:00.000Z'),
        selector: 'selector-revoked-contact',
        sessionExpiresAt: new Date('2026-08-30T21:05:00.000Z'),
        sessionTokenDigest: new Uint8Array(32).fill(20),
      }),
    ).resolves.toEqual({ kind: 'invalid' });
    await expect(prisma.companyAccessRequest.count()).resolves.toBe(0);
  });

  it('deduplicates concurrent pending access requests and preserves one prepared intent', async () => {
    const company = await createCompany('ACTIVE', 'https://reuse.example/');
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const createClaim = async (selector: string, fill: number) => {
      const tokenDigest = new Uint8Array(32).fill(fill);
      const claim = await repository.beginCompanyClaim({
        challenge: {
          expiresAt: new Date('2026-08-30T13:15:00.000Z'),
          selector,
          tokenDigest,
        },
        company: {
          expiresAt: new Date('2026-08-31T13:00:00.000Z'),
          name: 'Ignored',
          normalizedName: 'ignored',
          normalizedWebsite: company.normalizedWebsite,
          websiteUrl: company.websiteUrl,
        },
        contact: { email: 'requester@gmail.com', normalizedEmail: 'requester@gmail.com' },
        intent: {
          expiresAt: new Date('2026-08-31T13:00:00.000Z'),
          territoryExternalRef: fill === 20 ? 'ai-coding' : 'devtools',
        },
        now: new Date('2026-08-30T13:00:00.000Z'),
      });
      await repository.markChallengeDelivery(claim.challenge.id, 'SENT');
      return {
        claim,
        exchange: () =>
          repository.consumeContactVerification({
            accessRequestExpiresAt: new Date('2026-09-06T13:05:00.000Z'),
            candidateDigest: tokenDigest,
            csrfDigest: new Uint8Array(32).fill(fill + 1),
            maxFailedAttempts: 10,
            now: new Date('2026-08-30T13:05:00.000Z'),
            selector,
            sessionExpiresAt: new Date('2026-08-30T21:05:00.000Z'),
            sessionTokenDigest: new Uint8Array(32).fill(fill + 2),
          }),
      };
    };

    const first = await createClaim('reuse-first', 20);
    const second = await createClaim('reuse-second', 30);
    const [firstExchange, secondExchange] = await Promise.all([
      first.exchange(),
      second.exchange(),
    ]);

    expect(firstExchange).toMatchObject({ kind: 'access_request' });
    expect(secondExchange).toMatchObject({ kind: 'access_request' });
    expect(await prisma.companyAccessRequest.count()).toBe(1);
    const pending = await prisma.companyAccessRequest.findFirstOrThrow();
    expect([first.claim.intent.id, second.claim.intent.id]).toContain(pending.takeoverIntentId);
    const intents = await prisma.takeoverIntent.findMany({
      where: { id: { in: [first.claim.intent.id, second.claim.intent.id] } },
    });
    expect(intents.filter(({ status }) => status === 'CANCELLED')).toHaveLength(1);
    expect(intents.filter(({ status }) => status === 'AWAITING_COMPANY_ACCESS')).toHaveLength(1);
  });

  it('allows private drafts but only one authoritative normalized website', async () => {
    await createCompany('DRAFT', 'https://acme.example/');
    await createCompany('DRAFT', 'https://acme.example/');
    await createCompany('ACTIVE', 'https://acme.example/');

    await expect(createCompany('ACTIVE', 'https://acme.example/')).rejects.toThrow();
    await expect(prisma.company.count()).resolves.toBe(3);
  });

  it('allows only one pending request for a company/contact pair', async () => {
    const company = await createCompany('ACTIVE', 'https://acme.example/');
    const contact = await prisma.companyContact.create({
      data: { email: 'founder@gmail.com', normalizedEmail: 'founder@gmail.com' },
    });

    await prisma.companyAccessRequest.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date(Date.now() + 604_800_000),
      },
    });
    await expect(
      prisma.companyAccessRequest.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          expiresAt: new Date(Date.now() + 604_800_000),
        },
      }),
    ).rejects.toThrow();
  });

  it('increments a durable fixed-window rate bucket atomically', async () => {
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const input = {
      expiresAt: new Date('2026-08-30T14:00:00.000Z'),
      keyDigest: new Uint8Array(32).fill(7),
      limit: 7,
      now: new Date('2026-08-30T13:15:00.000Z'),
      windowStartedAt: new Date('2026-08-30T13:00:00.000Z'),
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => repository.consumeRateLimit(input)),
    );

    expect(results.filter(({ allowed }) => allowed)).toHaveLength(7);
    await expect(prisma.securityRateLimitBucket.findFirstOrThrow()).resolves.toMatchObject({
      count: 7,
    });
  });

  it('writes a session audit in the same transaction', async () => {
    const company = await createCompany('DRAFT', 'https://acme.example/');
    const contact = await prisma.companyContact.create({
      data: {
        email: 'founder@gmail.com',
        emailVerifiedAt: new Date(),
        normalizedEmail: 'founder@gmail.com',
      },
    });
    const grant = await prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
    });
    const repository = new PrismaCompanyIdentityRepository(prisma);

    const session = await repository.createManagementSession({
      companyId: company.id,
      csrfDigest: new Uint8Array(32).fill(2),
      expiresAt: new Date(Date.now() + 28_800_000),
      grantId: grant.id,
      requestId: randomUUID(),
      tokenDigest: new Uint8Array(32).fill(1),
    });

    expect(session.companyId).toBe(company.id);
    await expect(
      prisma.auditLog.findFirst({ where: { targetId: session.sessionId } }),
    ).resolves.toMatchObject({
      action: 'company_management_session.created',
      companyId: company.id,
      targetType: 'company_management_session',
    });
  });

  it('resolves management links by website or slug only for eligible company-scoped grants', async () => {
    const company = await createCompany('ACTIVE', 'https://acme.example/');
    await prisma.company.update({ where: { id: company.id }, data: { slug: 'acme-tools' } });
    const contact = await prisma.companyContact.create({
      data: {
        email: 'founder@gmail.com',
        emailVerifiedAt: new Date('2026-08-30T13:00:00.000Z'),
        normalizedEmail: 'founder@gmail.com',
      },
    });
    await prisma.companyVerification.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        level: 'CONTACT_VERIFIED',
        source: 'email_challenge',
        status: 'VERIFIED',
        verifiedAt: new Date('2026-08-30T13:00:00.000Z'),
      },
    });
    await prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
    });
    const repository = new PrismaCompanyIdentityRepository(prisma);

    await expect(
      repository.issueManagementChallenge({
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        locator: { normalizedWebsite: company.normalizedWebsite },
        normalizedEmail: 'unknown@gmail.com',
        now: new Date('2026-08-30T13:00:00.000Z'),
        selector: 'management-unknown',
        tokenDigest: new Uint8Array(32).fill(1),
      }),
    ).resolves.toBeNull();
    const otherCompany = await createCompany('ACTIVE', 'https://other-acme.example/');
    const crossVerifiedContact = await prisma.companyContact.create({
      data: {
        email: 'cross-verified@gmail.com',
        emailVerifiedAt: new Date('2026-08-30T13:00:00.000Z'),
        normalizedEmail: 'cross-verified@gmail.com',
      },
    });
    await prisma.companyVerification.create({
      data: {
        companyId: otherCompany.id,
        contactId: crossVerifiedContact.id,
        level: 'CONTACT_VERIFIED',
        source: 'email_challenge',
        status: 'VERIFIED',
        verifiedAt: new Date('2026-08-30T13:00:00.000Z'),
      },
    });
    await prisma.companyManagementGrant.create({
      data: {
        companyId: company.id,
        contactId: crossVerifiedContact.id,
        source: 'INITIAL_CONTACT',
      },
    });
    await expect(
      repository.issueManagementChallenge({
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        locator: { normalizedWebsite: company.normalizedWebsite },
        normalizedEmail: crossVerifiedContact.normalizedEmail,
        now: new Date('2026-08-30T13:00:00.000Z'),
        selector: 'management-cross-company-verification',
        tokenDigest: new Uint8Array(32).fill(4),
      }),
    ).resolves.toBeNull();
    await expect(
      repository.issueManagementChallenge({
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        locator: { normalizedWebsite: company.normalizedWebsite },
        normalizedEmail: 'founder@gmail.com',
        now: new Date('2026-08-30T13:00:00.000Z'),
        selector: 'management-known',
        tokenDigest: new Uint8Array(32).fill(2),
      }),
    ).resolves.toMatchObject({ companyName: 'Acme', toEmail: 'founder@gmail.com' });
    await expect(
      repository.issueManagementChallenge({
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        locator: { normalizedSlug: 'acme-tools' },
        normalizedEmail: 'founder@gmail.com',
        now: new Date('2026-08-30T13:00:00.000Z'),
        selector: 'management-by-slug',
        tokenDigest: new Uint8Array(32).fill(3),
      }),
    ).resolves.toMatchObject({ companyName: 'Acme', toEmail: 'founder@gmail.com' });
  });

  it('returns the same accepted envelope for matching, unknown, and ineligible management discovery', async () => {
    const active = await createCompany('ACTIVE', 'https://active-management.example/');
    await prisma.company.update({ where: { id: active.id }, data: { slug: 'active-management' } });
    const archived = await createCompany('ARCHIVED', 'https://archived-management.example/');
    const addVerifiedManager = async (companyId: string, email: string) => {
      const contact = await prisma.companyContact.create({
        data: { email, emailVerifiedAt: new Date(), normalizedEmail: email },
      });
      await prisma.companyVerification.create({
        data: {
          companyId,
          contactId: contact.id,
          level: 'CONTACT_VERIFIED',
          source: 'email_challenge',
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      });
      await prisma.companyManagementGrant.create({
        data: { companyId, contactId: contact.id, source: 'INITIAL_CONTACT' },
      });
    };
    await addVerifiedManager(active.id, 'active-manager@example.com');
    await addVerifiedManager(archived.id, 'archived-manager@example.com');

    const app = buildApp({
      config: parseApiConfig({
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        EMAIL_PROVIDER: 'development',
        NODE_ENV: 'test',
      }),
      logger: false,
    });
    try {
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/company-management-links',
          payload: {
            companyWebsiteUrl: active.websiteUrl,
            contactEmail: 'active-manager@example.com',
          },
        }),
        app.inject({
          method: 'POST',
          url: '/api/company-management-links',
          payload: { companySlug: 'unknown-company', contactEmail: 'unknown@example.com' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/company-management-links',
          payload: {
            companyWebsiteUrl: archived.websiteUrl,
            contactEmail: 'archived-manager@example.com',
          },
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
          data: { accepted: true },
          meta: { requestId: expect.any(String) },
        });
        expect(response.body).not.toContain('active-management');
        expect(response.body).not.toContain('archived-management');
      }
    } finally {
      await app.close();
    }
  });

  it('consumes a management link once and replaces prior sessions for its grant', async () => {
    const company = await createCompany('ACTIVE', 'https://acme.example/');
    const contact = await prisma.companyContact.create({
      data: {
        email: 'founder@gmail.com',
        emailVerifiedAt: new Date('2026-08-30T13:00:00.000Z'),
        normalizedEmail: 'founder@gmail.com',
      },
    });
    await prisma.companyVerification.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        level: 'CONTACT_VERIFIED',
        source: 'email_challenge',
        status: 'VERIFIED',
        verifiedAt: new Date('2026-08-30T13:00:00.000Z'),
      },
    });
    const grant = await prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
    });
    await prisma.companyManagementSession.create({
      data: {
        companyId: company.id,
        csrfDigest: Buffer.alloc(32, 4),
        expiresAt: new Date('2026-08-30T20:00:00.000Z'),
        grantId: grant.id,
        tokenDigest: Buffer.alloc(32, 3),
      },
    });
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const linkDigest = new Uint8Array(32).fill(5);
    const issued = await repository.issueManagementChallenge({
      expiresAt: new Date('2026-08-30T13:15:00.000Z'),
      locator: { normalizedWebsite: company.normalizedWebsite },
      normalizedEmail: contact.normalizedEmail,
      now: new Date('2026-08-30T13:00:00.000Z'),
      selector: 'management-exchange',
      tokenDigest: linkDigest,
    });
    if (issued === null) throw new Error('Expected management challenge');
    await repository.markChallengeDelivery(issued.challengeId, 'SENT');

    const exchange = await repository.consumeManagementChallenge({
      candidateDigest: linkDigest,
      csrfDigest: new Uint8Array(32).fill(7),
      maxFailedAttempts: 10,
      now: new Date('2026-08-30T13:05:00.000Z'),
      selector: 'management-exchange',
      sessionExpiresAt: new Date('2026-08-30T21:05:00.000Z'),
      sessionTokenDigest: new Uint8Array(32).fill(6),
    });

    expect(exchange.kind).toBe('management_session');
    expect(await prisma.companyManagementSession.count({ where: { revokedAt: null } })).toBe(1);
    await expect(
      prisma.auditLog.count({ where: { action: 'company_management_session.revoked' } }),
    ).resolves.toBe(1);
    await expect(
      repository.consumeManagementChallenge({
        candidateDigest: linkDigest,
        csrfDigest: new Uint8Array(32).fill(9),
        maxFailedAttempts: 10,
        now: new Date('2026-08-30T13:06:00.000Z'),
        selector: 'management-exchange',
        sessionExpiresAt: new Date('2026-08-30T21:06:00.000Z'),
        sessionTokenDigest: new Uint8Array(32).fill(8),
      }),
    ).resolves.toEqual({ kind: 'invalid' });

    await prisma.companyManagementGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date('2026-08-30T13:07:00.000Z'), status: 'REVOKED' },
    });
    if (exchange.kind !== 'management_session') throw new Error('Expected session');
    await expect(
      repository.resolveManagementSession(
        exchange.session.tokenDigest,
        new Date('2026-08-30T13:08:00.000Z'),
      ),
    ).resolves.toBeNull();
  });

  it.each(['ACCESS_REQUEST_REVIEW', 'ACCESS_DECISION'] as const)(
    'accepts the %s continuation purpose through the management exchange',
    async (purpose) => {
      const company = await createCompany('ACTIVE', `https://${purpose.toLowerCase()}.example/`);
      const contact = await prisma.companyContact.create({
        data: {
          email: `${purpose.toLowerCase()}@gmail.com`,
          emailVerifiedAt: new Date('2026-08-30T13:00:00.000Z'),
          normalizedEmail: `${purpose.toLowerCase()}@gmail.com`,
        },
      });
      await prisma.companyVerification.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          level: 'CONTACT_VERIFIED',
          source: 'email_challenge',
          status: 'VERIFIED',
          verifiedAt: new Date('2026-08-30T13:00:00.000Z'),
        },
      });
      await prisma.companyManagementGrant.create({
        data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
      });
      const digest = new Uint8Array(32).fill(purpose === 'ACCESS_REQUEST_REVIEW' ? 10 : 11);
      await prisma.emailVerificationChallenge.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          deliveryStatus: 'SENT',
          expiresAt: new Date('2026-08-30T13:15:00.000Z'),
          purpose,
          selector: `continuation-${purpose.toLowerCase()}`,
          tokenDigest: Buffer.from(digest),
        },
      });
      const repository = new PrismaCompanyIdentityRepository(prisma);

      await expect(
        repository.consumeManagementChallenge({
          candidateDigest: digest,
          csrfDigest: new Uint8Array(32).fill(12),
          maxFailedAttempts: 10,
          now: new Date('2026-08-30T13:05:00.000Z'),
          selector: `continuation-${purpose.toLowerCase()}`,
          sessionExpiresAt: new Date('2026-08-30T21:05:00.000Z'),
          sessionTokenDigest: new Uint8Array(32).fill(13),
        }),
      ).resolves.toMatchObject({ kind: 'management_session' });
    },
  );

  it('persists recovery only for a verified requester and writes an audit record', async () => {
    const company = await createCompany('ACTIVE', 'https://recovery.example/');
    const contact = await prisma.companyContact.create({
      data: {
        email: 'recovery@gmail.com',
        emailVerifiedAt: new Date('2026-08-30T13:00:00.000Z'),
        normalizedEmail: 'recovery@gmail.com',
      },
    });
    await prisma.companyVerification.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        level: 'CONTACT_VERIFIED',
        source: 'email_challenge',
        status: 'VERIFIED',
        verifiedAt: new Date('2026-08-30T13:00:00.000Z'),
      },
    });
    const intent = await prisma.takeoverIntent.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date('2026-09-01T13:00:00.000Z'),
        status: 'AWAITING_COMPANY_ACCESS',
        territoryExternalRef: 'ai-coding',
      },
    });
    const accessRequest = await prisma.companyAccessRequest.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date('2026-09-06T13:00:00.000Z'),
        takeoverIntentId: intent.id,
      },
    });
    const repository = new PrismaCompanyIdentityRepository(prisma);

    await expect(
      repository.requestManualRecovery({
        accessRequestId: accessRequest.id,
        expiresAt: new Date('2026-09-06T14:00:00.000Z'),
        normalizedEmail: contact.normalizedEmail,
        now: new Date('2026-08-30T14:00:00.000Z'),
        requestId: randomUUID(),
      }),
    ).resolves.toMatchObject({ id: accessRequest.id, status: 'PENDING' });
    await expect(
      repository.requestManualRecovery({
        accessRequestId: accessRequest.id,
        expiresAt: new Date('2026-09-06T14:00:00.000Z'),
        normalizedEmail: 'attacker@gmail.com',
        now: new Date('2026-08-30T14:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.auditLog.count({ where: { action: 'company_recovery.requested' } }),
    ).resolves.toBe(1);
  });

  it('updates only an unexpired identity-ready intent in the authorized company', async () => {
    const company = await createCompany('DRAFT', 'https://intent.example/');
    const otherCompany = await createCompany('DRAFT', 'https://other-intent.example/');
    const contact = await prisma.companyContact.create({
      data: { email: 'intent@gmail.com', normalizedEmail: 'intent@gmail.com' },
    });
    const intent = await prisma.takeoverIntent.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date('2026-09-01T13:00:00.000Z'),
        status: 'IDENTITY_READY',
        territoryExternalRef: 'old-reference',
      },
    });
    const grant = await prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
    });
    const session = await prisma.companyManagementSession.create({
      data: {
        companyId: company.id,
        csrfDigest: Buffer.alloc(32, 14),
        expiresAt: new Date('2026-08-30T21:00:00.000Z'),
        grantId: grant.id,
        tokenDigest: Buffer.alloc(32, 15),
      },
    });
    const repository = new PrismaCompanyIdentityRepository(prisma);

    await expect(
      repository.updateTakeoverPreparation({
        companyId: otherCompany.id,
        intentId: intent.id,
        now: new Date('2026-08-30T13:00:00.000Z'),
        sessionId: session.id,
        territoryExternalRef: 'ai-coding',
      }),
    ).resolves.toBeNull();
    await expect(
      repository.updateTakeoverPreparation({
        companyId: company.id,
        currency: 'USD',
        intendedAmountMinor: 26_000n,
        intentId: intent.id,
        now: new Date('2026-08-30T13:00:00.000Z'),
        quoteObservedAt: new Date('2026-08-30T12:55:00.000Z'),
        quotedMinimumAmountMinor: 26_000n,
        quotedTerritoryVersion: 'version-7',
        quotedWinningAmountMinor: 25_000n,
        sessionId: session.id,
        territoryExternalRef: 'ai-coding',
      }),
    ).resolves.toMatchObject({
      currency: 'USD',
      intendedAmountMinor: 26_000n,
      quotedTerritoryVersion: 'version-7',
      territoryExternalRef: 'ai-coding',
    });
    await expect(
      prisma.auditLog.count({ where: { action: 'takeover_intent.preparation_updated' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { action: 'takeover_intent.preparation_updated' },
      }),
    ).resolves.toMatchObject({ actorId: session.id, actorType: 'MANAGEMENT_SESSION' });
    await prisma.companyManagementGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date('2026-08-30T13:01:00.000Z'), status: 'REVOKED' },
    });
    await expect(
      repository.updateTakeoverPreparation({
        companyId: company.id,
        intentId: intent.id,
        now: new Date('2026-08-30T13:02:00.000Z'),
        sessionId: session.id,
        territoryExternalRef: 'devtools',
      }),
    ).resolves.toBeNull();
    await prisma.companyManagementGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null, status: 'ACTIVE' },
    });
    await prisma.companyManagementSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date('2026-08-30T13:03:00.000Z') },
    });
    await expect(
      repository.updateTakeoverPreparation({
        companyId: company.id,
        intentId: intent.id,
        now: new Date('2026-08-30T13:04:00.000Z'),
        sessionId: session.id,
        territoryExternalRef: 'devtools',
      }),
    ).resolves.toBeNull();
  });

  it('rejects persisted minor units outside the shared safe-integer boundary', () => {
    expect(mapMinorAmountToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => mapMinorAmountToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      'safe integer',
    );
  });
});
