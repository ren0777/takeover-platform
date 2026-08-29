import { describe, expect, it } from 'vitest';
import { formatReign } from '../../src/lib/format/duration.js';

const start = '2026-08-29T00:00:00.000Z';
const startMs = Date.parse(start);

describe('formatReign', () => {
  it('renders minutes under an hour', () => {
    expect(formatReign(start, startMs + 42 * 60_000)).toBe('42m');
  });

  it('renders hours and minutes under a day', () => {
    expect(formatReign(start, startMs + 8 * 3_600_000 + 42 * 60_000)).toBe('08h 42m');
  });

  it('renders days and hours beyond a day', () => {
    expect(formatReign(start, startMs + 3 * 86_400_000 + 8 * 3_600_000)).toBe('3d 8h');
  });

  it('clamps a future start to zero rather than rendering negative time', () => {
    expect(formatReign(start, startMs - 60_000)).toBe('0m');
  });

  it('returns a neutral placeholder for an unparseable timestamp', () => {
    expect(formatReign('not-a-date', startMs)).toBe('—');
  });
});
