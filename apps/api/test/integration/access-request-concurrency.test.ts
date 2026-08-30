import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CompanyAccessDecisionConflictError,
  PrismaCompanyIdentityRepository,
} from '../../src/modules/company-identity/prisma-repository.js';

const prisma = getDatabaseClient();

async function resetIdentityTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "takeover_intents", "company_contacts", "companies"
    RESTART IDENTITY CASCADE`);
}

beforeEach(resetIdentityTables);

async function createAccessFixture() {
  const company = await prisma.company.create({
    data: {
      activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      name: 'Acme',
      normalizedName: 'acme',
      normalizedWebsite: 'https://acme.example/',
      status: 'ACTIVE',
      websiteUrl: 'https://acme.example/',
    },
  });
  const [requester, firstManager, secondManager, wrongCompanyManager] = await Promise.all(
    [
      'requester@gmail.com',
      'manager-one@gmail.com',
      'manager-two@gmail.com',
      'outsider@gmail.com',
    ].map((email) =>
      prisma.companyContact.create({
        data: { email, emailVerifiedAt: new Date(), normalizedEmail: email },
      }),
    ),
  );
  if (
    requester === undefined ||
    firstManager === undefined ||
    secondManager === undefined ||
    wrongCompanyManager === undefined
  ) {
    throw new Error('Expected all access-request fixture contacts');
  }
  const otherCompany = await prisma.company.create({
    data: {
      activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      name: 'Other',
      normalizedName: 'other',
      normalizedWebsite: 'https://other.example/',
      status: 'ACTIVE',
      websiteUrl: 'https://other.example/',
    },
  });
  const [firstGrant, secondGrant, wrongGrant] = await Promise.all([
    prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: firstManager.id, source: 'INITIAL_CONTACT' },
    }),
    prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: secondManager.id, source: 'INITIAL_CONTACT' },
    }),
    prisma.companyManagementGrant.create({
      data: {
        companyId: otherCompany.id,
        contactId: wrongCompanyManager.id,
        source: 'INITIAL_CONTACT',
      },
    }),
  ]);
  const [firstSession, secondSession, wrongSession] = await Promise.all(
    [firstGrant, secondGrant, wrongGrant].map((grant, index) =>
      prisma.companyManagementSession.create({
        data: {
          companyId: grant.companyId,
          csrfDigest: Buffer.alloc(32, index + 1),
          expiresAt: new Date('2026-08-30T21:00:00.000Z'),
          grantId: grant.id,
          tokenDigest: Buffer.alloc(32, index + 4),
        },
      }),
    ),
  );
  const intent = await prisma.takeoverIntent.create({
    data: {
      companyId: company.id,
      contactId: requester.id,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      status: 'AWAITING_COMPANY_ACCESS',
      territoryExternalRef: 'ai-coding',
    },
  });
  const accessRequest = await prisma.companyAccessRequest.create({
    data: {
      companyId: company.id,
      contactId: requester.id,
      expiresAt: new Date('2026-09-06T13:00:00.000Z'),
      takeoverIntentId: intent.id,
    },
  });
  if (firstSession === undefined || secondSession === undefined || wrongSession === undefined) {
    throw new Error('Expected all management sessions');
  }
  return {
    accessRequest,
    company,
    firstGrant,
    firstSession,
    intent,
    requester,
    secondGrant,
    secondSession,
    wrongGrant,
    wrongSession,
  };
}

describe('access request decision concurrency', () => {
  it('rejects a session revoked after service-level resolution', async () => {
    const fixture = await createAccessFixture();
    const repository = new PrismaCompanyIdentityRepository(prisma);
    await prisma.companyManagementSession.update({
      where: { id: fixture.firstSession.id },
      data: { revokedAt: new Date('2026-08-30T12:59:00.000Z') },
    });

    await expect(
      repository.decideAccessRequest({
        accessRequestId: fixture.accessRequest.id,
        decidedByGrantId: fixture.firstGrant.id,
        decision: 'rejected',
        now: new Date('2026-08-30T13:00:00.000Z'),
        sessionId: fixture.firstSession.id,
      }),
    ).rejects.toThrow('company');
  });

  it('rejects a grant revoked after service-level resolution', async () => {
    const fixture = await createAccessFixture();
    const repository = new PrismaCompanyIdentityRepository(prisma);
    await prisma.companyManagementGrant.update({
      where: { id: fixture.firstGrant.id },
      data: { revokedAt: new Date('2026-08-30T12:59:00.000Z'), status: 'REVOKED' },
    });

    await expect(
      repository.decideAccessRequest({
        accessRequestId: fixture.accessRequest.id,
        decidedByGrantId: fixture.firstGrant.id,
        decision: 'rejected',
        now: new Date('2026-08-30T13:00:00.000Z'),
        sessionId: fixture.firstSession.id,
      }),
    ).rejects.toThrow('company');
  });

  it('denies a manager grant belonging to another company', async () => {
    const fixture = await createAccessFixture();
    const repository = new PrismaCompanyIdentityRepository(prisma);

    await expect(
      repository.decideAccessRequest({
        accessRequestId: fixture.accessRequest.id,
        decidedByGrantId: fixture.wrongGrant.id,
        decision: 'approved',
        managementChallenge: {
          expiresAt: new Date('2026-08-30T13:15:00.000Z'),
          selector: 'wrong-company-decision',
          tokenDigest: new Uint8Array(32).fill(1),
        },
        now: new Date('2026-08-30T13:00:00.000Z'),
        sessionId: fixture.wrongSession.id,
      }),
    ).rejects.toThrow('company');
    await expect(
      prisma.companyAccessRequest.findUniqueOrThrow({ where: { id: fixture.accessRequest.id } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('commits exactly one terminal approve/reject decision', async () => {
    const fixture = await createAccessFixture();
    const repository = new PrismaCompanyIdentityRepository(prisma);
    const now = new Date('2026-08-30T13:00:00.000Z');

    const results = await Promise.allSettled([
      repository.decideAccessRequest({
        accessRequestId: fixture.accessRequest.id,
        decidedByGrantId: fixture.firstGrant.id,
        decision: 'approved',
        managementChallenge: {
          expiresAt: new Date('2026-08-30T13:15:00.000Z'),
          selector: 'approved-decision-link',
          tokenDigest: new Uint8Array(32).fill(2),
        },
        now,
        sessionId: fixture.firstSession.id,
      }),
      repository.decideAccessRequest({
        accessRequestId: fixture.accessRequest.id,
        decidedByGrantId: fixture.secondGrant.id,
        decision: 'rejected',
        now,
        reason: 'Not recognized',
        sessionId: fixture.secondSession.id,
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(
      results.some(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof CompanyAccessDecisionConflictError,
      ),
    ).toBe(true);
    const decided = await prisma.companyAccessRequest.findUniqueOrThrow({
      where: { id: fixture.accessRequest.id },
    });
    expect(['APPROVED', 'REJECTED']).toContain(decided.status);
    expect(decided.decidedAt).toEqual(now);
    expect(
      await prisma.auditLog.count({ where: { action: { startsWith: 'company_access_request.' } } }),
    ).toBe(1);
    if (decided.status === 'APPROVED') {
      expect(
        await prisma.companyManagementGrant.count({
          where: { companyId: fixture.company.id, contactId: fixture.requester.id },
        }),
      ).toBe(1);
      await expect(
        prisma.takeoverIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } }),
      ).resolves.toMatchObject({ status: 'IDENTITY_READY' });
    } else {
      expect(
        await prisma.companyManagementGrant.count({
          where: { companyId: fixture.company.id, contactId: fixture.requester.id },
        }),
      ).toBe(0);
      await expect(
        prisma.takeoverIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
    }
  });
});
