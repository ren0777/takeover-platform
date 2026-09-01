import type { CompanyPublicSummary } from '@takeover/shared';

export const TERRITORY_HISTORY_PREVIEW_LIMIT = 5;

type TerritoryAvailability = 'ACTIVE' | 'DISABLED';
type CompanyStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'REVOKED';
type VerificationLevel = 'CONTACT_VERIFIED' | 'DOMAIN_VERIFIED' | 'MANUALLY_VERIFIED';

export type PublicCompanyRecord = {
  id: string;
  logoUrl: string | null;
  name: string;
  slug: string | null;
  status: CompanyStatus;
  verifications: ReadonlyArray<{
    level: VerificationLevel;
    status: VerificationStatus;
  }>;
  websiteUrl: string;
};

export class TerritoryDataIntegrityError extends Error {
  readonly code = 'OWNERSHIP_HISTORY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'TerritoryDataIntegrityError';
  }
}

export class StaleTerritoryVersionError extends Error {
  readonly code = 'STALE_TERRITORY_VERSION';

  constructor() {
    super('Territory version is stale');
    this.name = 'StaleTerritoryVersionError';
  }
}

export class TerritoryDisabledError extends Error {
  readonly code = 'TERRITORY_DISABLED';

  constructor() {
    super('Territory is disabled');
    this.name = 'TerritoryDisabledError';
  }
}

export class OwnershipConflictError extends Error {
  readonly code = 'OWNERSHIP_CONFLICT';

  constructor() {
    super('Territory ownership conflicts with authoritative history');
    this.name = 'OwnershipConflictError';
  }
}

export function deriveTerritoryStatus(
  availability: TerritoryAvailability,
  hasActiveOwnership: boolean,
): 'unclaimed' | 'claimed' | 'disabled' {
  if (availability === 'DISABLED') return 'disabled';
  return hasActiveOwnership ? 'claimed' : 'unclaimed';
}

export function assertPublicCompany(record: PublicCompanyRecord): CompanyPublicSummary {
  if (record.status === 'DRAFT' || record.slug === null) {
    throw new TerritoryDataIntegrityError('Draft company cannot appear in public territory data');
  }

  return {
    id: record.id,
    ...(record.logoUrl === null ? {} : { logoUrl: record.logoUrl }),
    name: record.name,
    slug: record.slug,
    status: record.status.toLowerCase() as CompanyPublicSummary['status'],
    verificationLevels: record.verifications
      .filter((verification) => verification.status === 'VERIFIED')
      .map(
        (verification) =>
          verification.level.toLowerCase() as CompanyPublicSummary['verificationLevels'][number],
      ),
    websiteUrl: record.websiteUrl,
  };
}

export function serializeTerritoryVersion(version: bigint): string {
  if (version <= 0n) throw new TerritoryDataIntegrityError('Invalid territory version');
  return version.toString(10);
}
