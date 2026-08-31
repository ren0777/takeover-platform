/**
 * Absolute timestamp formatting, fixed to UTC and a single locale.
 *
 * `toLocaleString()` varies by machine and by whether it runs on the server or
 * in the browser, which makes expiry copy untestable and risks a hydration
 * mismatch. Expiry times are security-relevant, so they render identically
 * everywhere and always name their zone.
 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const PLACEHOLDER = '—';

function isValid(iso: string): boolean {
  return iso.length > 0 && !Number.isNaN(Date.parse(iso));
}

/** e.g. `30 Aug 2026, 14:05 UTC`. */
export function formatAbsoluteDateTime(iso: string): string {
  if (!isValid(iso)) return PLACEHOLDER;
  return `${DATE_TIME_FORMAT.format(new Date(iso))} UTC`;
}

/** e.g. `30 Aug 2026`, using the UTC calendar day. */
export function formatAbsoluteDate(iso: string): string {
  if (!isValid(iso)) return PLACEHOLDER;
  return DATE_FORMAT.format(new Date(iso));
}
