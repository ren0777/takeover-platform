import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@takeover/shared';
import { describeQuoteError } from '../src/lib/takeover/quote-error.js';
import { describeIdentityError } from '../src/lib/identity/error-copy.js';

describe('claimed-territory pricing copy', () => {
  it('tells the person pricing is unavailable, not that the territory is gone, and that nothing was charged', () => {
    for (const copy of [
      describeQuoteError(ERROR_CODES.CLAIMED_TERRITORY_PRICING_NOT_CONFIGURED),
      describeIdentityError(ERROR_CODES.CLAIMED_TERRITORY_PRICING_NOT_CONFIGURED),
    ]) {
      expect(copy.title.toLowerCase()).toContain('pricing');
      expect(copy.message.toLowerCase()).toContain('claimed');
      expect(copy.message.toLowerCase()).not.toContain('does not exist');
      expect(copy.message.toLowerCase()).toContain('nothing was charged');
      expect(copy.canRetry).toBe(false);
    }
  });
});
