import { ERROR_CODES } from '../src/api.js';
import { describe, it, expect } from 'vitest';

describe('Error codes', () => {
  it('TAKEOVER_PRICE_CHANGED is distinct from STALE_TERRITORY_VERSION', () => {
    expect(ERROR_CODES.TAKEOVER_PRICE_CHANGED).not.toBe(ERROR_CODES.STALE_TERRITORY_VERSION);
  });
});
