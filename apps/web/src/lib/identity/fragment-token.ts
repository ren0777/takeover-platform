/** Matches `emailTokenExchangeRequestSchema` in `@takeover/shared`. */
const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 1024;

/**
 * Reads a raw email token from a URL fragment.
 *
 * Codex sends links as `${origin}/verify#token=<urlencoded>`. The fragment is
 * deliberate: browsers never transmit it to a server, so the secret stays out of
 * request lines, access logs, and referrers. A token supplied in the query
 * string is rejected rather than accepted, because that placement would already
 * have leaked it.
 *
 * Callers must scrub the fragment immediately after reading.
 */
export function readFragmentToken(fragment: string): string | null {
  if (fragment.length === 0) return null;

  const withoutHash = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (withoutHash.length === 0) return null;

  // A query string is not a fragment; refuse it so query placement never works.
  if (withoutHash.startsWith('?')) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(withoutHash);
  } catch {
    return null;
  }

  let token: string | null;
  try {
    // URLSearchParams decodes lazily and throws on malformed percent-encoding.
    token = params.get('token');
  } catch {
    return null;
  }

  if (token === null) return null;
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return null;

  return token;
}
