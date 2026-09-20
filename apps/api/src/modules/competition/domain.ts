import { COMPETITION_RULES, type CompetitionStanding } from '@takeover/shared';

export type Holding = {
  companyId: string;
  companyName: string;
  companySlug: string | null;
  categoryId: string;
};
export function rankHoldings(holdings: Holding[]): CompetitionStanding[] {
  const companies = new Map<string, { row: CompetitionStanding; categories: Set<string> }>();
  for (const holding of holdings) {
    let entry = companies.get(holding.companyId);
    if (!entry) {
      entry = {
        row: {
          companyId: holding.companyId,
          companyName: holding.companyName,
          companySlug: holding.companySlug,
          territories: 0,
          categories: 0,
          score: 0,
          rank: 0,
        },
        categories: new Set(),
      };
      companies.set(holding.companyId, entry);
    }
    entry.row.territories++;
    entry.categories.add(holding.categoryId);
  }
  return [...companies.values()]
    .map(({ row, categories }) => ({
      ...row,
      categories: categories.size,
      score:
        row.territories * COMPETITION_RULES.territoryPoints +
        categories.size * COMPETITION_RULES.categoryPoints,
    }))
    .sort(
      (a, b) =>
        b.score - a.score || (a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
