import { describe, expect, it } from 'vitest';
import {
  assertAccessRequestTransition,
  hasExpired,
  normalizeCompanyName,
  normalizeCompanyWebsite,
  normalizeContactEmail,
  unavailableManualRecoveryOperator,
  validateTerritoryExternalRef,
} from '../src/modules/company-identity/domain.js';
import { assertCompanyAuthority } from '../src/modules/company-identity/authorization.js';

describe('company identity normalization', () => {
  it('keeps manual recovery execution explicitly unavailable without an operator identity', async () => {
    await expect(
      unavailableManualRecoveryOperator.resolve('recovery-request'),
    ).rejects.toMatchObject({ code: 'MANUAL_RECOVERY_UNAVAILABLE', statusCode: 503 });
  });

  it('normalizes a public HTTPS website without collapsing meaningful paths', () => {
    expect(normalizeCompanyWebsite('https://Example.COM:443/Launch/Page/')).toBe(
      'https://example.com/Launch/Page',
    );
    expect(normalizeCompanyWebsite('https://example.com/')).toBe('https://example.com/');
  });

  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://localhost',
    'https://startup.local',
    'https://127.0.0.1',
    'https://10.0.0.4',
    'https://169.254.1.2',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'https://[::ffff:0:127.0.0.1]',
    'https://[64:ff9b::127.0.0.1]',
    'https://[::127.0.0.1]',
    'https://[100::1]',
    'https://[2001:1::1]',
    'https://[2001:11::1]',
    'https://[2001:21::1]',
    'https://example.com/path?claim=true',
    'https://example.com/#claim',
  ])('rejects a non-public or ambiguous website: %s', (website) => {
    expect(() => normalizeCompanyWebsite(website)).toThrow();
  });

  it('accepts a global-unicast IPv6 website literal', () => {
    expect(normalizeCompanyWebsite('https://[2606:4700:4700::1111]/')).toBe(
      'https://[2606:4700:4700::1111]/',
    );
    expect(normalizeCompanyWebsite('https://[2001:4860:4860::8888]/')).toBe(
      'https://[2001:4860:4860::8888]/',
    );
  });

  it('allows a personal contact email and preserves its local part', () => {
    expect(normalizeContactEmail(' Founder+Launch@GMAIL.COM ')).toBe('Founder+Launch@gmail.com');
  });

  it('normalizes names for comparison without losing the display form', () => {
    expect(normalizeCompanyName('  My   Cool\u00a0Startup  ')).toEqual({
      displayName: 'My Cool Startup',
      normalizedName: 'my cool startup',
    });
  });

  it.each(['../territory', '', 'space here', ':starts-wrong'])(
    'rejects bad territory refs',
    (ref) => {
      expect(() => validateTerritoryExternalRef(ref)).toThrow();
    },
  );
});

describe('company access state rules', () => {
  it.each(['approved', 'rejected', 'expired', 'cancelled'] as const)(
    'allows pending to transition to %s',
    (next) => expect(() => assertAccessRequestTransition('pending', next)).not.toThrow(),
  );

  it.each(['approved', 'rejected', 'expired', 'cancelled'] as const)(
    'denies transitions from terminal state %s',
    (current) => expect(() => assertAccessRequestTransition(current, 'approved')).toThrow(),
  );

  it('treats exact draft/access/recovery expiry as expired', () => {
    const now = new Date('2026-08-30T12:00:00.000Z');
    expect(hasExpired(new Date('2026-08-30T12:00:00.000Z'), now)).toBe(true);
    expect(hasExpired(new Date('2026-08-30T12:00:00.001Z'), now)).toBe(false);
  });

  it('denies Company A authority for Company B', () => {
    const authority = {
      companyId: '11111111-1111-4111-8111-111111111111',
      grantId: '22222222-2222-4222-8222-222222222222',
      sessionId: '33333333-3333-4333-8333-333333333333',
    };
    expect(() => assertCompanyAuthority(authority, authority.companyId)).not.toThrow();
    expect(() => assertCompanyAuthority(authority, '44444444-4444-4444-8444-444444444444')).toThrow(
      'company',
    );
  });
});
