const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/;
const LONG_HEX = /^#[0-9a-f]{6}$/;

/**
 * Validates an externally supplied brand colour before it reaches the DOM.
 *
 * Owner accents are decorative only, so anything unrecognized degrades to null
 * and the caller falls back to a neutral token. Only three- and six-digit hex
 * are accepted: functional notation, named colours, and eight-digit hex with an
 * alpha channel are all rejected, the last so transparency cannot quietly
 * undermine contrast.
 */
export function sanitizeAccentColor(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const candidate = value.trim().toLowerCase();
  if (candidate.length === 0) return null;

  if (LONG_HEX.test(candidate)) return candidate;

  const short = SHORT_HEX.exec(candidate);
  if (short !== null) {
    const [, r, g, b] = short;
    // Guarded for noUncheckedIndexedAccess; a match always yields three groups.
    if (r === undefined || g === undefined || b === undefined) return null;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
}
