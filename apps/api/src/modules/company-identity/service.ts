import {
  accessDecisionRequestSchema,
  companyClaimRequestSchema,
  emailVerificationRequestSchema,
  emailTokenExchangeRequestSchema,
  managementLinkRequestSchema,
  recoveryRequestSchema,
  takeoverPreparationRequestSchema,
  type AccessDecisionRequest,
  type AccessDecisionResult,
  type AcceptedDelivery,
  type Company,
  type CompanyClaimRequest,
  type CompanyClaimResult,
  type EmailTokenExchangeRequest,
  type EmailTokenExchangeResult,
  type EmailVerificationRequest,
  type ManagementContext,
  type ManagementLinkRequest,
  type RecoveryRequest,
  type RecoveryRequestResult,
  type TakeoverIntent,
  type TakeoverPreparationRequest,
} from '@takeover/shared';
import type { IdentityConfig } from '../../config/env.js';
import type { EmailProvider } from '../../integrations/email/email-provider.js';
import type { OpaqueTokenService } from '../../security/opaque-token.js';
import { normalizeCompanyName, normalizeCompanyWebsite, normalizeContactEmail } from './domain.js';
import type {
  CompanyIdentityRepository,
  CompanyRecord,
  IntentRecord,
  TakeoverIntentPreparationRecord,
} from './repository.js';
import {
  assertCompanyAuthority,
  ManagementAuthorizationRequiredError,
  type ManagementAuthority,
} from './authorization.js';

export type Clock = { now(): Date };
export type IdentityRequestContext = { ipAddress: string; requestId: string };

export class InvalidCapabilityTokenError extends Error {
  readonly code = 'INVALID_OR_EXPIRED_TOKEN';
  readonly statusCode = 401;

  constructor() {
    super('The link is invalid or has expired');
    this.name = 'InvalidCapabilityTokenError';
  }
}

export class IdentityRateLimitError extends Error {
  readonly code = 'RATE_LIMITED';
  readonly statusCode = 429;

  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests');
    this.name = 'IdentityRateLimitError';
  }
}

type CompanyIdentityServiceDependencies = {
  clock: Clock;
  config: IdentityConfig;
  emailProvider: EmailProvider;
  repository: CompanyIdentityRepository;
  tokens: OpaqueTokenService;
};

type VerificationExchangeOutput = {
  csrfToken?: string;
  response: EmailTokenExchangeResult;
  sessionToken?: string;
};

function addSeconds(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1_000);
}

function startOfWindow(now: Date, durationSeconds: number): Date {
  const durationMs = durationSeconds * 1_000;
  return new Date(Math.floor(now.getTime() / durationMs) * durationMs);
}

function mapCompany(record: CompanyRecord): Company {
  return {
    activatedAt: record.activatedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    id: record.id,
    logoUrl: record.logoUrl,
    name: record.name,
    slug: record.slug,
    status: record.status.toLowerCase() as Company['status'],
    updatedAt: record.updatedAt.toISOString(),
    websiteUrl: record.websiteUrl,
  };
}

function mapIntent(record: IntentRecord): TakeoverIntent {
  return {
    checkoutAvailable: false,
    companyId: record.companyId,
    expiresAt: record.expiresAt.toISOString(),
    id: record.id,
    quoteAuthority: 'reference_only',
    status: record.status.toLowerCase() as TakeoverIntent['status'],
    territoryExternalRef: record.territoryExternalRef,
  };
}

function safeMinorAmount(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new Error('Minor amount exceeds safe integer boundary');
  return value;
}

