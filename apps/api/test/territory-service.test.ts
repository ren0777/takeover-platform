import { describe, expect, it } from 'vitest';
import type {
  CategoryRecord,
  CursorPage,
  HistoryCursor,
  OwnershipRecord,
  TerritoryRecord,
  TerritoryRepository,
} from '../src/modules/territories/repository.js';
import {
  CompanyNotFoundError,
  InvalidTerritoryCursorError,
  TerritoryService,
} from '../src/modules/territories/service.js';

const category: CategoryRecord = {
  description: 'Creative work made with artificial intelligence.',
  id: '11111111-1111-4111-8111-111111111111',
  name: 'AI',
  slug: 'ai',
};

const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  logoUrl: 'https://owner.example/logo.png',
  name: 'Current Owner Ltd',
  slug: 'current-owner',
  status: 'SUSPENDED' as const,
  verifications: [
    { level: 'CONTACT_VERIFIED' as const, status: 'VERIFIED' as const },
    { level: 'DOMAIN_VERIFIED' as const, status: 'REVOKED' as const },
  ],
  websiteUrl: 'https://owner.example',
};

const previousOwner = {
  id: '33333333-3333-4333-8333-333333333333',
  logoUrl: null,
  name: 'Previous Owner Ltd',
  slug: 'previous-owner',
  status: 'ARCHIVED' as const,
  verifications: [{ level: 'MANUALLY_VERIFIED' as const, status: 'VERIFIED' as const }],
  websiteUrl: 'https://previous.example',
};

const ownership = (overrides: Partial<OwnershipRecord> = {}): OwnershipRecord => ({
  capturedAt: new Date('2026-08-30T12:00:00.000Z'),
  company: owner,
  endedAt: null,
  id: '44444444-4444-4444-8444-444444444444',
  previousCompany: previousOwner,
  source: 'PAID_CAPTURE',
  territoryVersion: 7n,
  ...overrides,
});

const territory = (overrides: Partial<TerritoryRecord> = {}): TerritoryRecord => ({
  availabilityStatus: 'ACTIVE',
  category,
  createdAt: new Date('2026-08-28T12:00:00.000Z'),
  currentOwnership: ownership(),
  description: 'A public creative territory.',
  displayWeight: 90,
  id: '55555555-5555-4555-8555-555555555555',
  name: 'AI Coding',
  slug: 'ai-coding',
  updatedAt: new Date('2026-08-30T12:00:00.000Z'),
  version: 7n,
  visualMetadata: { accentColor: '#0A1B2C', iconKey: 'ai-coding' },
  ...overrides,
});

class FakeTerritoryRepository implements TerritoryRepository {
  categories: CategoryRecord[] = [category];
  company: typeof owner | null = owner;
  companyTerritories: CursorPage<TerritoryRecord> = { items: [territory()] };
  companyTerritoryCount = 1;
  history: CursorPage<OwnershipRecord> = { items: [ownership()] };
  lastCompanyTerritoriesQuery: {
    companyId: string;
    page: { cursor?: unknown; limit: number };
  } | null = null;
  lastHistoryQuery: { page: { cursor?: unknown; limit: number }; territoryId: string } | null =
    null;
  lastTerritoryQuery: unknown = null;
  territory: TerritoryRecord | null = territory();
  territories: CursorPage<TerritoryRecord> = { items: [territory()] };

  async countCompanyTerritories(): Promise<number> {
    return this.companyTerritoryCount;
  }

  async findPublicCompanyBySlug(): Promise<typeof owner | null> {
    return this.company;
  }

  async findTerritoryBySlug(_slug: string, _historyLimit: number): Promise<TerritoryRecord | null> {
    return this.territory;
  }

  async listCategories(): Promise<CategoryRecord[]> {
    return this.categories;
  }

  async listCompanyTerritories(
    companyId: string,
    page: { cursor?: unknown; limit: number },
  ): Promise<CursorPage<TerritoryRecord>> {
    this.lastCompanyTerritoriesQuery = { companyId, page };
    return this.companyTerritories;
  }

  async listTerritories(query: unknown): Promise<CursorPage<TerritoryRecord>> {
    this.lastTerritoryQuery = query;
    return this.territories;
  }

  async listTerritoryHistory(
    territoryId: string,
    page: { cursor?: HistoryCursor; limit: number },
  ): Promise<CursorPage<OwnershipRecord>> {
    this.lastHistoryQuery = { page, territoryId };
    return this.history;
  }
}

