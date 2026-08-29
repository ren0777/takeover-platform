import { randomUUID } from 'node:crypto';
import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PrismaCompanyIdentityRepository,
  mapMinorAmountToSafeInteger,
} from '../../src/modules/company-identity/prisma-repository.js';

const prisma = getDatabaseClient();

async function resetIdentityTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "takeover_intents", "company_contacts", "companies"
    RESTART IDENTITY CASCADE`);
}

async function createCompany(status: 'DRAFT' | 'ACTIVE', normalizedWebsite: string) {
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

  it('rejects persisted minor units outside the shared safe-integer boundary', () => {
    expect(mapMinorAmountToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => mapMinorAmountToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      'safe integer',
    );
  });
});
