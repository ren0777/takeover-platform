import { ERROR_CODES } from '../src/api.js';
import { describe, it, expect } from 'vitest';

describe('Error codes', () => {
  it('TAKEOVER_PRICE_CHANGED is distinct from STALE_TERRITORY_VERSION', () => {
    expect(ERROR_CODES.TAKEOVER_PRICE_CHANGED).not.toBe(ERROR_CODES.STALE_TERRITORY_VERSION);
  });
});

describe('pricing error codes', () => {
  it('names an unconfigured price distinctly from a changed price', () => {
    expect(ERROR_CODES.PRICING_NOT_CONFIGURED).toBe('PRICING_NOT_CONFIGURED');
    expect(ERROR_CODES.PRICING_NOT_CONFIGURED).not.toBe(ERROR_CODES.TAKEOVER_PRICE_CHANGED);
  });
});
