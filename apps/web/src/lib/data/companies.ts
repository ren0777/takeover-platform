import { companyTerritoriesSchema, type CompanyTerritories } from '@takeover/shared';
import { COMPANY_FIXTURES, TERRITORY_FIXTURES } from '@/lib/fixtures/territories';
import { resolveSource } from '@/lib/data/source';

export async function getCompanyTerritories(slug: string): Promise<CompanyTerritories | null> {
  if (resolveSource('company-territories') !== 'fixture') {
    throw new Error('Live company territories source is not implemented yet');
  }

  const company = COMPANY_FIXTURES.find((entry) => entry.slug === slug);
  if (company === undefined) return null;

  const territories = TERRITORY_FIXTURES.filter(
    (territory) => territory.currentOwnership?.owner.slug === slug,
  );

  return companyTerritoriesSchema.parse({
    company,
    currentTerritoryCount: territories.length,
    territories,
  });
}
