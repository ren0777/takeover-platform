import { getDatabaseClient, Prisma, type PrismaClient } from '@takeover/database';
import type { OperatorRepository } from './index.js';

type MutationInput = Parameters<OperatorRepository['revokeManagementGrant']>[0];

export class OperatorMutationConflictError extends Error {
  readonly statusCode = 409;
  constructor() { super('Record changed since operator review'); this.name = 'OperatorMutationConflictError'; }
}

export class OperatorRecordNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() { super('Operator target not found'); this.name = 'OperatorRecordNotFoundError'; }
}

export class PrismaOperatorRepository implements OperatorRepository {
  constructor(private readonly prisma: PrismaClient = getDatabaseClient()) {}

  listCompanies(limit: number): Promise<unknown[]> {
    return this.prisma.company.findMany({ take: limit, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, status: true, updatedAt: true } });
  }
  inspectTarget(kind: 'companies' | 'territories' | 'management-grants', id: string): Promise<unknown> {
    if (kind === 'companies') return this.prisma.company.findUnique({ where: { id }, select: { id: true, name: true, status: true, updatedAt: true } });
    if (kind === 'territories') return this.prisma.territory.findUnique({ where: { id }, select: { id: true, name: true, availabilityStatus: true, version: true, updatedAt: true } });
    return this.prisma.companyManagementGrant.findUnique({ where: { id }, select: { id: true, companyId: true, contactId: true, status: true, source: true, updatedAt: true, revokedAt: true } });
  }
  listTerritories(limit: number): Promise<unknown[]> {
    return this.prisma.territory.findMany({ take: limit, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, availabilityStatus: true, version: true, updatedAt: true } });
  }
  listManagementGrants(limit: number): Promise<unknown[]> {
    return this.prisma.companyManagementGrant.findMany({ take: limit, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, companyId: true, contactId: true, status: true, source: true, updatedAt: true, revokedAt: true } });
  }

  listAuditLogs(limit: number): Promise<unknown[]> {
    return this.prisma.auditLog.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
  }
  listPayments(limit: number): Promise<unknown[]> {
    return this.prisma.payment.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
  }
  listReconciliationActions(limit: number): Promise<unknown[]> {
    return this.prisma.paymentReconciliationAction.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
  }
  listRecoveryRequests(limit: number): Promise<unknown[]> {
    return this.prisma.companyAccessRequest.findMany({
      where: { recoveryStatus: 'PENDING' }, orderBy: [{ recoveryRequestedAt: 'asc' }, { id: 'asc' }],
      take: limit, include: { company: { select: { id: true, name: true, status: true } }, contact: { select: { id: true, email: true } } },
    });
  }

  async setCompanySuspended(input: MutationInput & { suspended: boolean }): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.company.findUnique({ where: { id: input.id } });
      if (before === null) throw new OperatorRecordNotFoundError();
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new OperatorMutationConflictError();
      const target = input.suspended ? 'SUSPENDED' : 'ACTIVE';
      if (input.suspended ? before.status !== 'ACTIVE' : before.status !== 'SUSPENDED') throw new OperatorMutationConflictError();
      const changed = await tx.company.updateMany({ where: { id: input.id, updatedAt: input.expectedUpdatedAt, status: before.status }, data: { status: target } });
      if (changed.count !== 1) throw new OperatorMutationConflictError();
      const after = await tx.company.findUniqueOrThrow({ where: { id: input.id } });
      await tx.auditLog.create({ data: this.audit(input, `operator.company.${input.suspended ? 'suspended' : 'restored'}`, 'company', before.id, before.id, { before: { status: before.status }, after: { status: after.status } }) });
      return after;
    });
  }

  async setTerritoryDisabled(input: MutationInput & { disabled: boolean }): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.territory.findUnique({ where: { id: input.id } });
      if (before === null) throw new OperatorRecordNotFoundError();
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new OperatorMutationConflictError();
      const target = input.disabled ? 'DISABLED' : 'ACTIVE';
      if (before.availabilityStatus === target) throw new OperatorMutationConflictError();
      const changed = await tx.territory.updateMany({ where: { id: input.id, updatedAt: input.expectedUpdatedAt, availabilityStatus: before.availabilityStatus }, data: { availabilityStatus: target, version: { increment: 1 } } });
      if (changed.count !== 1) throw new OperatorMutationConflictError();
      const after = await tx.territory.findUniqueOrThrow({ where: { id: input.id } });
      await tx.auditLog.create({ data: this.audit(input, `operator.territory.${input.disabled ? 'disabled' : 'enabled'}`, 'territory', before.id, null, { before: { availabilityStatus: before.availabilityStatus, version: before.version.toString() }, after: { availabilityStatus: after.availabilityStatus, version: after.version.toString() } }) });
      return after;
    });
  }

  async revokeManagementGrant(input: MutationInput): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.companyManagementGrant.findUnique({ where: { id: input.id } });
      if (before === null) throw new OperatorRecordNotFoundError();
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() || before.status !== 'ACTIVE') throw new OperatorMutationConflictError();
      const revokedAt = new Date();
      const changed = await tx.companyManagementGrant.updateMany({ where: { id: input.id, updatedAt: input.expectedUpdatedAt, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt } });
      if (changed.count !== 1) throw new OperatorMutationConflictError();
      const after = await tx.companyManagementGrant.findUniqueOrThrow({ where: { id: input.id } });
      await tx.companyManagementSession.updateMany({ where: { grantId: input.id, revokedAt: null }, data: { revokedAt } });
      await tx.auditLog.create({ data: this.audit(input, 'operator.management_grant.revoked', 'company_management_grant', before.id, before.companyId, { before: { status: before.status, revokedAt: before.revokedAt }, after: { status: after.status, revokedAt: after.revokedAt } }) });
      return after;
    });
  }

  async decideRecoveryRequest(input: MutationInput & { decision: 'approve' | 'reject'; now: Date }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "company_access_requests" WHERE "id" = ${input.id}::uuid FOR UPDATE`);
      const before = await tx.companyAccessRequest.findUnique({ where: { id: input.id } });
      if (before === null) throw new OperatorRecordNotFoundError();
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() || before.recoveryStatus !== 'PENDING' || before.recoveryExpiresAt === null || before.recoveryExpiresAt <= input.now || before.status !== 'PENDING') throw new OperatorMutationConflictError();
      if (input.decision === 'approve') {
        const contact = await tx.companyContact.findUnique({ where: { id: before.contactId } });
        const company = await tx.company.findUnique({ where: { id: before.companyId } });
        if (!contact?.emailVerifiedAt || contact.revokedAt !== null || company?.status !== 'ACTIVE' || before.expiresAt <= input.now) throw new OperatorMutationConflictError();
        const grant = await tx.companyManagementGrant.upsert({
          where: { companyId_contactId: { companyId: before.companyId, contactId: before.contactId } },
          create: { companyId: before.companyId, contactId: before.contactId, source: 'MANUAL_RECOVERY', accessRequestId: before.id, grantedAt: input.now },
          update: { status: 'ACTIVE', source: 'MANUAL_RECOVERY', accessRequestId: before.id, revokedAt: null, grantedAt: input.now },
        });
        // Reactivating authority must never reactivate old sessions or emailed capabilities.
        await tx.companyManagementSession.updateMany({ where: { grantId: grant.id, revokedAt: null }, data: { revokedAt: input.now } });
        await tx.emailVerificationChallenge.updateMany({ where: { companyId: before.companyId, contactId: before.contactId, revokedAt: null }, data: { revokedAt: input.now } });
        const verification = await tx.companyVerification.findFirst({ where: { companyId: before.companyId, contactId: before.contactId, level: 'CONTACT_VERIFIED', status: 'VERIFIED' } });
        if (verification === null) await tx.companyVerification.create({ data: { companyId: before.companyId, contactId: before.contactId, level: 'CONTACT_VERIFIED', status: 'VERIFIED', source: 'manual_recovery', verifiedAt: input.now } });
      }
      if (before.takeoverIntentId !== null) {
        const intent = await tx.takeoverIntent.findUnique({ where: { id: before.takeoverIntentId } });
        if (intent && intent.companyId === before.companyId && intent.contactId === before.contactId && ['AWAITING_COMPANY_ACCESS', 'IDENTITY_READY'].includes(intent.status)) {
          await tx.takeoverIntent.update({ where: { id: intent.id }, data: { status: input.decision === 'reject' ? 'CANCELLED' : intent.expiresAt <= input.now ? 'EXPIRED' : 'IDENTITY_READY' } });
        }
      }
      const after = await tx.companyAccessRequest.update({
        where: { id: before.id },
        data: { recoveryStatus: 'RESOLVED', status: input.decision === 'approve' ? 'APPROVED' : 'REJECTED', decidedAt: input.now, decisionReason: input.reason },
      });
      await tx.auditLog.create({ data: this.audit(input, `operator.company_recovery.${input.decision === 'approve' ? 'approved' : 'rejected'}`, 'company_access_request', before.id, before.companyId, { before: { status: before.status, recoveryStatus: before.recoveryStatus, updatedAt: before.updatedAt }, after: { status: after.status, recoveryStatus: after.recoveryStatus, updatedAt: after.updatedAt } }) });
      return { id: after.id, decision: input.decision, updatedAt: after.updatedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) throw new OperatorMutationConflictError();
      throw error;
    });
  }

  private audit(input: MutationInput, action: string, targetType: string, targetId: string, companyId: string | null, metadata: Prisma.InputJsonValue) {
    return { actorType: 'OPERATOR' as const, actorId: input.operatorId, action, targetType, targetId, companyId, reason: input.reason, requestId: input.requestId ?? null, metadata };
  }
}
