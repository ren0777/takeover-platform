import { describe, expect, it } from 'vitest';
import { rankHoldings } from './domain.js';

describe('authoritative competition scoring', () => {
  it('counts each category once and breaks equal scores by company ID', () => {
    const rows = rankHoldings([
      { companyId: 'b', companyName: 'B', companySlug: 'b', categoryId: 'x' },
      { companyId: 'a', companyName: 'A', companySlug: 'a', categoryId: 'x' },
      { companyId: 'c', companyName: 'C', companySlug: 'c', categoryId: 'x' },
      { companyId: 'c', companyName: 'C', companySlug: 'c', categoryId: 'x' },
    ]);
    expect(rows.map(({ companyId, score, rank }) => ({ companyId, score, rank }))).toEqual([
      { companyId: 'c', score: 225, rank: 1 },
      { companyId: 'a', score: 125, rank: 2 },
      { companyId: 'b', score: 125, rank: 3 },
    ]);
  });
  it('returns no invented competitors on an empty board', () =>
    expect(rankHoldings([])).toEqual([]));
});
