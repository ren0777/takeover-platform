import { describe, expect, it } from 'vitest';
import { createOpaqueTokenService } from '../src/security/opaque-token.js';
import {
  managementSessionCookieOptions,
  MANAGEMENT_SESSION_COOKIE_NAME,
} from '../src/security/session-cookie.js';
import { assertTrustedMutationOrigin } from '../src/security/request-origin.js';

const secret = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

describe('opaque capability tokens', () => {
  it('issues unique links with 256-bit secrets and stores only a keyed digest', () => {
    const tokens = createOpaqueTokenService(secret);
    const first = tokens.issueLinkToken();
    const second = tokens.issueLinkToken();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(Buffer.from(first.rawToken.split('.')[1] ?? '', 'base64url')).toHaveLength(32);
    expect(first.digest).toHaveLength(32);
    expect(Buffer.from(first.digest).toString('base64url')).not.toContain(first.rawToken);
    expect(tokens.verifyDigest(first.digest, first.digest)).toBe(true);
    expect(tokens.verifyDigest(second.digest, first.digest)).toBe(false);
  });

  it('domain-separates link, session, CSRF, rate, and IP digests', () => {
    const tokens = createOpaqueTokenService(secret);
    const link = tokens.issueLinkToken();
    const rawSession = link.rawToken;
    const linkSecret = link.rawToken.split('.')[1] ?? '';

    expect(
      tokens.verifyDigest(tokens.digestLinkSecret(link.selector, linkSecret), link.digest),
    ).toBe(true);
    expect(tokens.verifyDigest(tokens.digestSessionToken(rawSession), link.digest)).toBe(false);
    expect(tokens.digestCsrfToken(rawSession)).not.toEqual(tokens.digestRateScope(rawSession));
    expect(tokens.digestRateScope(rawSession)).not.toEqual(tokens.digestIpAddress(rawSession));
  });

  it('rejects a different secret without throwing or leaking comparison length', () => {
    const tokens = createOpaqueTokenService(secret);
    const link = tokens.issueLinkToken();

    expect(
      tokens.verifyDigest(tokens.digestLinkSecret(link.selector, 'wrong-secret'), link.digest),
    ).toBe(false);
    expect(tokens.verifyDigest(new Uint8Array(8), link.digest)).toBe(false);
  });

  it('issues unique opaque 256-bit session identifiers', () => {
    const tokens = createOpaqueTokenService(secret);
    const first = tokens.issueSessionToken();
    const second = tokens.issueSessionToken();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(Buffer.from(first.rawToken, 'base64url')).toHaveLength(32);
    expect(first.digest).toHaveLength(32);
  });
});

describe('management session cookie', () => {
  it('is server-only, API-scoped, lax, domainless, and secure only in production', () => {
    expect(MANAGEMENT_SESSION_COOKIE_NAME).toBe('takeover_management');
    expect(managementSessionCookieOptions('development')).toEqual({
      httpOnly: true,
      path: '/api',
      sameSite: 'lax',
      secure: false,
    });
    expect(managementSessionCookieOptions('production')).toEqual({
      httpOnly: true,
      path: '/api',
      sameSite: 'lax',
      secure: true,
    });
    expect(managementSessionCookieOptions('production')).not.toHaveProperty('domain');
  });
});

describe('trusted mutation origin', () => {
  it('accepts only the configured exact origin', () => {
    expect(() =>
      assertTrustedMutationOrigin('https://takeover.com', 'https://takeover.com'),
    ).not.toThrow();
    expect(() => assertTrustedMutationOrigin(undefined, 'https://takeover.com')).toThrow('origin');
    expect(() =>
      assertTrustedMutationOrigin('https://evil.example', 'https://takeover.com'),
    ).toThrow('origin');
  });
});
