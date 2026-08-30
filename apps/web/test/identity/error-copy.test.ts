import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@takeover/shared';
import { describeIdentityError } from '../../src/lib/identity/error-copy.js';

describe('describeIdentityError', () => {
  it('explains an invalid or expired token without hinting which it was', () => {
    const copy = describeIdentityError(ERROR_CODES.INVALID_OR_EXPIRED_TOKEN);
    expect(copy.title).toBe('This link is no longer usable');
    expect(copy.canRetry).toBe(true);
    // Single-use links are consumed on first exchange; never say which failure occurred.
    expect(copy.message).not.toMatch(/expired|already used/i);
  });

  it('describes a pending access request as pending, not as failure', () => {
    const copy = describeIdentityError(ERROR_CODES.COMPANY_ACCESS_PENDING);
    expect(copy.message).toMatch(/manager/i);
    expect(copy.message).not.toMatch(/error|failed/i);
  });

  it('never claims recovery will be actioned', () => {
    const copy = describeIdentityError(ERROR_CODES.MANUAL_RECOVERY_UNAVAILABLE);
    expect(copy.message).not.toMatch(/will be (reviewed|approved|actioned)/i);
  });

  it('surfaces rate limiting as temporary and retryable', () => {
    const copy = describeIdentityError(ERROR_CODES.RATE_LIMITED);
    expect(copy.canRetry).toBe(true);
  });

  it('does not offer retry for a denied access decision', () => {
    expect(describeIdentityError(ERROR_CODES.COMPANY_ACCESS_DENIED).canRetry).toBe(false);
  });

  it('does not offer retry for an already-claimed website', () => {
    expect(describeIdentityError(ERROR_CODES.COMPANY_WEBSITE_CLAIMED).canRetry).toBe(false);
  });

  it('falls back safely for an unrecognized code', () => {
    const copy = describeIdentityError('SOMETHING_NEW');
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.message.length).toBeGreaterThan(0);
  });

  it('covers every published error code', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const copy = describeIdentityError(code);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
    }
  });

  it('never promises success for any code', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const copy = describeIdentityError(code);
      expect(`${copy.title} ${copy.message}`).not.toMatch(
        /verified successfully|payment (succeeded|complete)|you now own/i,
      );
    }
  });
});
