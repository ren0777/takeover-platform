import {
  companyTerritoriesSchema,
  type CompanyPublicSummary,
  type CompanyTerritories,
} from '@takeover/shared';
import { ApiRequestError } from '@/lib/api/client';
import { fetchCompanyTerritories, fetchPublicCompany } from '@/lib/api/territories';
import { resolveSource } from '@/lib/data/source';

async function fixtures() {
  return import('@/lib/fixtures/territories');
}

/** The public company record on its own, without holdings. */
export async function getPublicCompany(slug: string): Promise<CompanyPublicSummary | null> {
  if (resolveSource('public-company') === 'live') {
    try {
      return await fetchPublicCompany(slug);
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  }

  const { COMPANY_FIXTURES } = await fixtures();
  return COMPANY_FIXTURES.find((company) => company.slug === slug) ?? null;
}

export async function getCompanyTerritories(slug: string): Promise<CompanyTerritories | null> {
  if (resolveSource('company-territories') === 'live') {
    try {
      return await fetchCompanyTerritories(slug);
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  }

  const { COMPANY_FIXTURES, TERRITORY_FIXTURES } = await fixtures();

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
