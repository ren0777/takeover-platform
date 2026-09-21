import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  OperatorMutationConflictError,
  PrismaOperatorRepository,
} from '../../src/modules/operator/prisma-repository.js';

const prisma = getDatabaseClient();
const operatorId = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs", "company_management_sessions",
    "company_management_grants", "company_access_requests", "takeover_intents", "company_contacts",
    "territory_ownerships", "territories", "territory_categories", "companies" RESTART IDENTITY CASCADE`);
});

describe('operator PostgreSQL mutations', () => {
  async function recoveryFixture(verified = true) {
    const company = await prisma.company.create({
      data: {
        name: 'Recovery',
        normalizedName: 'recovery',
        normalizedWebsite: 'https://recovery.example',
        websiteUrl: 'https://recovery.example',
        status: 'ACTIVE',
      },
    });
    const contact = await prisma.companyContact.create({
      data: {
        email: 'requester@example.com',
        normalizedEmail: 'requester@example.com',
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    const now = new Date();
    const request = await prisma.companyAccessRequest.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date(now.getTime() + 60_000),
        recoveryStatus: 'PENDING',
        recoveryRequestedAt: now,
        recoveryExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    return { company, contact, request, now };
  }

  it('denies recovery to an unverified or revoked contact without creating authority', async () => {
    const { contact, request, now } = await recoveryFixture(false);
    const input = {
      id: request.id,
      operatorId,
      reason: 'Reviewed recovery evidence',
      expectedUpdatedAt: request.updatedAt,
      decision: 'approve' as const,
      now,
    };
    await expect(
      new PrismaOperatorRepository(prisma).decideRecoveryRequest(input),
    ).rejects.toBeInstanceOf(OperatorMutationConflictError);
    await prisma.companyContact.update({
      where: { id: contact.id },
      data: { emailVerifiedAt: now, revokedAt: now },
    });
    await expect(
      new PrismaOperatorRepository(prisma).decideRecoveryRequest(input),
    ).rejects.toBeInstanceOf(OperatorMutationConflictError);
    expect(await prisma.companyManagementGrant.count()).toBe(0);
  });

  it.each(['PENDING', 'EXPIRED'] as const)(
    'approves fresh recovery for an expired %s access request without reviving its intent',
    async (status) => {
      const { company, contact, request, now } = await recoveryFixture();
      const intent = await prisma.takeoverIntent.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          territoryExternalRef: 'expired-target',
          status: 'AWAITING_COMPANY_ACCESS',
          createdAt: new Date(now.getTime() - 120_000),
          expiresAt: new Date(now.getTime() - 1),
        },
      });
      const reviewed = await prisma.companyAccessRequest.update({
        where: { id: request.id },
        data: {
          status,
          requestedAt: new Date(now.getTime() - 120_000),
          decidedAt: status === 'EXPIRED' ? now : null,
          expiresAt: new Date(now.getTime() - 1),
          takeoverIntentId: intent.id,
        },
      });
      await new PrismaOperatorRepository(prisma).decideRecoveryRequest({
        id: reviewed.id,
        operatorId,
        reason: 'Reviewed independent recovery evidence',
        expectedUpdatedAt: reviewed.updatedAt,
        decision: 'approve',
        now,
      });
      expect(await prisma.companyManagementGrant.findFirst()).toMatchObject({
        status: 'ACTIVE',
        source: 'MANUAL_RECOVERY',
      });
      expect(await prisma.takeoverIntent.findUnique({ where: { id: intent.id } })).toMatchObject({
        status: 'EXPIRED',
      });
    },
  );

  it('keeps fresh recoveries visible after 100 inactive rows and pages history without duplicates', async () => {
    const { company, contact, request, now } = await recoveryFixture();
    await prisma.companyAccessRequest.createMany({
      data: Array.from({ length: 101 }, () => ({
        companyId: company.id,
        contactId: contact.id,
        status: 'EXPIRED' as const,
        decidedAt: now,
        requestedAt: new Date(now.getTime() - 120_000),
        expiresAt: new Date(now.getTime() - 60_000),
        recoveryStatus: 'PENDING' as const,
        recoveryRequestedAt: new Date(now.getTime() - 60_000),
        recoveryExpiresAt: new Date(now.getTime() - 1),
        createdAt: new Date(now.getTime() - 60_000),
      })),
    });
    const repository = new PrismaOperatorRepository(prisma);
    const active = await repository.listRecoveryRequests(50, { scope: 'actionable', now });
    expect(active.items.map((item) => item.id)).toEqual([request.id]);
    const first = await repository.listRecoveryRequests(100, { scope: 'all', now });
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).not.toBeNull();
    const second = await repository.listRecoveryRequests(100, {
      scope: 'all',
      now,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(102);
    expect(await repository.inspectTarget('recovery-requests', first.items[0]!.id)).toMatchObject({
      id: first.items[0]!.id,
      recoveryStatus: 'PENDING',
    });
  });

  it.each(['expired-recovery', 'resolved', 'rejected', 'suspended', 'stale'] as const)(
    'denies %s recovery without granting authority',
    async (scenario) => {
      const { company, request, now } = await recoveryFixture();
      const reviewed = await prisma.companyAccessRequest.update({
        where: { id: request.id },
        data: {
          ...(scenario === 'expired-recovery'
            ? { recoveryExpiresAt: now, recoveryRequestedAt: new Date(now.getTime() - 1) }
            : {}),
          ...(scenario === 'resolved' ? { recoveryStatus: 'RESOLVED' as const } : {}),
          ...(scenario === 'rejected' ? { status: 'REJECTED' as const, decidedAt: now } : {}),
        },
      });
      if (scenario === 'suspended')
        await prisma.company.update({ where: { id: company.id }, data: { status: 'SUSPENDED' } });
      await expect(
        new PrismaOperatorRepository(prisma).decideRecoveryRequest({
          id: request.id,
          operatorId,
          reason: 'Reviewed recovery evidence',
          expectedUpdatedAt: scenario === 'stale' ? new Date(0) : reviewed.updatedAt,
          decision: 'approve',
          now,
        }),
      ).rejects.toBeInstanceOf(OperatorMutationConflictError);
      expect(await prisma.companyManagementGrant.count()).toBe(0);
      expect(await prisma.auditLog.count()).toBe(0);
    },
  );

  it('records a reviewed recovery once with a resolved status and invalidates old continuations', async () => {
    const { company, contact, request, now } = await recoveryFixture();
    const grant = await prisma.companyManagementGrant.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        source: 'INITIAL_CONTACT',
        status: 'REVOKED',
        revokedAt: now,
      },
    });
    await prisma.companyManagementSession.create({
      data: {
        companyId: company.id,
        grantId: grant.id,
        tokenDigest: Buffer.alloc(32, 4),
        csrfDigest: Buffer.alloc(32, 5),
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    const input = {
      id: request.id,
      operatorId,
      reason: 'Reviewed independent recovery evidence',
      expectedUpdatedAt: request.updatedAt,
      decision: 'approve' as const,
      now,
    };
    const repository = new PrismaOperatorRepository(prisma);
    const outcomes = await Promise.allSettled([
      repository.decideRecoveryRequest(input),
      repository.decideRecoveryRequest(input),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await prisma.companyAccessRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .recoveryStatus,
    ).toBe('RESOLVED');
    expect((await prisma.companyManagementSession.findFirstOrThrow()).revokedAt).toEqual(now);
    await expect(
      new PrismaOperatorRepository(prisma).decideRecoveryRequest(input),
    ).rejects.toBeInstanceOf(OperatorMutationConflictError);
    expect(
      await prisma.auditLog.count({ where: { action: 'operator.company_recovery.approved' } }),
    ).toBe(1);
  });
  it('supersedes an earlier ready intent when recovery promotes the request intent', async () => {
    const { company, contact, request, now } = await recoveryFixture();
    const earlier = await prisma.takeoverIntent.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date(now.getTime() + 60_000),
        status: 'IDENTITY_READY',
        territoryExternalRef: 'earlier-territory',
      },
    });
    const recovering = await prisma.takeoverIntent.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt: new Date(now.getTime() + 60_000),
        status: 'AWAITING_COMPANY_ACCESS',
        territoryExternalRef: 'recovered-territory',
      },
    });
    await prisma.companyAccessRequest.update({
      where: { id: request.id },
      data: { takeoverIntentId: recovering.id },
    });
    const refreshed = await prisma.companyAccessRequest.findUniqueOrThrow({
      where: { id: request.id },
    });

    await new PrismaOperatorRepository(prisma).decideRecoveryRequest({
      id: request.id,
      operatorId,
      reason: 'Reviewed independent recovery evidence',
      expectedUpdatedAt: refreshed.updatedAt,
      decision: 'approve',
      now,
    });

    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: earlier.id } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: recovering.id } }),
    ).resolves.toMatchObject({ status: 'IDENTITY_READY' });
    expect(await prisma.auditLog.count({ where: { action: 'takeover_intent.superseded' } })).toBe(
      1,
    );
  });

  it('atomically records before/after audit evidence and rejects a stale repeat', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Acme',
        normalizedName: 'acme',
        normalizedWebsite: 'https://acme.example/',
        websiteUrl: 'https://acme.example/',
        status: 'ACTIVE',
      },
    });
    const repository = new PrismaOperatorRepository(prisma);
    const input = {
      id: company.id,
      operatorId,
      reason: 'Confirmed policy violation',
      expectedUpdatedAt: company.updatedAt,
    };
    await repository.setCompanySuspended({ ...input, suspended: true });
    await expect(
      repository.setCompanySuspended({ ...input, suspended: true }),
    ).rejects.toBeInstanceOf(OperatorMutationConflictError);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: company.id } });
    expect(audit).toMatchObject({
      actorType: 'OPERATOR',
      actorId: operatorId,
      reason: input.reason,
    });
    expect(audit.metadata).toEqual({
      before: { status: 'ACTIVE' },
      after: { status: 'SUSPENDED' },
    });
  });

  it('revokes all sessions with the grant in the audited transaction', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Acme',
        normalizedName: 'acme',
        normalizedWebsite: 'https://acme.example/',
        websiteUrl: 'https://acme.example/',
        status: 'ACTIVE',
      },
    });
    const contact = await prisma.companyContact.create({
      data: { email: 'owner@example.com', normalizedEmail: 'owner@example.com' },
    });
    const grant = await prisma.companyManagementGrant.create({
      data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
    });
    await prisma.companyManagementSession.create({
      data: {
        companyId: company.id,
        grantId: grant.id,
        tokenDigest: Buffer.alloc(32, 1),
        csrfDigest: Buffer.alloc(32, 2),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await new PrismaOperatorRepository(prisma).revokeManagementGrant({
      id: grant.id,
      operatorId,
      reason: 'Owner requested immediate access revocation',
      expectedUpdatedAt: grant.updatedAt,
    });
    await expect(
      prisma.companyManagementSession.findFirstOrThrow({ where: { grantId: grant.id } }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    await expect(
      prisma.auditLog.count({ where: { action: 'operator.management_grant.revoked' } }),
    ).resolves.toBe(1);
  });
});
