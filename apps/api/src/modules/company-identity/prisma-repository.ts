import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getDatabaseClient, Prisma, type PrismaClient } from '@takeover/database';
import type {
  CompanyIdentityRepository,
  BeginClaimRecord,
  BeginClaimRecordResult,
  ChallengeRecord,
  CompanyRecord,
  ConsumeChallengeInput,
  ConsumeManagementChallengeInput,
  CreateSessionInput,
  IntentRecord,
  IssueContactVerificationChallengeInput,
  IssueManagementChallengeInput,
  IssuedContactVerificationChallenge,
  IssuedManagementChallenge,
  ManagementChallengeExchangeResult,
  ManagementSessionAuthority,
  RateLimitInput,
  RevokeSessionInput,
  SessionRecord,
  VerificationExchangeResult,
} from './repository.js';

type IdentityPrismaClient = PrismaClient | Prisma.TransactionClient;

export function mapMinorAmountToSafeInteger(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new Error('Minor amount exceeds the shared safe integer boundary');
  return value;
}

function mapCompany(company: {
  activatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  logoUrl: string | null;
  name: string;
  normalizedWebsite: string;
  slug: string | null;
  status: CompanyRecord['status'];
  updatedAt: Date;
  websiteUrl: string;
}): CompanyRecord {
  return company;
}

function mapIntent(intent: {
  companyId: string;
  contactId: string;
  expiresAt: Date;
  id: string;
  status: IntentRecord['status'];
  territoryExternalRef: string;
}): IntentRecord {
  return intent;
}

export class PrismaCompanyIdentityRepository implements CompanyIdentityRepository {
  constructor(private readonly prisma: PrismaClient = getDatabaseClient()) {}

