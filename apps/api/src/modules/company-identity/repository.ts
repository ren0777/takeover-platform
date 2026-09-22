import type { ManagementAuthority } from './authorization.js';

export type CompanyRecord = {
  activatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  logoUrl: string | null;
  name: string;
  normalizedWebsite: string;
  slug: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  updatedAt: Date;
  websiteUrl: string;
};

export type ContactRecord = {
  email: string;
  emailVerifiedAt: Date | null;
  id: string;
  normalizedEmail: string;
};

export type IntentRecord = {
  companyId: string;
  contactId: string;
  expiresAt: Date;
  id: string;
  status:
    | 'AWAITING_EMAIL_VERIFICATION'
    | 'AWAITING_COMPANY_ACCESS'
    | 'IDENTITY_READY'
    | 'EXPIRED'
    | 'CANCELLED';
  territoryExternalRef: string;
};

export type ChallengeRecord = {
  companyId: string;
  contactId: string;
  expiresAt: Date;
  id: string;
  selector: string;
  tokenDigest: Uint8Array;
};

export type BeginClaimRecord = {
  challenge: { expiresAt: Date; selector: string; tokenDigest: Uint8Array };
  company: {
    expiresAt: Date;
    logoUrl?: string;
    name: string;
    normalizedName: string;
    normalizedWebsite: string;
    websiteUrl: string;
  };
  contact: { email: string; normalizedEmail: string };
  intent: { expiresAt: Date; territoryExternalRef: string };
  now: Date;
  requestId?: string;
};

export type BeginClaimRecordResult = {
  challenge: ChallengeRecord;
  company: CompanyRecord;
  contact: ContactRecord;
  intent: IntentRecord;
  kind: 'new_company' | 'existing_company';
};

export type ConsumeChallengeInput = {
  accessRequestExpiresAt: Date;
  candidateDigest: Uint8Array;
  csrfDigest: Uint8Array;
  maxFailedAttempts: number;
  now: Date;
  requestId?: string;
  selector: string;
  sessionExpiresAt: Date;
  sessionTokenDigest: Uint8Array;
};

export type VerificationExchangeResult =
  | { kind: 'invalid' }
  | {
      accessRequest: { expiresAt: Date; id: string; requestedAt: Date; status: 'PENDING' };
      company: CompanyRecord;
      intent: IntentRecord;
      kind: 'access_request';
      requesterEmail: string;
    }
  | {
      company: CompanyRecord;
      intent: IntentRecord;
      kind: 'management_session';
      session: SessionRecord;
      verificationLevels: ['CONTACT_VERIFIED'];
    };

export type ContactVerificationAccessScope = {
  companyId: string;
  normalizedEmail: string;
};

export type ContactVerificationAccessScopeInput = {
  candidateDigest: Uint8Array;
  maxFailedAttempts: number;
  now: Date;
  selector: string;
};

export type IssueContactVerificationChallengeInput = {
  companyId: string;
  expiresAt: Date;
  normalizedEmail: string;
  now: Date;
  requestId?: string;
  selector: string;
  tokenDigest: Uint8Array;
};

export type IssuedContactVerificationChallenge = {
  challengeId: string;
  companyName: string;
  toEmail: string;
};

export type ManagementSessionAuthority = ManagementAuthority & {
  company: CompanyRecord;
  csrfDigest: Uint8Array;
  expiresAt: Date;
  verificationLevels: Array<'CONTACT_VERIFIED' | 'DOMAIN_VERIFIED' | 'MANUALLY_VERIFIED'>;
};

export type ManagementLinkCompanyLocator =
  { normalizedSlug: string } | { normalizedWebsite: string };

export type IssueManagementChallengeInput = Omit<
  IssueContactVerificationChallengeInput,
  'companyId'
> & {
  locator: ManagementLinkCompanyLocator;
};

export type IssuedManagementChallenge = IssuedContactVerificationChallenge;

export type ConsumeManagementChallengeInput = {
  candidateDigest: Uint8Array;
  csrfDigest: Uint8Array;
  maxFailedAttempts: number;
  now: Date;
  requestId?: string;
  selector: string;
  sessionExpiresAt: Date;
  sessionTokenDigest: Uint8Array;
};

export type ManagementChallengeExchangeResult =
  | { kind: 'invalid' }
  | {
      company: CompanyRecord;
      kind: 'management_session';
      session: SessionRecord;
      verificationLevels: Array<'CONTACT_VERIFIED' | 'DOMAIN_VERIFIED' | 'MANUALLY_VERIFIED'>;
    };

