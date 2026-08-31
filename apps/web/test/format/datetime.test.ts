import { describe, expect, it } from 'vitest';
import { formatAbsoluteDate, formatAbsoluteDateTime } from '../../src/lib/format/datetime.js';

// Deliberately locale- and timezone-independent. `toLocaleString()` varies by
// machine, which makes expiry text untestable and risks server/client mismatch.
describe('formatAbsoluteDateTime', () => {
  it('renders a UTC timestamp deterministically', () => {
    expect(formatAbsoluteDateTime('2026-08-30T14:05:00.000Z')).toBe('30 Aug 2026, 14:05 UTC');
  });

  it('normalizes a non-UTC offset to UTC', () => {
    expect(formatAbsoluteDateTime('2026-08-30T16:05:00.000+02:00')).toBe('30 Aug 2026, 14:05 UTC');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatAbsoluteDateTime('2026-01-05T04:07:00.000Z')).toBe('5 Jan 2026, 04:07 UTC');
  });

  it('returns a neutral placeholder for an unparseable value', () => {
    expect(formatAbsoluteDateTime('not-a-date')).toBe('—');
    expect(formatAbsoluteDateTime('')).toBe('—');
  });
});

describe('formatAbsoluteDate', () => {
  it('renders a date without a time', () => {
    expect(formatAbsoluteDate('2026-08-30T14:05:00.000Z')).toBe('30 Aug 2026');
  });

  it('uses the UTC calendar day rather than the local one', () => {
    // 23:30Z is already the next day in some local zones; UTC must win.
    expect(formatAbsoluteDate('2026-08-30T23:30:00.000Z')).toBe('30 Aug 2026');
  });

  it('returns a neutral placeholder for an unparseable value', () => {
    expect(formatAbsoluteDate('nope')).toBe('—');
  });
});
