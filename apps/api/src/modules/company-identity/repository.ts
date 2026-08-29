import type { ManagementAuthority } from './authorization.js';

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
  tokenDigest: Uint8Array;
};

export type RevokeSessionInput = {
  now: Date;
  requestId?: string;
  sessionId: string;
};

export interface CompanyIdentityRepository {
  consumeRateLimit(input: RateLimitInput): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  createManagementSession(input: CreateSessionInput): Promise<SessionRecord>;
  resolveManagementSession(digest: Uint8Array, now: Date): Promise<ManagementAuthority | null>;
  revokeManagementSession(input: RevokeSessionInput): Promise<void>;
}
