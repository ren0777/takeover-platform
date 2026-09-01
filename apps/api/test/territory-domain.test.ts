import { describe, expect, it } from 'vitest';
import {
  assertPublicCompany,
  deriveTerritoryStatus,
  OwnershipConflictError,
  serializeTerritoryVersion,
  StaleTerritoryVersionError,
  TERRITORY_HISTORY_PREVIEW_LIMIT,
  TerritoryDataIntegrityError,
  TerritoryDisabledError,
} from '../src/modules/territories/domain.js';

const publicCompanyRecord = {
  id: '8d2e49f3-0c1f-4b3d-9ea3-8cbe68cf9e68',
  logoUrl: 'https://example.com/logo.png',
  name: 'Suspended but truthful Ltd',
  slug: 'suspended-but-truthful',
  status: 'SUSPENDED' as const,
  verifications: [
    { level: 'CONTACT_VERIFIED' as const, status: 'VERIFIED' as const },
    { level: 'DOMAIN_VERIFIED' as const, status: 'REVOKED' as const },
    { level: 'MANUALLY_VERIFIED' as const, status: 'PENDING' as const },
  ],
  websiteUrl: 'https://example.com',
};

const poisonedPublicCompanyRecord = {
  ...publicCompanyRecord,
  contactEmail: 'private-contact@example.com',
  managementGrants: [{ id: 'private-grant-id' }],
  managementSessions: [{ id: 'private-session-id' }],
  verifications: [
    {
      evidence: { contactEmail: 'private-contact@example.com' },
      level: 'CONTACT_VERIFIED' as const,
      status: 'VERIFIED' as const,
    },
  ],
};

describe('deriveTerritoryStatus', () => {
  it('derives an active territory without an owner as unclaimed', () => {
    expect(deriveTerritoryStatus('ACTIVE', false)).toBe('unclaimed');
  });

  it('derives an active territory with an owner as claimed', () => {
    expect(deriveTerritoryStatus('ACTIVE', true)).toBe('claimed');
  });

  it('reports a disabled territory as disabled whether or not it retains an owner', () => {
    expect(deriveTerritoryStatus('DISABLED', false)).toBe('disabled');
    expect(deriveTerritoryStatus('DISABLED', true)).toBe('disabled');
  });
});

describe('assertPublicCompany', () => {
  it('preserves a suspended owner truthfully and allows only public verified data', () => {
    expect(assertPublicCompany(publicCompanyRecord)).toEqual({
      id: '8d2e49f3-0c1f-4b3d-9ea3-8cbe68cf9e68',
      logoUrl: 'https://example.com/logo.png',
      name: 'Suspended but truthful Ltd',
      slug: 'suspended-but-truthful',
      status: 'suspended',
      verificationLevels: ['contact_verified'],
      websiteUrl: 'https://example.com',
    });
  });

  it('preserves an archived owner truthfully', () => {
    expect(
      assertPublicCompany({
        ...publicCompanyRecord,
        status: 'ARCHIVED',
      }),
    ).toEqual({
      id: '8d2e49f3-0c1f-4b3d-9ea3-8cbe68cf9e68',
      logoUrl: 'https://example.com/logo.png',
      name: 'Suspended but truthful Ltd',
      slug: 'suspended-but-truthful',
      status: 'archived',
      verificationLevels: ['contact_verified'],
      websiteUrl: 'https://example.com',
    });
  });

  it('discards injected private company, authority, and verification-evidence fields', () => {
    expect(assertPublicCompany(poisonedPublicCompanyRecord)).toEqual({
      id: '8d2e49f3-0c1f-4b3d-9ea3-8cbe68cf9e68',
      logoUrl: 'https://example.com/logo.png',
      name: 'Suspended but truthful Ltd',
      slug: 'suspended-but-truthful',
      status: 'suspended',
      verificationLevels: ['contact_verified'],
      websiteUrl: 'https://example.com',
    });
  });

  it('rejects a draft owner with a public-looking slug instead of leaking it', () => {
    expect(() =>
      assertPublicCompany({
        ...publicCompanyRecord,
        slug: 'draft-company',
        status: 'DRAFT',
      }),
    ).toThrow(TerritoryDataIntegrityError);
  });

  it.each(['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const)(
    'rejects a %s owner with no public slug',
    (status) => {
      expect(() =>
        assertPublicCompany({
          ...publicCompanyRecord,
          slug: null,
          status,
        }),
      ).toThrow(TerritoryDataIntegrityError);
    },
  );
});

describe('serializeTerritoryVersion', () => {
  it('serializes arbitrary positive bigint versions as decimal strings', () => {
    expect(serializeTerritoryVersion(9_007_199_254_740_993n)).toBe('9007199254740993');
  });

  it('rejects non-positive territory versions', () => {
    expect(() => serializeTerritoryVersion(0n)).toThrow(TerritoryDataIntegrityError);
  });
});

it('exposes stable domain errors for later ownership transitions', () => {
  expect(new TerritoryDataIntegrityError('test integrity error').code).toBe(
    'OWNERSHIP_HISTORY_INVALID',
  );
  expect(new StaleTerritoryVersionError().code).toBe('STALE_TERRITORY_VERSION');
  expect(new TerritoryDisabledError().code).toBe('TERRITORY_DISABLED');
  expect(new OwnershipConflictError().code).toBe('OWNERSHIP_CONFLICT');
});

it('uses one five-entry history-preview limit and has no contested public state', () => {
  expect(TERRITORY_HISTORY_PREVIEW_LIMIT).toBe(5);
  const allPublicStates = [
    deriveTerritoryStatus('ACTIVE', false),
    deriveTerritoryStatus('ACTIVE', true),
    deriveTerritoryStatus('DISABLED', false),
    deriveTerritoryStatus('DISABLED', true),
  ];

  expect(allPublicStates).not.toContain('contested' as never);
});
