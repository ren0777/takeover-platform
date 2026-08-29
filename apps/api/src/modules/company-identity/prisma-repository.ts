import { randomUUID } from 'node:crypto';
import { getDatabaseClient, Prisma, type PrismaClient } from '@takeover/database';
import type { ManagementAuthority } from './authorization.js';
import type {
  CompanyIdentityRepository,
  CreateSessionInput,
  RateLimitInput,
  RevokeSessionInput,
  SessionRecord,
} from './repository.js';

type IdentityPrismaClient = PrismaClient | Prisma.TransactionClient;

export function mapMinorAmountToSafeInteger(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new Error('Minor amount exceeds the shared safe integer boundary');
  return value;
}

export class PrismaCompanyIdentityRepository implements CompanyIdentityRepository {
  constructor(private readonly prisma: PrismaClient = getDatabaseClient()) {}

  async consumeRateLimit(
    input: RateLimitInput,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new Error('Rate limit must be positive');
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      INSERT INTO "security_rate_limit_buckets"
        ("id", "key_digest", "window_started_at", "expires_at", "count", "created_at", "updated_at")
      VALUES
        (${id}::uuid, ${Buffer.from(input.keyDigest)}, ${input.windowStartedAt}, ${input.expiresAt}, 1, ${input.now}, ${input.now})
      ON CONFLICT ("key_digest", "window_started_at")
      DO UPDATE SET
        "count" = "security_rate_limit_buckets"."count" + 1,
        "expires_at" = EXCLUDED."expires_at",
        "updated_at" = EXCLUDED."updated_at"
      WHERE "security_rate_limit_buckets"."count" < ${input.limit}
      RETURNING "count"
    `);
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((input.expiresAt.getTime() - input.now.getTime()) / 1_000),
    );
    return { allowed: rows.length === 1, retryAfterSeconds };
  }

  async createManagementSession(input: CreateSessionInput): Promise<SessionRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.companyManagementSession.create({
        data: {
          companyId: input.companyId,
          csrfDigest: Buffer.from(input.csrfDigest),
          expiresAt: input.expiresAt,
          grantId: input.grantId,
          tokenDigest: Buffer.from(input.tokenDigest),
        },
      });
      await this.writeAudit(transaction, {
        action: 'company_management_session.created',
        actorId: input.grantId,
        actorType: 'MANAGEMENT_GRANT',
        companyId: input.companyId,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: session.id,
        targetType: 'company_management_session',
      });
      return {
        companyId: session.companyId,
        csrfDigest: new Uint8Array(session.csrfDigest),
        expiresAt: session.expiresAt,
        grantId: session.grantId,
        sessionId: session.id,
        tokenDigest: new Uint8Array(session.tokenDigest),
      };
    });
  }

  async resolveManagementSession(
    digest: Uint8Array,
    now: Date,
  ): Promise<ManagementAuthority | null> {
    const session = await this.prisma.companyManagementSession.findUnique({
      where: { tokenDigest: Buffer.from(digest) },
      include: { grant: true },
    });
    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.grant.status !== 'ACTIVE' ||
      session.grant.revokedAt !== null ||
      session.grant.companyId !== session.companyId
    ) {
      return null;
    }
    return {
      companyId: session.companyId,
      contactId: session.grant.contactId,
      expiresAt: session.expiresAt,
      grantId: session.grantId,
      sessionId: session.id,
    };
  }

  async revokeManagementSession(input: RevokeSessionInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.companyManagementSession.findUnique({
        where: { id: input.sessionId },
      });
      if (session === null || session.revokedAt !== null) return;
      await transaction.companyManagementSession.update({
        where: { id: session.id },
        data: { revokedAt: input.now },
      });
      await this.writeAudit(transaction, {
        action: 'company_management_session.revoked',
        actorId: session.id,
        actorType: 'MANAGEMENT_SESSION',
        companyId: session.companyId,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: session.id,
        targetType: 'company_management_session',
      });
    });
  }

  private async writeAudit(
    transaction: IdentityPrismaClient,
    input: {
      action: string;
      actorId?: string;
      actorType: 'CONTACT' | 'MANAGEMENT_GRANT' | 'MANAGEMENT_SESSION' | 'SYSTEM';
      companyId?: string;
      requestId?: string;
      targetId?: string;
      targetType: string;
    },
  ): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: input.action,
      actorType: input.actorType,
      targetType: input.targetType,
    };
    if (input.actorId !== undefined) data.actorId = input.actorId;
    if (input.companyId !== undefined) data.companyId = input.companyId;
    if (input.requestId !== undefined) data.requestId = input.requestId;
    if (input.targetId !== undefined) data.targetId = input.targetId;
    await transaction.auditLog.create({ data });
  }
}