export type DecideAccessRequestInput = {
  accessRequestId: string;
  decidedByGrantId: string;
  decision: 'approved' | 'rejected';
  managementChallenge?: { expiresAt: Date; selector: string; tokenDigest: Uint8Array };
  now: Date;
  reason?: string;
  requestId?: string;
  sessionId: string;
};

export type AccessDecisionRecordResult = {
  accessRequest: {
    companyId: string;
    decidedAt: Date;
    expiresAt: Date;
    id: string;
    requestedAt: Date;
    status: 'APPROVED' | 'REJECTED';
  };
  challengeId?: string;
  companyName: string;
  requesterEmail: string;
};

export type ActiveManagerContact = { contactId: string; email: string };

export type AccessRequestReviewCursor = { id: string; requestedAt: Date };

export type PendingAccessRequestReviewRecord = {
  companyId: string;
  contactEmail: string;
  expiresAt: Date;
  id: string;
  intent?: { id: string; territoryExternalRef: string };
  requestedAt: Date;
};

export type PendingAccessRequestReviewPage = {
  items: PendingAccessRequestReviewRecord[];
  nextCursor: AccessRequestReviewCursor | null;
};

export type ListPendingAccessRequestsInput = {
  companyId: string;
  cursor?: AccessRequestReviewCursor;
  limit: number;
  now: Date;
};

export type PrepareAccessRequestNotificationsInput = {
  accessRequestId: string;
  challenges: Array<{
    contactId: string;
    expiresAt: Date;
    selector: string;
    tokenDigest: Uint8Array;
  }>;
  cooldownSeconds: number;
  now: Date;
  requestId?: string;
};

export type PreparedAccessRequestNotification = {
  challengeId: string;
  contactId: string;
  selector: string;
  toEmail: string;
};

export type RecoveryRecordInput = {
  accessRequestId: string;
  expiresAt: Date;
  normalizedEmail: string;
  now: Date;
  requestId?: string;
};

export type RecoveryRecordResult = { expiresAt: Date; id: string; status: 'PENDING' };

export type UpdateTakeoverPreparationInput = {
  companyId: string;
  currency?: string;
  intendedAmountMinor?: bigint;
  intentId: string;
  now: Date;
  requestId?: string;
  sessionId: string;
  quotedMinimumAmountMinor?: bigint;
  quotedOwnerCompanyId?: string;
  quotedTerritoryVersion?: string;
  quotedWinningAmountMinor?: bigint;
  quoteObservedAt?: Date;
  territoryExternalRef: string;
};

export type TakeoverIntentPreparationRecord = IntentRecord & {
  currency: string | null;
  intendedAmountMinor: bigint | null;
  quoteObservedAt: Date | null;
  quotedMinimumAmountMinor: bigint | null;
  quotedOwnerCompanyId: string | null;
  quotedTerritoryVersion: string | null;
  quotedWinningAmountMinor: bigint | null;
};

/**
 * The territory a preparation points at, resolved at read time from the
 * intent's reference so the view reflects the territory as it is now, not as
 * it was when the intent was created.
 */
export type PreparationTerritoryRecord = {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  categoryName: string;
  /** Price proven from the previous settled capture; null when unprovable. */
  claimedNextPriceMinor: bigint | null;
  currency: string;
  currentOwner: { name: string; slug: string } | null;
  /** Derived from currentOwner; kept explicit for the shared pricing rules. */
  hasActiveOwner: boolean;
  id: string;
  minimumTakeoverAmountMinor: bigint;
  name: string;
  slug: string;
  /** Territory.version at read time; quotes are bound to it. */
  version: bigint;
};

/** A stored quote row as the preparation surface reads it. Never mutated after creation. */
export type PreparationQuoteRecord = {
  companyId: string;
  consumedAt: Date | null;
  createdAt: Date;
  currency: string;
  expiresAt: Date;
  id: string;
  minimumAmountMinor: bigint;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  takeoverIntentId: string | null;
  territoryId: string;
  territoryVersion: bigint;
};

export type TakeoverPreparationRecord = {
  intent: TakeoverIntentPreparationRecord | null;
  /** The intent's most recent quote of any status, or null. */
  quote: PreparationQuoteRecord | null;
  territory: PreparationTerritoryRecord | null;
};

export type GeneratePreparationQuoteInput = {
  companyId: string;
  contactId: string;
  expiresAt: Date;
  now: Date;
  requestId?: string;
  sessionId: string;
};

export type GeneratePreparationQuoteResult =
  | { kind: 'unauthorized' }
  | { kind: 'no_intent' }
  | { kind: 'territory_missing' }
  | { kind: 'territory_disabled' }
  | { kind: 'pricing_not_configured' }
  | { kind: 'claimed_pricing_not_configured' }
  | {
      kind: 'quoted';
      /** True when an unexpired, still-accurate quote was returned instead of a new row. */
      reused: boolean;
      intent: TakeoverIntentPreparationRecord;
      quote: PreparationQuoteRecord;
      territory: PreparationTerritoryRecord;
    };