function mapPreparedIntent(record: TakeoverIntentPreparationRecord): TakeoverIntent {
  const currency = record.currency;
  return {
    ...mapIntent(record),
    ...(record.intendedAmountMinor === null || currency === null
      ? {}
      : { intendedBid: { amountMinor: safeMinorAmount(record.intendedAmountMinor), currency } }),
    ...(record.quotedTerritoryVersion === null || record.quoteObservedAt === null
      ? {}
      : {
          quoteSnapshot: {
            ...(record.quotedOwnerCompanyId === null
              ? {}
              : { ownerCompanyId: record.quotedOwnerCompanyId }),
            ...(record.quotedWinningAmountMinor === null || currency === null
              ? {}
              : {
                  currentWinningAmount: {
                    amountMinor: safeMinorAmount(record.quotedWinningAmountMinor),
                    currency,
                  },
                }),
            ...(record.quotedMinimumAmountMinor === null || currency === null
              ? {}
              : {
                  minimumTakeoverAmount: {
                    amountMinor: safeMinorAmount(record.quotedMinimumAmountMinor),
                    currency,
                  },
                }),
            observedAt: record.quoteObservedAt.toISOString(),
            territoryVersion: record.quotedTerritoryVersion,
          },
        }),
  };
}

function parseLinkToken(rawToken: string): { secret: string; selector: string } | null {
  const parts = rawToken.split('.');
  if (parts.length !== 2) return null;
  const [selector, secret] = parts;
  if (
    selector === undefined ||
    secret === undefined ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(selector) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(secret)
  ) {
    return null;
  }
  return { secret, selector };
}

