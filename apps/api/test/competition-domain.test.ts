import { describe, expect, it } from 'vitest';
import { rankHoldings } from '../src/modules/competition/domain.js';

describe('V1 scoring', () => {
  it('awards territory points and category diversity once per company', () => {
    const company = { companyId: 'a', companyName: 'A', companySlug: 'a' };
    expect(rankHoldings([{ ...company, categoryId: 'x' }, { ...company, categoryId: 'x' }, { ...company, categoryId: 'y' }]))
      .toEqual([{ ...company, rank: 1, territories: 3, categories: 2, score: 350 }]);
  });
  it('makes ties independent of database row ordering', () => {
    const holdings = ['z', 'a'].map((id) => ({ companyId: id, companyName: id, companySlug: id, categoryId: 'x' }));
    expect(rankHoldings(holdings).map((company) => company.companyId)).toEqual(['a', 'z']);
    expect(rankHoldings(holdings)).toEqual(rankHoldings([...holdings].reverse()));
    expect(rankHoldings([])).toEqual([]);
  });
});
