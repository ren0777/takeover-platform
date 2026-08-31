import { describe, expect, it } from 'vitest';
import { orderForMosaic, tierForDisplayWeight } from '../../src/lib/board/tiers.js';

describe('tierForDisplayWeight', () => {
  it('maps the top band to flagship', () => {
    expect(tierForDisplayWeight(100)).toBe('flagship');
    expect(tierForDisplayWeight(80)).toBe('flagship');
  });

  it('maps the middle band to major', () => {
    expect(tierForDisplayWeight(79)).toBe('major');
    expect(tierForDisplayWeight(50)).toBe('major');
  });

  it('maps the lower band to standard', () => {
    expect(tierForDisplayWeight(49)).toBe('standard');
    expect(tierForDisplayWeight(1)).toBe('standard');
  });

  it('clamps values outside the authoritative 1..100 range', () => {
    expect(tierForDisplayWeight(0)).toBe('standard');
    expect(tierForDisplayWeight(1000)).toBe('flagship');
  });
});

describe('orderForMosaic', () => {
  const t = (slug: string, displayWeight: number) => ({ slug, displayWeight });

  it('orders by display weight descending', () => {
    const ordered = orderForMosaic([t('low', 10), t('high', 90), t('mid', 50)]);
    expect(ordered.map((entry) => entry.slug)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks ties by slug so server and client agree', () => {
    const ordered = orderForMosaic([t('zebra', 50), t('alpha', 50)]);
    expect(ordered.map((entry) => entry.slug)).toEqual(['alpha', 'zebra']);
  });

  it('does not mutate the input', () => {
    const input = [t('a', 1), t('b', 99)];
    orderForMosaic(input);
    expect(input.map((entry) => entry.slug)).toEqual(['a', 'b']);
  });

  it('returns an empty array unchanged', () => {
    expect(orderForMosaic([])).toEqual([]);
  });
});
