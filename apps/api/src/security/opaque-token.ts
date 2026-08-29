import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hashSecurityScope } from './scope-key.js';

export type IssuedLinkToken = { rawToken: string; selector: string; digest: Uint8Array };
export type IssuedSessionToken = { rawToken: string; digest: Uint8Array };

export type OpaqueTokenService = {
  issueLinkToken(): IssuedLinkToken;
  issueSessionToken(): IssuedSessionToken;
  digestLinkSecret(selector: string, secret: string): Uint8Array;
  digestSessionToken(rawToken: string): Uint8Array;
  digestCsrfToken(rawToken: string): Uint8Array;
  digestRateScope(scope: string): Uint8Array;
  digestIpAddress(ipAddress: string): Uint8Array;
  verifyDigest(candidate: Uint8Array, stored: Uint8Array): boolean;
};

export function createOpaqueTokenService(key: Uint8Array): OpaqueTokenService {
  if (key.byteLength < 32) throw new Error('Opaque token key must contain at least 32 bytes');

  const digestLinkSecret = (selector: string, secret: string): Uint8Array =>
    hashSecurityScope(key, 'link', selector, secret);

  return {
    issueLinkToken() {
      const selector = randomBytes(16).toString('base64url');
      const secret = randomBytes(32).toString('base64url');
      return {
        digest: digestLinkSecret(selector, secret),
        rawToken: `${selector}.${secret}`,
        selector,
      };
    },
    issueSessionToken() {
      const rawToken = randomBytes(32).toString('base64url');
      return { digest: hashSecurityScope(key, 'session', rawToken), rawToken };
    },
    digestLinkSecret,
    digestSessionToken: (rawToken) => hashSecurityScope(key, 'session', rawToken),
    digestCsrfToken: (rawToken) => hashSecurityScope(key, 'csrf', rawToken),
    digestRateScope: (scope) => hashSecurityScope(key, 'rate-key', scope),
    digestIpAddress: (ipAddress) => hashSecurityScope(key, 'ip', ipAddress),
    verifyDigest(candidate, stored) {
      if (candidate.byteLength !== stored.byteLength) return false;
      return timingSafeEqual(candidate, stored);
    },
  };
}
