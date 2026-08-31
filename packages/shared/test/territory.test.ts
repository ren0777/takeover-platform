import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  OWNERSHIP_SOURCES,
  TERRITORY_AVAILABILITY_STATUSES,
  TERRITORY_PUBLIC_STATUSES,
  companyPublicSummarySchema,
  ownershipSourceSchema,
  territoryDetailSchema,
  territoryListQuerySchema,
  territoryPageSchema,
  territoryStatusSchema,
  territorySummarySchema,
  territoryVersionSchema,
} from '../src/index.js';

const CATEGORY_ID = '20000000-0000-4000-8000-000000000001';
const TERRITORY_ID = '21000000-0000-4000-8000-000000000001';
const OWNERSHIP_ID = '22000000-0000-4000-8000-000000000001';
const COMPANY_ID = '23000000-0000-4000-8000-000000000001';
const PREVIOUS_COMPANY_ID = '23000000-0000-4000-8000-000000000002';
const TIMESTAMP = '2026-08-30T00:00:00.000Z';

const category = {
  id: CATEGORY_ID,
  slug: 'ai',
  name: 'AI',
  description: 'Products building with artificial intelligence.',
};

const company = {
  id: COMPANY_ID,
  slug: 'acme',
  name: 'Acme',
  websiteUrl: 'https://acme.example/',
  status: 'active',
  verificationLevels: ['contact_verified'],
};

const previousOwner = {
  id: PREVIOUS_COMPANY_ID,
  slug: 'previous',
  name: 'Previous',
  websiteUrl: 'https://previous.example/',
  logoUrl: 'https://previous.example/logo.png',
  status: 'active',
  verificationLevels: ['contact_verified'],
};

function claimedTerritory() {
  return {
    id: TERRITORY_ID,
    slug: 'ai-coding',
    name: 'AI Coding',
    description: 'AI-assisted software creation.',
    category,
    displayWeight: 100,
    status: 'claimed',
    visualMetadata: { iconKey: 'code-2', accentColor: '#A78BFA' },
    version: '2',
    currentOwnership: {
      id: OWNERSHIP_ID,
      owner: { ...company, status: 'suspended' },
      previousOwner,
      capturedAt: TIMESTAMP,
      territoryVersion: '2',
      source: 'paid_capture',
    },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

describe('territory contracts', () => {
  it('accepts a claimed territory with suspended and previous public owners', () => {
    expect(territorySummarySchema.parse(claimedTerritory())).toMatchObject({
      displayWeight: 100,
      status: 'claimed',
      version: '2',
      currentOwnership: {
        owner: { status: 'suspended' },
        previousOwner: { logoUrl: 'https://previous.example/logo.png' },
      },
    });
  });

  it('accepts a five-entry-compatible ownership history and cursor metadata', () => {
    const historyEntry = {
      id: OWNERSHIP_ID,
      owner: company,
      previousOwner,
      capturedAt: TIMESTAMP,
      endedAt: '2026-08-31T00:00:00.000Z',
      territoryVersion: '2',
      source: 'paid_capture',
    };

    expect(
      territoryDetailSchema.parse({
        ...claimedTerritory(),
        ownershipHistoryPreview: Array.from({ length: 5 }, () => historyEntry),
      }).ownershipHistoryPreview,
    ).toHaveLength(5);
    expect(
      territoryPageSchema.parse({
        data: [claimedTerritory()],
        meta: { limit: 50, nextCursor: 'opaque-cursor' },
      }),
    ).toMatchObject({ meta: { limit: 50, nextCursor: 'opaque-cursor' } });
  });

  it('accepts bounded category and public-status query filters', () => {
    expect(territoryListQuerySchema.parse({ category: 'ai', status: 'claimed' })).toEqual({
      category: 'ai',
      limit: 50,
      status: 'claimed',
    });
    expect(territoryListQuerySchema.parse({ cursor: 'opaque', limit: '100' })).toEqual({
      cursor: 'opaque',
      limit: 100,
    });
  });

  it('publishes only the approved territory vocabularies', () => {
    expect(TERRITORY_PUBLIC_STATUSES).toEqual(['unclaimed', 'claimed', 'disabled']);
    expect(TERRITORY_AVAILABILITY_STATUSES).toEqual(['active', 'disabled']);
    expect(OWNERSHIP_SOURCES).toEqual(['initial_seed', 'paid_capture']);
    expect(() => territoryStatusSchema.parse('contested')).toThrow();
    expect(() => ownershipSourceSchema.parse('controlled_correction')).toThrow();
  });

  it('publishes stable territory error codes', () => {
    expect(ERROR_CODES).toMatchObject({
      TERRITORY_NOT_FOUND: 'TERRITORY_NOT_FOUND',
      TERRITORY_CATEGORY_NOT_FOUND: 'TERRITORY_CATEGORY_NOT_FOUND',
      INVALID_CURSOR: 'INVALID_CURSOR',
      STALE_TERRITORY_VERSION: 'STALE_TERRITORY_VERSION',
      TERRITORY_DISABLED: 'TERRITORY_DISABLED',
      OWNERSHIP_CONFLICT: 'OWNERSHIP_CONFLICT',
      OWNERSHIP_HISTORY_INVALID: 'OWNERSHIP_HISTORY_INVALID',
    });
  });

  it.each([0, 101, 50.5])('rejects an invalid display weight of %s', (displayWeight) => {
    expect(() => territorySummarySchema.parse({ ...claimedTerritory(), displayWeight })).toThrow();
  });

  it('rejects unsafe and non-public territory values', () => {
    expect(() => territoryVersionSchema.parse(2)).toThrow();
    expect(() => territorySummarySchema.parse({ ...claimedTerritory(), version: '0' })).toThrow();
    expect(() =>
      territorySummarySchema.parse({
        ...claimedTerritory(),
        slug: 'AI Coding',
      }),
    ).toThrow();
    expect(() =>
      territorySummarySchema.parse({
        ...claimedTerritory(),
        visualMetadata: { iconKey: 'code-2', accentColor: '#abc' },
      }),
    ).toThrow();
    expect(() =>
      territorySummarySchema.parse({
        ...claimedTerritory(),
        visualMetadata: { iconKey: 'code-2', unknown: 'value' },
      }),
    ).toThrow();
    expect(() =>
      territorySummarySchema.parse({
        ...claimedTerritory(),
        visualMetadata: { imageUrl: 'http://images.example/territory.png' },
      }),
    ).toThrow();
    expect(() =>
      territorySummarySchema.parse({ ...claimedTerritory(), createdAt: 'tomorrow' }),
    ).toThrow();
    expect(() =>
      companyPublicSummarySchema.parse({ ...company, contactEmail: 'private@example.com' }),
    ).toThrow();
  });
});
