import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { OperatorMutationConflictError, PrismaOperatorRepository } from '../../src/modules/operator/prisma-repository.js';

const prisma = getDatabaseClient();
const operatorId = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs", "company_management_sessions",
    "company_management_grants", "company_access_requests", "takeover_intents", "company_contacts",
    "territory_ownerships", "territories", "territory_categories", "companies" RESTART IDENTITY CASCADE`);
});

describe('operator PostgreSQL mutations', () => {
  async function recoveryFixture(verified = true) {
    const company = await prisma.company.create({ data: { name: 'Recovery', normalizedName: 'recovery', normalizedWebsite: 'https://recovery.example', websiteUrl: 'https://recovery.example', status: 'ACTIVE' } });
    const contact = await prisma.companyContact.create({ data: { email: 'requester@example.com', normalizedEmail: 'requester@example.com', emailVerifiedAt: verified ? new Date() : null } });
    const now = new Date();
    const request = await prisma.companyAccessRequest.create({ data: { companyId: company.id, contactId: contact.id, expiresAt: new Date(now.getTime() + 60_000), recoveryStatus: 'PENDING', recoveryRequestedAt: now, recoveryExpiresAt: new Date(now.getTime() + 60_000) } });
    return { company, contact, request, now };
  }

  it('denies recovery to an unverified or revoked contact without creating authority', async () => {
    const { contact, request, now } = await recoveryFixture(false);
    const input = { id: request.id, operatorId, reason: 'Reviewed recovery evidence', expectedUpdatedAt: request.updatedAt, decision: 'approve' as const, now };
    await expect(new PrismaOperatorRepository(prisma).decideRecoveryRequest(input)).rejects.toBeInstanceOf(OperatorMutationConflictError);
    await prisma.companyContact.update({ where: { id: contact.id }, data: { emailVerifiedAt: now, revokedAt: now } });
    await expect(new PrismaOperatorRepository(prisma).decideRecoveryRequest(input)).rejects.toBeInstanceOf(OperatorMutationConflictError);
    expect(await prisma.companyManagementGrant.count()).toBe(0);
  });

  it('records a reviewed recovery once with a resolved status and invalidates old continuations', async () => {
    const { company, contact, request, now } = await recoveryFixture();
    const grant = await prisma.companyManagementGrant.create({ data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT', status: 'REVOKED', revokedAt: now } });
    await prisma.companyManagementSession.create({ data: { companyId: company.id, grantId: grant.id, tokenDigest: Buffer.alloc(32, 4), csrfDigest: Buffer.alloc(32, 5), expiresAt: new Date(now.getTime() + 60_000) } });
    const input = { id: request.id, operatorId, reason: 'Reviewed independent recovery evidence', expectedUpdatedAt: request.updatedAt, decision: 'approve' as const, now };
    const repository = new PrismaOperatorRepository(prisma);
    const outcomes = await Promise.allSettled([repository.decideRecoveryRequest(input), repository.decideRecoveryRequest(input)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.companyAccessRequest.findUniqueOrThrow({ where: { id: request.id } })).recoveryStatus).toBe('RESOLVED');
    expect((await prisma.companyManagementSession.findFirstOrThrow()).revokedAt).toEqual(now);
    await expect(new PrismaOperatorRepository(prisma).decideRecoveryRequest(input)).rejects.toBeInstanceOf(OperatorMutationConflictError);
    expect(await prisma.auditLog.count({ where: { action: 'operator.company_recovery.approved' } })).toBe(1);
  });
  it('atomically records before/after audit evidence and rejects a stale repeat', async () => {
    const company = await prisma.company.create({ data: {
      name: 'Acme', normalizedName: 'acme', normalizedWebsite: 'https://acme.example/',
      websiteUrl: 'https://acme.example/', status: 'ACTIVE',
    } });
    const repository = new PrismaOperatorRepository(prisma);
    const input = { id: company.id, operatorId, reason: 'Confirmed policy violation', expectedUpdatedAt: company.updatedAt };
    await repository.setCompanySuspended({ ...input, suspended: true });
    await expect(repository.setCompanySuspended({ ...input, suspended: true })).rejects.toBeInstanceOf(OperatorMutationConflictError);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: company.id } });
    expect(audit).toMatchObject({ actorType: 'OPERATOR', actorId: operatorId, reason: input.reason });
    expect(audit.metadata).toEqual({ before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' } });
  });

  it('revokes all sessions with the grant in the audited transaction', async () => {
    const company = await prisma.company.create({ data: {
      name: 'Acme', normalizedName: 'acme', normalizedWebsite: 'https://acme.example/', websiteUrl: 'https://acme.example/', status: 'ACTIVE',
    } });
    const contact = await prisma.companyContact.create({ data: { email: 'owner@example.com', normalizedEmail: 'owner@example.com' } });
    const grant = await prisma.companyManagementGrant.create({ data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' } });
    await prisma.companyManagementSession.create({ data: {
      companyId: company.id, grantId: grant.id, tokenDigest: Buffer.alloc(32, 1), csrfDigest: Buffer.alloc(32, 2), expiresAt: new Date(Date.now() + 60_000),
    } });
    await new PrismaOperatorRepository(prisma).revokeManagementGrant({
      id: grant.id, operatorId, reason: 'Owner requested immediate access revocation', expectedUpdatedAt: grant.updatedAt,
    });
    await expect(prisma.companyManagementSession.findFirstOrThrow({ where: { grantId: grant.id } })).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    await expect(prisma.auditLog.count({ where: { action: 'operator.management_grant.revoked' } })).resolves.toBe(1);
  });
});