export type GetTakeoverPreparationInput = {
  companyId: string;
  contactId: string;
  now: Date;
};

export type StartTakeoverPreparationInput = {
  companyId: string;
  contactId: string;
  expiresAt: Date;
  now: Date;
  requestId?: string;
  sessionId: string;
  territoryExternalRef: string;
};

export type StartTakeoverPreparationResult =
  | { kind: 'territory_missing' }
  | { kind: 'territory_disabled' }
  | { kind: 'unauthorized' }
  | {
      kind: 'ready';
      /** False when the request matched the live preparation and nothing changed. */
      created: boolean;
      intent: TakeoverIntentPreparationRecord;
      /** The live intent's newest quote when it was reused; null for a new intent. */
      quote: PreparationQuoteRecord | null;
      territory: PreparationTerritoryRecord;
    };

export type CancelTakeoverIntentInput = {
  companyId: string;
  contactId: string;
  intentId: string;
  now: Date;
  requestId?: string;
  sessionId: string;
};

export type RateLimitInput = {
  expiresAt: Date;
  keyDigest: Uint8Array;
  limit: number;
  now: Date;
  windowStartedAt: Date;
};

export type CreateSessionInput = {
  companyId: string;
  csrfDigest: Uint8Array;
  expiresAt: Date;
  grantId: string;
  requestId?: string;
  tokenDigest: Uint8Array;
};

export type SessionRecord = ManagementAuthority & {
  csrfDigest: Uint8Array;
  expiresAt: Date;
  tokenDigest: Uint8Array;
};

export type RevokeSessionInput = {
  now: Date;
  requestId?: string;
  sessionId: string;
};

export interface CompanyIdentityRepository {
  beginCompanyClaim(input: BeginClaimRecord): Promise<BeginClaimRecordResult>;
  consumeContactVerification(input: ConsumeChallengeInput): Promise<VerificationExchangeResult>;
  consumeManagementChallenge(
    input: ConsumeManagementChallengeInput,
  ): Promise<ManagementChallengeExchangeResult>;
  consumeRateLimit(input: RateLimitInput): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  createManagementSession(input: CreateSessionInput): Promise<SessionRecord>;
  decideAccessRequest(input: DecideAccessRequestInput): Promise<AccessDecisionRecordResult>;
  getContactVerificationAccessScope(
    input: ContactVerificationAccessScopeInput,
  ): Promise<ContactVerificationAccessScope | null>;
  getAccessRequestCompanyId(accessRequestId: string): Promise<string | null>;
  issueContactVerificationChallenge(
    input: IssueContactVerificationChallengeInput,
  ): Promise<IssuedContactVerificationChallenge | null>;
  issueManagementChallenge(
    input: IssueManagementChallengeInput,
  ): Promise<IssuedManagementChallenge | null>;
  listActiveManagerContacts(companyId: string): Promise<ActiveManagerContact[]>;
  listPendingAccessRequests(
    input: ListPendingAccessRequestsInput,
  ): Promise<PendingAccessRequestReviewPage>;
  markChallengeDelivery(challengeId: string, status: 'SENT' | 'FAILED'): Promise<void>;
  prepareAccessRequestNotifications(
    input: PrepareAccessRequestNotificationsInput,
  ): Promise<PreparedAccessRequestNotification[]>;
  recordAccessDecisionNotificationFailure(
    accessRequestId: string,
    reason: string,
    now: Date,
  ): Promise<void>;
  requestManualRecovery(input: RecoveryRecordInput): Promise<RecoveryRecordResult | null>;
  resolveManagementSession(
    digest: Uint8Array,
    now: Date,
  ): Promise<ManagementSessionAuthority | null>;
  revokeManagementSession(input: RevokeSessionInput): Promise<void>;
  updateTakeoverPreparation(
    input: UpdateTakeoverPreparationInput,
  ): Promise<TakeoverIntentPreparationRecord | null>;
  getTakeoverPreparation(input: GetTakeoverPreparationInput): Promise<TakeoverPreparationRecord>;
  startTakeoverPreparation(
    input: StartTakeoverPreparationInput,
  ): Promise<StartTakeoverPreparationResult>;
  /** Resolves to null when the intent is not this company's. */
  cancelTakeoverIntent(input: CancelTakeoverIntentInput): Promise<TakeoverPreparationRecord | null>;
  generatePreparationQuote(
    input: GeneratePreparationQuoteInput,
  ): Promise<GeneratePreparationQuoteResult>;
}
