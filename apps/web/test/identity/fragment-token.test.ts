import { describe, expect, it } from 'vitest';
import { readFragmentToken } from '../../src/lib/identity/fragment-token.js';

// Codex emails links as `${origin}/verify#token=<urlencoded>`. The token must be
// read from the fragment, which browsers never send to a server.
describe('readFragmentToken', () => {
  const valid = 'a'.repeat(32);

  it('reads a token from the fragment', () => {
    expect(readFragmentToken(`#token=${valid}`)).toBe(valid);
  });

  it('tolerates a fragment without the leading hash', () => {
    expect(readFragmentToken(`token=${valid}`)).toBe(valid);
  });

  it('decodes percent-encoded token material', () => {
    const raw = `${'b'.repeat(20)}.${'c'.repeat(20)}`;
    expect(readFragmentToken(`#token=${encodeURIComponent(raw)}`)).toBe(raw);
  });

  it('finds the token among other fragment parameters', () => {
    expect(readFragmentToken(`#state=xyz&token=${valid}`)).toBe(valid);
  });

  it('returns null when the fragment is empty', () => {
    expect(readFragmentToken('')).toBeNull();
    expect(readFragmentToken('#')).toBeNull();
  });

  it('returns null when no token parameter is present', () => {
    expect(readFragmentToken('#state=xyz')).toBeNull();
  });

  it('returns null for a token shorter than the contract minimum', () => {
    expect(readFragmentToken('#token=tooshort')).toBeNull();
  });

  it('returns null for a token longer than the contract maximum', () => {
    expect(readFragmentToken(`#token=${'d'.repeat(1025)}`)).toBeNull();
  });

  it('returns null for a malformed percent-encoded fragment', () => {
    expect(readFragmentToken('#token=%E0%A4%A')).toBeNull();
  });

  it('ignores a token supplied in the query string, which servers would log', () => {
    expect(readFragmentToken('?token=' + valid)).toBeNull();
  });
});
