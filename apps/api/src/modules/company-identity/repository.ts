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
    }
  | {
      company: CompanyRecord;
      intent: IntentRecord;
      kind: 'management_session';
      session: SessionRecord;
      verificationLevels: ['CONTACT_VERIFIED'];
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

export type IssueManagementChallengeInput = IssueContactVerificationChallengeInput;

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
  issueContactVerificationChallenge(
    input: IssueContactVerificationChallengeInput,
  ): Promise<IssuedContactVerificationChallenge | null>;
  issueManagementChallenge(
    input: IssueManagementChallengeInput,
  ): Promise<IssuedManagementChallenge | null>;
  markChallengeDelivery(challengeId: string, status: 'SENT' | 'FAILED'): Promise<void>;
  resolveManagementSession(digest: Uint8Array, now: Date): Promise<ManagementSessionAuthority | null>;
  revokeManagementSession(input: RevokeSessionInput): Promise<void>;
}