export function createCompanyIdentityService(dependencies: CompanyIdentityServiceDependencies) {
  const enforceRateLimit = async (
    scope: string,
    limit: number,
    durationSeconds: number,
    now: Date,
  ): Promise<void> => {
    const windowStartedAt = startOfWindow(now, durationSeconds);
    const result = await dependencies.repository.consumeRateLimit({
      expiresAt: addSeconds(windowStartedAt, durationSeconds),
      keyDigest: dependencies.tokens.digestRateScope(scope),
      limit,
      now,
      windowStartedAt,
    });
    if (!result.allowed) throw new IdentityRateLimitError(result.retryAfterSeconds);
  };

  const decideAccessRequest = async (
    accessRequestId: string,
    rawRequest: AccessDecisionRequest,
    decision: 'approved' | 'rejected',
    sessionToken: string,
    csrfToken: string,
    context: IdentityRequestContext,
  ): Promise<AccessDecisionResult> => {
    const request = accessDecisionRequestSchema.parse(rawRequest);
    const companyId = await dependencies.repository.getAccessRequestCompanyId(accessRequestId);
    if (companyId === null) throw new InvalidCapabilityTokenError();
    const authority = await dependencies.repository.resolveManagementSession(
      dependencies.tokens.digestSessionToken(sessionToken),
      dependencies.clock.now(),
    );
    if (
      authority === null ||
      !dependencies.tokens.verifyDigest(
        dependencies.tokens.digestCsrfToken(csrfToken),
        authority.csrfDigest,
      )
    ) {
      throw new ManagementAuthorizationRequiredError();
    }
    assertCompanyAuthority(authority, companyId);
    const now = dependencies.clock.now();
    const managementToken = decision === 'approved' ? dependencies.tokens.issueLinkToken() : null;
    const decided = await dependencies.repository.decideAccessRequest({
      accessRequestId,
      decidedByGrantId: authority.grantId,
      decision,
      ...(managementToken === null
        ? {}
        : {
            managementChallenge: {
              expiresAt: addSeconds(now, dependencies.config.managementLinkTtlSeconds),
              selector: managementToken.selector,
              tokenDigest: managementToken.digest,
            },
          }),
      now,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      requestId: context.requestId,
    });
    try {
      await dependencies.emailProvider.sendAccessDecisionNotification({
        companyName: decided.companyName,
        decision,
        ...(managementToken === null ? {} : { rawManagementToken: managementToken.rawToken }),
        toEmail: decided.requesterEmail,
      });
      if (decided.challengeId !== undefined) {
        await dependencies.repository.markChallengeDelivery(decided.challengeId, 'SENT');
      }
    } catch (error) {
      if (decided.challengeId !== undefined) {
        await dependencies.repository.markChallengeDelivery(decided.challengeId, 'FAILED');
      }
      await dependencies.repository.recordAccessDecisionNotificationFailure(
        accessRequestId,
        error instanceof Error ? error.message : 'Unknown email delivery failure',
        now,
      );
    }
    return {
      accessRequest: {
        companyId: decided.accessRequest.companyId,
        decidedAt: decided.accessRequest.decidedAt.toISOString(),
        expiresAt: decided.accessRequest.expiresAt.toISOString(),
        id: decided.accessRequest.id,
        requestedAt: decided.accessRequest.requestedAt.toISOString(),
        status: decision,
      },
      checkoutAvailable: false,
    };
  };

  return {
    async beginCompanyClaim(
      rawRequest: CompanyClaimRequest,
      context: IdentityRequestContext,
    ): Promise<CompanyClaimResult> {
      const request = companyClaimRequestSchema.parse(rawRequest);
      const now = dependencies.clock.now();
      const contactEmail = normalizeContactEmail(request.contactEmail);
      await enforceRateLimit(
        `claim-email:${contactEmail}`,
        dependencies.config.rateLimits.linkIssuancePerEmailPerHour,
        3_600,
        now,
      );
      await enforceRateLimit(
        `claim-ip:${context.ipAddress}`,
        dependencies.config.rateLimits.linkIssuancePerIpPerHour,
        3_600,
        now,
      );

      const normalizedName = normalizeCompanyName(request.company.name);
      const websiteUrl = normalizeCompanyWebsite(request.company.websiteUrl);
      const issued = dependencies.tokens.issueLinkToken();
      const claim = await dependencies.repository.beginCompanyClaim({
        challenge: {
          expiresAt: addSeconds(now, dependencies.config.emailVerificationTtlSeconds),
          selector: issued.selector,
          tokenDigest: issued.digest,
        },
        company: {
          expiresAt: addSeconds(now, dependencies.config.draftTtlSeconds),
          ...(request.company.logoUrl === undefined
            ? {}
            : { logoUrl: normalizeCompanyWebsite(request.company.logoUrl) }),
          name: normalizedName.displayName,
          normalizedName: normalizedName.normalizedName,
          normalizedWebsite: websiteUrl,
          websiteUrl,
        },
        contact: { email: contactEmail, normalizedEmail: contactEmail },
        intent: {
          expiresAt: addSeconds(now, dependencies.config.draftTtlSeconds),
          territoryExternalRef: request.intent.territoryExternalRef,
        },
        now,
        requestId: context.requestId,
      });

      try {
        await dependencies.emailProvider.sendVerification({
          companyName: claim.company.name,
          rawToken: issued.rawToken,
          toEmail: claim.contact.email,
        });
        await dependencies.repository.markChallengeDelivery(claim.challenge.id, 'SENT');
      } catch (error) {
        await dependencies.repository.markChallengeDelivery(claim.challenge.id, 'FAILED');
        throw error;
      }

      return {
        checkoutAvailable: false,
        company: mapCompany(claim.company),
        contactVerification: { deliveryAccepted: true, status: 'verification_required' },
        intent: mapIntent(claim.intent),
        nextAction: 'verify_email',
      };
    },

    async exchangeEmailVerification(
      rawRequest: EmailTokenExchangeRequest,
      context: IdentityRequestContext,
    ): Promise<VerificationExchangeOutput> {
      let request: EmailTokenExchangeRequest;
      try {
        request = emailTokenExchangeRequestSchema.parse(rawRequest);
      } catch {
        throw new InvalidCapabilityTokenError();
      }
      const parsed = parseLinkToken(request.token);
      if (parsed === null) throw new InvalidCapabilityTokenError();
      const now = dependencies.clock.now();
      await enforceRateLimit(
        `exchange-selector:${parsed.selector}`,
        dependencies.config.rateLimits.tokenExchangeFailuresPerSelector,
        dependencies.config.emailVerificationTtlSeconds,
        now,
      );
      await enforceRateLimit(
        `exchange-ip:${context.ipAddress}`,
        dependencies.config.rateLimits.tokenExchangeAttemptsPerIpPerHour,
        3_600,
        now,
      );

      const session = dependencies.tokens.issueSessionToken();
      const csrf = dependencies.tokens.issueSessionToken();
      const exchange = await dependencies.repository.consumeContactVerification({
        accessRequestExpiresAt: addSeconds(now, dependencies.config.accessRequestTtlSeconds),
        candidateDigest: dependencies.tokens.digestLinkSecret(parsed.selector, parsed.secret),
        csrfDigest: dependencies.tokens.digestCsrfToken(csrf.rawToken),
        maxFailedAttempts: dependencies.config.rateLimits.tokenExchangeFailuresPerSelector,
        now,
        requestId: context.requestId,
        selector: parsed.selector,
        sessionExpiresAt: addSeconds(now, dependencies.config.managementSessionTtlSeconds),
        sessionTokenDigest: session.digest,
      });
      if (exchange.kind === 'invalid') throw new InvalidCapabilityTokenError();

      if (exchange.kind === 'access_request') {
        const managers = await dependencies.repository.listActiveManagerContacts(
          exchange.company.id,
        );
        const notificationTokens = managers.map((manager) => ({
          manager,
          token: dependencies.tokens.issueLinkToken(),
        }));
        const prepared = await dependencies.repository.prepareAccessRequestNotifications({
          accessRequestId: exchange.accessRequest.id,
          challenges: notificationTokens.map(({ manager, token }) => ({
            contactId: manager.contactId,
            expiresAt: addSeconds(now, dependencies.config.managementLinkTtlSeconds),
            selector: token.selector,
            tokenDigest: token.digest,
          })),
          cooldownSeconds: dependencies.config.rateLimits.managerNotificationCooldownSeconds,
          now,
          requestId: context.requestId,
        });
        const rawTokenBySelector = new Map(
          notificationTokens.map(({ token }) => [token.selector, token.rawToken]),
        );
        for (const notification of prepared) {
          const rawReviewToken = rawTokenBySelector.get(notification.selector);
          if (rawReviewToken === undefined) continue;
          try {
            await dependencies.emailProvider.sendAccessRequestNotification({
              companyName: exchange.company.name,
              rawReviewToken,
              requesterEmail: exchange.requesterEmail,
              toEmail: notification.toEmail,
            });
            await dependencies.repository.markChallengeDelivery(notification.challengeId, 'SENT');
          } catch {
            await dependencies.repository.markChallengeDelivery(notification.challengeId, 'FAILED');
          }
        }
        return {
          response: {
            accessRequest: {
              companyId: exchange.company.id,
              decidedAt: null,
              expiresAt: exchange.accessRequest.expiresAt.toISOString(),
              id: exchange.accessRequest.id,
              requestedAt: exchange.accessRequest.requestedAt.toISOString(),
              status: 'pending',
            },
            checkoutAvailable: false,
            company: mapCompany(exchange.company),
            intent: mapIntent(exchange.intent),
            nextAction: 'await_company_access',
          },
        };
      }

      const csrfToken = csrf.rawToken;
      return {
        csrfToken,
        response: {
          checkoutAvailable: false,
          company: mapCompany(exchange.company),
          intent: mapIntent(exchange.intent),
          managementContext: {
            company: mapCompany(exchange.company),
            csrfToken,
            sessionExpiresAt: exchange.session.expiresAt.toISOString(),
            verificationLevels: ['contact_verified'],
          },
          nextAction: 'manage_company',
        },
        sessionToken: session.rawToken,
      };
    },

    async reissueEmailVerification(
      rawRequest: EmailVerificationRequest,
      context: IdentityRequestContext,
    ): Promise<AcceptedDelivery> {
      const request = emailVerificationRequestSchema.parse(rawRequest);
      const now = dependencies.clock.now();
      const contactEmail = normalizeContactEmail(request.contactEmail);
      await enforceRateLimit(
        `verification-reissue-email:${contactEmail}`,
        dependencies.config.rateLimits.linkIssuancePerEmailPerHour,
        3_600,
        now,
      );
      await enforceRateLimit(
        `verification-reissue-ip:${context.ipAddress}`,
        dependencies.config.rateLimits.linkIssuancePerIpPerHour,
        3_600,
        now,
      );
      const issued = dependencies.tokens.issueLinkToken();
      const challenge = await dependencies.repository.issueContactVerificationChallenge({
        companyId: request.companyId,
        expiresAt: addSeconds(now, dependencies.config.emailVerificationTtlSeconds),
        normalizedEmail: contactEmail,
        now,
        requestId: context.requestId,
        selector: issued.selector,
        tokenDigest: issued.digest,
      });
      if (challenge === null) return { accepted: true };

      try {
        await dependencies.emailProvider.sendVerification({
          companyName: challenge.companyName,
          rawToken: issued.rawToken,
          toEmail: challenge.toEmail,
        });
        await dependencies.repository.markChallengeDelivery(challenge.challengeId, 'SENT');
      } catch (error) {
        await dependencies.repository.markChallengeDelivery(challenge.challengeId, 'FAILED');
        throw error;
      }
      return { accepted: true };
    },

    async getManagementContext(
      sessionToken: string,
      csrfToken: string,
    ): Promise<ManagementContext> {
      const authority = await dependencies.repository.resolveManagementSession(
        dependencies.tokens.digestSessionToken(sessionToken),
        dependencies.clock.now(),
      );
      if (
        authority === null ||
        !dependencies.tokens.verifyDigest(
          dependencies.tokens.digestCsrfToken(csrfToken),
          authority.csrfDigest,
        )
      ) {
        throw new ManagementAuthorizationRequiredError();
      }
      return {
        company: mapCompany(authority.company),
        csrfToken,
        sessionExpiresAt: authority.expiresAt.toISOString(),
        verificationLevels: authority.verificationLevels.map(
          (level) => level.toLowerCase() as ManagementContext['verificationLevels'][number],
        ),
      };
    },

    async revokeManagementSession(
      sessionToken: string,
      csrfToken: string,
      context: IdentityRequestContext,
    ): Promise<void> {
      const authority = await dependencies.repository.resolveManagementSession(
        dependencies.tokens.digestSessionToken(sessionToken),
        dependencies.clock.now(),
      );
      if (
        authority === null ||
        !dependencies.tokens.verifyDigest(
          dependencies.tokens.digestCsrfToken(csrfToken),
          authority.csrfDigest,
        )
      ) {
        throw new ManagementAuthorizationRequiredError();
      }
      await dependencies.repository.revokeManagementSession({
        now: dependencies.clock.now(),
        requestId: context.requestId,
        sessionId: authority.sessionId,
      });
    },

    async requestManagementLink(
      rawRequest: ManagementLinkRequest,
      context: IdentityRequestContext,
    ): Promise<AcceptedDelivery> {
      const request = managementLinkRequestSchema.parse(rawRequest);
      const now = dependencies.clock.now();
      const contactEmail = normalizeContactEmail(request.contactEmail);
      await enforceRateLimit(
        `management-link-email:${contactEmail}`,
        dependencies.config.rateLimits.linkIssuancePerEmailPerHour,
        3_600,
        now,
      );
      await enforceRateLimit(
        `management-link-ip:${context.ipAddress}`,
        dependencies.config.rateLimits.linkIssuancePerIpPerHour,
        3_600,
        now,
      );
      const issued = dependencies.tokens.issueLinkToken();
      const challenge = await dependencies.repository.issueManagementChallenge({
        companyId: request.companyId,
        expiresAt: addSeconds(now, dependencies.config.managementLinkTtlSeconds),
        normalizedEmail: contactEmail,
        now,
        requestId: context.requestId,
        selector: issued.selector,
        tokenDigest: issued.digest,
      });
      if (challenge === null) return { accepted: true };

      try {
        await dependencies.emailProvider.sendManagementLink({
          companyName: challenge.companyName,
          rawToken: issued.rawToken,
          toEmail: challenge.toEmail,
        });
        await dependencies.repository.markChallengeDelivery(challenge.challengeId, 'SENT');
      } catch (error) {
        await dependencies.repository.markChallengeDelivery(challenge.challengeId, 'FAILED');
        throw error;
      }
      return { accepted: true };
    },

    async exchangeManagementLink(
      rawRequest: EmailTokenExchangeRequest,
      context: IdentityRequestContext,
    ): Promise<{ context: ManagementContext; csrfToken: string; sessionToken: string }> {
      let request: EmailTokenExchangeRequest;
      try {
        request = emailTokenExchangeRequestSchema.parse(rawRequest);
      } catch {
        throw new InvalidCapabilityTokenError();
      }
      const parsed = parseLinkToken(request.token);
      if (parsed === null) throw new InvalidCapabilityTokenError();
      const now = dependencies.clock.now();
      await enforceRateLimit(
        `management-exchange-selector:${parsed.selector}`,
        dependencies.config.rateLimits.tokenExchangeFailuresPerSelector,
        dependencies.config.managementLinkTtlSeconds,
        now,
      );
      await enforceRateLimit(
        `management-exchange-ip:${context.ipAddress}`,
        dependencies.config.rateLimits.tokenExchangeAttemptsPerIpPerHour,
        3_600,
        now,
      );

      const session = dependencies.tokens.issueSessionToken();
      const csrf = dependencies.tokens.issueSessionToken();
      const exchange = await dependencies.repository.consumeManagementChallenge({
        candidateDigest: dependencies.tokens.digestLinkSecret(parsed.selector, parsed.secret),
        csrfDigest: dependencies.tokens.digestCsrfToken(csrf.rawToken),
        maxFailedAttempts: dependencies.config.rateLimits.tokenExchangeFailuresPerSelector,
        now,
        requestId: context.requestId,
        selector: parsed.selector,
        sessionExpiresAt: addSeconds(now, dependencies.config.managementSessionTtlSeconds),
        sessionTokenDigest: session.digest,
      });
      if (exchange.kind === 'invalid') throw new InvalidCapabilityTokenError();
      const csrfToken = csrf.rawToken;
      return {
        context: {
          company: mapCompany(exchange.company),
          csrfToken,
          sessionExpiresAt: exchange.session.expiresAt.toISOString(),
          verificationLevels: exchange.verificationLevels.map(
            (level) => level.toLowerCase() as ManagementContext['verificationLevels'][number],
          ),
        },
        csrfToken,
        sessionToken: session.rawToken,
      };
    },

    async authorizeCompanyMutation(
      sessionToken: string,
      csrfToken: string,
      companyId: string,
    ): Promise<ManagementAuthority> {
      const authority = await dependencies.repository.resolveManagementSession(
        dependencies.tokens.digestSessionToken(sessionToken),
        dependencies.clock.now(),
      );
      if (
        authority === null ||
        !dependencies.tokens.verifyDigest(
          dependencies.tokens.digestCsrfToken(csrfToken),
          authority.csrfDigest,
        )
      ) {
        throw new ManagementAuthorizationRequiredError();
      }
      assertCompanyAuthority(authority, companyId);
      return authority;
    },

    async approveAccessRequest(
      accessRequestId: string,
      request: AccessDecisionRequest,
      sessionToken: string,
      csrfToken: string,
      context: IdentityRequestContext,
    ): Promise<AccessDecisionResult> {
      return decideAccessRequest(
        accessRequestId,
        request,
        'approved',
        sessionToken,
        csrfToken,
        context,
      );
    },

    async rejectAccessRequest(
      accessRequestId: string,
      request: AccessDecisionRequest,
      sessionToken: string,
      csrfToken: string,
      context: IdentityRequestContext,
    ): Promise<AccessDecisionResult> {
      return decideAccessRequest(
        accessRequestId,
        request,
        'rejected',
        sessionToken,
        csrfToken,
        context,
      );
    },

    async requestManualRecovery(
      rawRequest: RecoveryRequest,
      context: IdentityRequestContext,
    ): Promise<RecoveryRequestResult> {
      const request = recoveryRequestSchema.parse(rawRequest);
      const now = dependencies.clock.now();
      const normalizedEmail = normalizeContactEmail(request.contactEmail);
      await enforceRateLimit(
        `recovery:${request.accessRequestId}:${normalizedEmail}`,
        dependencies.config.rateLimits.recoveryRequestsPerContactCompanyPerDay,
        86_400,
        now,
      );
      const recovery = await dependencies.repository.requestManualRecovery({
        accessRequestId: request.accessRequestId,
        expiresAt: addSeconds(now, dependencies.config.recoveryRequestTtlSeconds),
        normalizedEmail,
        now,
        requestId: context.requestId,
      });
      if (recovery === null) throw new InvalidCapabilityTokenError();
      return {
        executionAvailable: false,
        expiresAt: recovery.expiresAt.toISOString(),
        id: recovery.id,
        status: 'pending',
      };
    },

    async updateTakeoverPreparation(
      intentId: string,
      rawRequest: TakeoverPreparationRequest,
      sessionToken: string,
      csrfToken: string,
      context: IdentityRequestContext,
    ): Promise<TakeoverIntent> {
      const request = takeoverPreparationRequestSchema.parse(rawRequest);
      const authority = await dependencies.repository.resolveManagementSession(
        dependencies.tokens.digestSessionToken(sessionToken),
        dependencies.clock.now(),
      );
      if (
        authority === null ||
        !dependencies.tokens.verifyDigest(
          dependencies.tokens.digestCsrfToken(csrfToken),
          authority.csrfDigest,
        )
      ) {
        throw new ManagementAuthorizationRequiredError();
      }
      const now = dependencies.clock.now();
      const record = await dependencies.repository.updateTakeoverPreparation({
        companyId: authority.companyId,
        ...(request.intendedBid === undefined
          ? {}
          : {
              currency: request.intendedBid.currency,
              intendedAmountMinor: BigInt(request.intendedBid.amountMinor),
            }),
        intentId,
        now,
        requestId: context.requestId,
        ...(request.quoteSnapshot?.minimumTakeoverAmount === undefined
          ? {}
          : {
              currency: request.quoteSnapshot.minimumTakeoverAmount.currency,
              quotedMinimumAmountMinor: BigInt(
                request.quoteSnapshot.minimumTakeoverAmount.amountMinor,
              ),
            }),
        ...(request.quoteSnapshot?.ownerCompanyId === undefined
          ? {}
          : { quotedOwnerCompanyId: request.quoteSnapshot.ownerCompanyId }),
        ...(request.quoteSnapshot === undefined
          ? {}
          : {
              quoteObservedAt: new Date(request.quoteSnapshot.observedAt),
              quotedTerritoryVersion: request.quoteSnapshot.territoryVersion,
            }),
        ...(request.quoteSnapshot?.currentWinningAmount === undefined
          ? {}
          : {
              currency: request.quoteSnapshot.currentWinningAmount.currency,
              quotedWinningAmountMinor: BigInt(
                request.quoteSnapshot.currentWinningAmount.amountMinor,
              ),
            }),
        territoryExternalRef: request.territoryExternalRef,
      });
      if (record === null) throw new ManagementAuthorizationRequiredError();
      return mapPreparedIntent(record);
    },
  };
}

export type CompanyIdentityService = ReturnType<typeof createCompanyIdentityService>;