  async beginCompanyClaim(input: BeginClaimRecord): Promise<BeginClaimRecordResult> {
    return this.prisma.$transaction(async (transaction) => {
      const authoritativeCompany = await transaction.company.findFirst({
        where: {
          normalizedWebsite: input.company.normalizedWebsite,
          status: { not: 'DRAFT' },
        },
      });
      const company =
        authoritativeCompany ??
        (await transaction.company.create({
          data: {
            expiresAt: input.company.expiresAt,
            ...(input.company.logoUrl === undefined ? {} : { logoUrl: input.company.logoUrl }),
            name: input.company.name,
            normalizedName: input.company.normalizedName,
            normalizedWebsite: input.company.normalizedWebsite,
            websiteUrl: input.company.websiteUrl,
          },
        }));
      const contact = await transaction.companyContact.upsert({
        where: { normalizedEmail: input.contact.normalizedEmail },
        create: input.contact,
        update: { email: input.contact.email },
      });
      const intent = await transaction.takeoverIntent.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          expiresAt: input.intent.expiresAt,
          territoryExternalRef: input.intent.territoryExternalRef,
        },
      });
      const challenge = await transaction.emailVerificationChallenge.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          expiresAt: input.challenge.expiresAt,
          selector: input.challenge.selector,
          tokenDigest: Buffer.from(input.challenge.tokenDigest),
          purpose: 'CONTACT_VERIFICATION',
        },
      });
      await this.writeAudit(transaction, {
        action: 'company_claim.started',
        actorId: contact.id,
        actorType: 'CONTACT',
        companyId: company.id,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: intent.id,
        targetType: 'takeover_intent',
      });
      const mappedChallenge: ChallengeRecord = {
        companyId: challenge.companyId,
        contactId: challenge.contactId,
        expiresAt: challenge.expiresAt,
        id: challenge.id,
        selector: challenge.selector,
        tokenDigest: new Uint8Array(challenge.tokenDigest),
      };
      return {
        challenge: mappedChallenge,
        company: mapCompany(company),
        contact: {
          email: contact.email,
          emailVerifiedAt: contact.emailVerifiedAt,
          id: contact.id,
          normalizedEmail: contact.normalizedEmail,
        },
        intent: mapIntent(intent),
        kind: authoritativeCompany === null ? 'new_company' : 'existing_company',
      };
    });
  }

  async markChallengeDelivery(challengeId: string, status: 'SENT' | 'FAILED'): Promise<void> {
    await this.prisma.emailVerificationChallenge.update({
      where: { id: challengeId },
      data: { deliveryStatus: status },
    });
  }

  async issueContactVerificationChallenge(
    input: IssueContactVerificationChallengeInput,
  ): Promise<IssuedContactVerificationChallenge | null> {
    return this.prisma.$transaction(async (transaction) => {
      const contact = await transaction.companyContact.findUnique({
        where: { normalizedEmail: input.normalizedEmail },
      });
      if (contact === null || contact.revokedAt !== null) return null;
      const intent = await transaction.takeoverIntent.findFirst({
        where: {
          companyId: input.companyId,
          contactId: contact.id,
          status: 'AWAITING_EMAIL_VERIFICATION',
        },
        include: { company: true },
        orderBy: { createdAt: 'desc' },
      });
      if (intent === null || intent.expiresAt <= input.now) return null;

      await transaction.emailVerificationChallenge.updateMany({
        where: {
          companyId: input.companyId,
          consumedAt: null,
          contactId: contact.id,
          purpose: 'CONTACT_VERIFICATION',
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });
      const challenge = await transaction.emailVerificationChallenge.create({
        data: {
          companyId: input.companyId,
          contactId: contact.id,
          expiresAt: input.expiresAt,
          purpose: 'CONTACT_VERIFICATION',
          selector: input.selector,
          tokenDigest: Buffer.from(input.tokenDigest),
        },
      });
      await this.writeAudit(transaction, {
        action: 'email_verification.reissued',
        actorId: contact.id,
        actorType: 'CONTACT',
        companyId: input.companyId,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: challenge.id,
        targetType: 'email_verification_challenge',
      });
      return {
        challengeId: challenge.id,
        companyName: intent.company.name,
        toEmail: contact.email,
      };
    });
  }

  async issueManagementChallenge(
    input: IssueManagementChallengeInput,
  ): Promise<IssuedManagementChallenge | null> {
    return this.prisma.$transaction(async (transaction) => {
      const grant = await transaction.companyManagementGrant.findFirst({
        where: {
          companyId: input.companyId,
          revokedAt: null,
          status: 'ACTIVE',
          contact: {
            emailVerifiedAt: { not: null },
            normalizedEmail: input.normalizedEmail,
            revokedAt: null,
            verifications: {
              some: {
                companyId: input.companyId,
                level: 'CONTACT_VERIFIED',
                status: 'VERIFIED',
              },
            },
          },
        },
        include: { company: true, contact: true },
      });
      if (grant === null) return null;

      await transaction.emailVerificationChallenge.updateMany({
        where: {
          companyId: input.companyId,
          consumedAt: null,
          contactId: grant.contactId,
          purpose: 'MANAGEMENT_LINK',
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });
      const challenge = await transaction.emailVerificationChallenge.create({
        data: {
          companyId: input.companyId,
          contactId: grant.contactId,
          expiresAt: input.expiresAt,
          purpose: 'MANAGEMENT_LINK',
          selector: input.selector,
          tokenDigest: Buffer.from(input.tokenDigest),
        },
      });
      await this.writeAudit(transaction, {
        action: 'company_management_link.issued',
        actorId: grant.contactId,
        actorType: 'CONTACT',
        companyId: input.companyId,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: challenge.id,
        targetType: 'email_verification_challenge',
      });
      return {
        challengeId: challenge.id,
        companyName: grant.company.name,
        toEmail: grant.contact.email,
      };
    });
  }

  async consumeManagementChallenge(
    input: ConsumeManagementChallengeInput,
  ): Promise<ManagementChallengeExchangeResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "email_verification_challenges"
        WHERE "selector" = ${input.selector}
        FOR UPDATE
      `);
      const challenge = await transaction.emailVerificationChallenge.findUnique({
        where: { selector: input.selector },
        include: { company: true },
      });
      const digestMatches =
        challenge !== null &&
        challenge.tokenDigest.byteLength === input.candidateDigest.byteLength &&
        timingSafeEqual(challenge.tokenDigest, input.candidateDigest);
      const valid =
        challenge !== null &&
        digestMatches &&
        challenge.purpose === 'MANAGEMENT_LINK' &&
        challenge.deliveryStatus === 'SENT' &&
        challenge.consumedAt === null &&
        challenge.revokedAt === null &&
        challenge.failedAttempts < input.maxFailedAttempts &&
        challenge.expiresAt > input.now;
      if (!valid || challenge === null) {
        if (
          challenge !== null &&
          challenge.consumedAt === null &&
          challenge.failedAttempts < input.maxFailedAttempts
        ) {
          await transaction.emailVerificationChallenge.update({
            where: { id: challenge.id },
            data: { failedAttempts: { increment: 1 } },
          });
        }
        return { kind: 'invalid' };
      }
      const grant = await transaction.companyManagementGrant.findUnique({
        where: {
          companyId_contactId: {
            companyId: challenge.companyId,
            contactId: challenge.contactId,
          },
        },
      });
      if (grant === null || grant.status !== 'ACTIVE' || grant.revokedAt !== null) {
        return { kind: 'invalid' };
      }
      const consumed = await transaction.emailVerificationChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return { kind: 'invalid' };

      await transaction.companyManagementSession.updateMany({
        where: { grantId: grant.id, revokedAt: null },
        data: { revokedAt: input.now },
      });
      const session = await transaction.companyManagementSession.create({
        data: {
          companyId: challenge.companyId,
          csrfDigest: Buffer.from(input.csrfDigest),
          expiresAt: input.sessionExpiresAt,
          grantId: grant.id,
          tokenDigest: Buffer.from(input.sessionTokenDigest),
        },
      });
      const verifications = await transaction.companyVerification.findMany({
        where: {
          companyId: challenge.companyId,
          contactId: challenge.contactId,
          status: 'VERIFIED',
        },
        select: { level: true },
      });
      await this.writeAudit(transaction, {
        action: 'company_management_link.exchanged',
        actorId: grant.id,
        actorType: 'MANAGEMENT_GRANT',
        companyId: challenge.companyId,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: session.id,
        targetType: 'company_management_session',
      });
      return {
        company: mapCompany(challenge.company),
        kind: 'management_session',
        session: {
          companyId: session.companyId,
          csrfDigest: new Uint8Array(session.csrfDigest),
          expiresAt: session.expiresAt,
          grantId: session.grantId,
          sessionId: session.id,
          tokenDigest: new Uint8Array(session.tokenDigest),
        },
        verificationLevels: verifications.map((verification) => verification.level),
      };
    });
  }

  async consumeContactVerification(
    input: ConsumeChallengeInput,
  ): Promise<VerificationExchangeResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "email_verification_challenges"
        WHERE "selector" = ${input.selector}
        FOR UPDATE
      `);
      const challenge = await transaction.emailVerificationChallenge.findUnique({
        where: { selector: input.selector },
        include: { company: true },
      });
      const digestMatches =
        challenge !== null &&
        challenge.tokenDigest.byteLength === input.candidateDigest.byteLength &&
        timingSafeEqual(challenge.tokenDigest, input.candidateDigest);
      const valid =
        challenge !== null &&
        digestMatches &&
        challenge.purpose === 'CONTACT_VERIFICATION' &&
        challenge.deliveryStatus === 'SENT' &&
        challenge.consumedAt === null &&
        challenge.revokedAt === null &&
        challenge.failedAttempts < input.maxFailedAttempts &&
        challenge.expiresAt > input.now;
      if (!valid || challenge === null) {
        if (
          challenge !== null &&
          challenge.consumedAt === null &&
          challenge.failedAttempts < input.maxFailedAttempts
        ) {
          await transaction.emailVerificationChallenge.update({
            where: { id: challenge.id },
            data: { failedAttempts: { increment: 1 } },
          });
        }
        return { kind: 'invalid' };
      }

      const consumed = await transaction.emailVerificationChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return { kind: 'invalid' };
      await transaction.companyContact.update({
        where: { id: challenge.contactId },
        data: { emailVerifiedAt: input.now },
      });
      const existingVerification = await transaction.companyVerification.findFirst({
        where: {
          companyId: challenge.companyId,
          contactId: challenge.contactId,
          level: 'CONTACT_VERIFIED',
          status: 'VERIFIED',
        },
      });
      if (existingVerification === null) {
        await transaction.companyVerification.create({
          data: {
            companyId: challenge.companyId,
            contactId: challenge.contactId,
            level: 'CONTACT_VERIFIED',
            source: 'email_challenge',
            status: 'VERIFIED',
            verifiedAt: input.now,
          },
        });
      }
      const intent = await transaction.takeoverIntent.findFirstOrThrow({
        where: {
          companyId: challenge.companyId,
          contactId: challenge.contactId,
          status: 'AWAITING_EMAIL_VERIFICATION',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (challenge.company.status === 'DRAFT') {
        const grant = await transaction.companyManagementGrant.upsert({
          where: {
            companyId_contactId: {
              companyId: challenge.companyId,
              contactId: challenge.contactId,
            },
          },
          create: {
            companyId: challenge.companyId,
            contactId: challenge.contactId,
            grantedAt: input.now,
            source: 'INITIAL_CONTACT',
          },
          update: { grantedAt: input.now, revokedAt: null, status: 'ACTIVE' },
        });
        const session = await transaction.companyManagementSession.create({
          data: {
            companyId: challenge.companyId,
            csrfDigest: Buffer.from(input.csrfDigest),
            expiresAt: input.sessionExpiresAt,
            grantId: grant.id,
            tokenDigest: Buffer.from(input.sessionTokenDigest),
          },
        });
        const updatedIntent = await transaction.takeoverIntent.update({
          where: { id: intent.id },
          data: { status: 'IDENTITY_READY' },
        });
        await this.writeAudit(transaction, {
          action: 'company_contact.verified',
          actorId: challenge.contactId,
          actorType: 'CONTACT',
          companyId: challenge.companyId,
          ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
          targetId: session.id,
          targetType: 'company_management_session',
        });
        return {
          company: mapCompany(challenge.company),
          intent: mapIntent(updatedIntent),
          kind: 'management_session',
          session: {
            companyId: session.companyId,
            csrfDigest: new Uint8Array(session.csrfDigest),
            expiresAt: session.expiresAt,
            grantId: session.grantId,
            sessionId: session.id,
            tokenDigest: new Uint8Array(session.tokenDigest),
          },
          verificationLevels: ['CONTACT_VERIFIED'],
        };
      }

      const accessRequest = await transaction.companyAccessRequest.create({
        data: {
          companyId: challenge.companyId,
          contactId: challenge.contactId,
          expiresAt: input.accessRequestExpiresAt,
          takeoverIntentId: intent.id,
        },
      });
      const updatedIntent = await transaction.takeoverIntent.update({
        where: { id: intent.id },
        data: { status: 'AWAITING_COMPANY_ACCESS' },
      });
      await this.writeAudit(transaction, {
        action: 'company_access_request.created',
        actorId: challenge.contactId,
        actorType: 'CONTACT',
        companyId: challenge.companyId,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        targetId: accessRequest.id,
        targetType: 'company_access_request',
      });
      return {
        accessRequest: {
          expiresAt: accessRequest.expiresAt,
          id: accessRequest.id,
          requestedAt: accessRequest.requestedAt,
          status: 'PENDING',
        },
        company: mapCompany(challenge.company),
        intent: mapIntent(updatedIntent),
        kind: 'access_request',
      };
    });
  }

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
  ): Promise<ManagementSessionAuthority | null> {
    const session = await this.prisma.companyManagementSession.findUnique({
      where: { tokenDigest: Buffer.from(digest) },
      include: {
        company: true,
        grant: {
          include: {
            contact: {
              include: {
                verifications: {
                  where: { status: 'VERIFIED' },
                  select: { companyId: true, level: true },
                },
              },
            },
          },
        },
      },
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
      company: mapCompany(session.company),
      companyId: session.companyId,
      contactId: session.grant.contactId,
      csrfDigest: new Uint8Array(session.csrfDigest),
      expiresAt: session.expiresAt,
      grantId: session.grantId,
      sessionId: session.id,
      verificationLevels: session.grant.contact.verifications
        .filter((verification) => verification.companyId === session.companyId)
        .map((verification) => verification.level),
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
