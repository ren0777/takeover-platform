import { describe, expect, it } from 'vitest';
import { publicShareUrl } from '../src/lib/share.js';

describe('public share URLs', () => {
  it('shares only the canonical public path', () => {
    expect(publicShareUrl('https://takeover.example', '/territory/ai-tools')).toBe('https://takeover.example/territory/ai-tools');
  });
  it('rejects private capability paths, query strings and external links', () => {
    for (const path of ['/takeover/secret', '/manage#token=secret', '/company/acme?secret=token', '//attacker.example']) {
      expect(() => publicShareUrl('https://takeover.example', path)).toThrow();
    }
  });
});