function createHarness() {
  const repository = new FakeTerritoryRepository();
  return { repository, service: new TerritoryService(repository) };
}

describe('TerritoryService public territory queries', () => {
  it('maps suspended ownership safely and passes category/status ordering pagination to the repository', async () => {
    const { repository, service } = createHarness();
    repository.territories = {
      items: [
        territory(),
        territory({
          id: '66666666-6666-4666-8666-666666666666',
          name: 'AI Design',
          slug: 'ai-design',
        }),
        territory({
          id: '77777777-7777-4777-8777-777777777777',
          name: 'AI Video',
          slug: 'ai-video',
        }),
      ],
    };

    const result = await service.listTerritories({ category: 'ai', limit: 2, status: 'claimed' });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          currentOwnership: {
            capturedAt: '2026-08-30T12:00:00.000Z',
            id: '44444444-4444-4444-8444-444444444444',
            owner: expect.objectContaining({
              status: 'suspended',
              verificationLevels: ['contact_verified'],
            }),
            previousOwner: expect.objectContaining({
              status: 'archived',
              verificationLevels: ['manually_verified'],
            }),
            source: 'paid_capture',
            territoryVersion: '7',
          },
          status: 'claimed',
        }),
        expect.objectContaining({ id: '66666666-6666-4666-8666-666666666666' }),
      ],
      limit: 2,
      nextCursor: expect.any(String),
    });
    expect(repository.lastTerritoryQuery).toEqual({
      category: 'ai',
      page: { limit: 3 },
      status: 'claimed',
    });

    await service.listTerritories({ cursor: result.nextCursor, limit: 2 });
    expect(repository.lastTerritoryQuery).toEqual({
      page: {
        cursor: {
          displayWeight: 90,
          id: '66666666-6666-4666-8666-666666666666',
          name: 'AI Design',
        },
        limit: 3,
      },
    });
  });

  it('rejects malformed, version-mismatched, wrong-kind, and impossible territory cursors before querying', async () => {
    const { repository, service } = createHarness();

    await expect(
      service.listTerritories({ cursor: 'not-a-cursor', limit: 2 }),
    ).rejects.toBeInstanceOf(InvalidTerritoryCursorError);
    const invalidPayloads = [
      { displayWeight: 0, id: territory().id, k: 'territory', name: 'AI Coding', v: 1 },
      { displayWeight: 101, id: territory().id, k: 'territory', name: 'AI Coding', v: 1 },
      { displayWeight: 90, id: territory().id, k: 'territory', name: '', v: 1 },
      { displayWeight: 90, id: territory().id, k: 'territory', name: 'a'.repeat(121), v: 1 },
      { displayWeight: 90, id: 'not-a-uuid', k: 'territory', name: 'AI Coding', v: 1 },
      { capturedAt: '2026-08-30T12:00:00.000Z', id: territory().id, k: 'history', v: 1 },
      { displayWeight: 90, id: territory().id, k: 'territory', name: 'AI Coding', v: 2 },
    ];
    for (const payload of invalidPayloads) {
      const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
      await expect(service.listTerritories({ cursor, limit: 2 })).rejects.toBeInstanceOf(
        InvalidTerritoryCursorError,
      );
    }
    expect(repository.lastTerritoryQuery).toBeNull();
  });

  it('rejects malformed history cursor timestamps and UUIDs before loading history', async () => {
    const { repository, service } = createHarness();
    const invalidPayloads = [
      { capturedAt: 'not-a-date', id: territory().id, k: 'history', v: 1 },
      { capturedAt: '2026-08-30T12:00:00.000Z', id: 'not-a-uuid', k: 'history', v: 1 },
      { displayWeight: 90, id: territory().id, k: 'territory', name: 'AI Coding', v: 1 },
      { capturedAt: '2026-08-30T12:00:00.000Z', id: territory().id, k: 'history', v: 2 },
    ];

    for (const payload of invalidPayloads) {
      const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
      await expect(
        service.listTerritoryHistory('ai-coding', { cursor, limit: 2 }),
      ).rejects.toBeInstanceOf(InvalidTerritoryCursorError);
    }
    expect(repository.lastHistoryQuery).toBeNull();
  });

  it('returns five history-preview entries for detail and maps only allow-listed company fields', async () => {
    const { repository, service } = createHarness();
    const poisonedOwner = {
      ...owner,
      contactEmail: 'private@example.com',
      managementSessions: [{ id: 'private-session' }],
    };
    repository.territory = territory({
      historyPreview: Array.from({ length: 6 }, (_, index) =>
        ownership({
          company: poisonedOwner,
          endedAt: index === 0 ? null : new Date(`2026-08-${29 - index}T12:00:00.000Z`),
          id: `00000000-0000-4000-8000-00000000000${index}`,
        }),
      ),
    });

    const result = await service.getTerritory('ai-coding');

    expect(result.ownershipHistoryPreview).toHaveLength(5);
    expect(result.currentOwnership?.owner).toEqual({
      id: owner.id,
      logoUrl: owner.logoUrl,
      name: owner.name,
      slug: owner.slug,
      status: 'suspended',
      verificationLevels: ['contact_verified'],
      websiteUrl: owner.websiteUrl,
    });
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(JSON.stringify(result)).not.toContain('private-session');
  });

  it('returns stable territory and company-specific not-found results', async () => {
    const { repository, service } = createHarness();
    repository.territory = null;

    await expect(service.getTerritory('missing')).rejects.toMatchObject({
      code: 'TERRITORY_NOT_FOUND',
      message: 'Territory was not found',
    });
    await expect(service.listTerritoryHistory('missing', { limit: 2 })).rejects.toMatchObject({
      code: 'TERRITORY_NOT_FOUND',
      message: 'Territory was not found',
    });
    repository.company = null;
    await expect(service.getCompany('missing-company')).rejects.toBeInstanceOf(
      CompanyNotFoundError,
    );
    await expect(service.getCompany('missing-company')).rejects.toMatchObject({
      code: 'COMPANY_NOT_FOUND',
      message: 'Company was not found',
    });
  });

  it('uses captured-at descending cursors for history and drops the sentinel ownership row', async () => {
    const { repository, service } = createHarness();
    repository.history = {
      items: [
        ownership(),
        ownership({
          capturedAt: new Date('2026-08-29T12:00:00.000Z'),
          id: '88888888-8888-4888-8888-888888888888',
        }),
        ownership({
          capturedAt: new Date('2026-08-28T12:00:00.000Z'),
          id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    };

    const result = await service.listTerritoryHistory('ai-coding', { limit: 2 });

    expect(result).toMatchObject({
      items: [
        { capturedAt: '2026-08-30T12:00:00.000Z' },
        { capturedAt: '2026-08-29T12:00:00.000Z' },
      ],
      limit: 2,
      nextCursor: expect.any(String),
    });
    expect(repository.lastHistoryQuery).toEqual({
      page: { limit: 3 },
      territoryId: territory().id,
    });

    await service.listTerritoryHistory('ai-coding', { cursor: result.nextCursor, limit: 2 });
    expect(repository.lastHistoryQuery).toEqual({
      page: {
        cursor: {
          capturedAt: new Date('2026-08-29T12:00:00.000Z'),
          id: '88888888-8888-4888-8888-888888888888',
        },
        limit: 3,
      },
      territoryId: territory().id,
    });
  });

  it('returns the ownership-derived count only with disabled current holdings', async () => {
    const { repository, service } = createHarness();
    repository.companyTerritoryCount = 4;
    repository.companyTerritories = {
      items: [territory({ availabilityStatus: 'DISABLED' })],
    };

    const company = await service.getCompany('current-owner');
    const result = await service.listCompanyTerritories('current-owner', { limit: 2 });

    expect(company).not.toHaveProperty('currentTerritoryCount');
    expect(result).toMatchObject({
      company,
      currentTerritoryCount: 4,
      limit: 2,
      territories: [expect.objectContaining({ status: 'disabled' })],
    });
    expect(repository.lastCompanyTerritoriesQuery).toEqual({
      companyId: owner.id,
      page: { limit: 3 },
    });
  });

  it('treats a draft ownership company as an integrity failure instead of exposing it', async () => {
    const { repository, service } = createHarness();
    repository.territory = territory({
      currentOwnership: ownership({ company: { ...owner, status: 'DRAFT' } }),
    });

    await expect(service.getTerritory('ai-coding')).rejects.toMatchObject({
      code: 'OWNERSHIP_HISTORY_INVALID',
    });
  });
});
