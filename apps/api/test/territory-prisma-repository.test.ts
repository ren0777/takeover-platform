import { describe, expect, it, vi } from 'vitest';
import {
  PrismaTerritoryRepository,
  type TerritoryReadPrismaClient,
} from '../src/modules/territories/prisma-repository.js';

function createPrismaFake() {
  const companyFindFirst = vi.fn().mockResolvedValue(null);
  const territoryFindMany = vi.fn().mockResolvedValue([]);
  const territoryFindUnique = vi.fn().mockResolvedValue(null);
  const territoryCategoryFindMany = vi.fn().mockResolvedValue([]);
  const territoryCategoryFindFirst = vi.fn().mockResolvedValue(null);
  const territoryOwnershipCount = vi.fn().mockResolvedValue(0);
  const territoryOwnershipFindMany = vi.fn().mockResolvedValue([]);
  const fake = {
    company: { findFirst: companyFindFirst },
    territory: { findMany: territoryFindMany, findUnique: territoryFindUnique },
    territoryCategory: {
      findFirst: territoryCategoryFindFirst,
      findMany: territoryCategoryFindMany,
    },
    territoryOwnership: { count: territoryOwnershipCount, findMany: territoryOwnershipFindMany },
  } satisfies TerritoryReadPrismaClient;

  return {
    companyFindFirst,
    prisma: fake,
    territoryCategoryFindMany,
    territoryCategoryFindFirst,
    territoryFindMany,
    territoryFindUnique,
    territoryOwnershipCount,
    territoryOwnershipFindMany,
  };
}

function publicCompanySelect(call: unknown) {
  const input = call as {
    include?: {
      company?: { select?: Record<string, unknown> };
      ownershipHistory?: { include?: { company?: { select?: Record<string, unknown> } } };
    };
  };
  return (
    input.include?.company?.select ?? input.include?.ownershipHistory?.include?.company?.select
  );
}

describe('PrismaTerritoryRepository public read query shapes', () => {
  it('uses ownership-only claimed filters, deterministic ordering, and an allow-listed company select', async () => {
    const fake = createPrismaFake();
    const repository = new PrismaTerritoryRepository(fake.prisma);

    await repository.listTerritories({
      category: 'ai',
      page: {
        cursor: {
          displayWeight: 90,
          id: '55555555-5555-4555-8555-555555555555',
          name: 'AI Coding',
        },
        limit: 51,
      },
      status: 'claimed',
    });

    const query = fake.territoryFindMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      orderBy: [{ displayWeight: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: 51,
      where: {
        AND: [
          { category: { slug: 'ai' } },
          { availabilityStatus: 'ACTIVE', ownershipHistory: { some: { endedAt: null } } },
          {
            OR: [
              { displayWeight: { lt: 90 } },
              { displayWeight: 90, name: { gt: 'AI Coding' } },
              {
                displayWeight: 90,
                id: { gt: '55555555-5555-4555-8555-555555555555' },
                name: 'AI Coding',
              },
            ],
          },
        ],
      },
    });
    expect(publicCompanySelect(query)).toEqual({
      id: true,
      logoUrl: true,
      name: true,
      slug: true,
      status: true,
      verifications: { select: { level: true, status: true }, where: { status: 'VERIFIED' } },
      websiteUrl: true,
    });
    expect(query).not.toHaveProperty('include.currentOwner');
    expect(query).not.toHaveProperty('include.previousOwner');
  });

  it('keeps disabled holdings and counts them from active ownership rows', async () => {
    const fake = createPrismaFake();
    fake.territoryOwnershipCount.mockResolvedValue(4);
    const repository = new PrismaTerritoryRepository(fake.prisma);

    await repository.listTerritories({ page: { limit: 2 }, status: 'disabled' });
    await repository.listCompanyTerritories('22222222-2222-4222-8222-222222222222', {
      limit: 3,
    });
    await repository.countCompanyTerritories('22222222-2222-4222-8222-222222222222');

    expect(fake.territoryFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { AND: [{ availabilityStatus: 'DISABLED' }] },
    });
    expect(fake.territoryFindMany.mock.calls[1]?.[0]).toMatchObject({
      orderBy: [{ displayWeight: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: 3,
      where: {
        AND: [
          {
            ownershipHistory: {
              some: { companyId: '22222222-2222-4222-8222-222222222222', endedAt: null },
            },
          },
        ],
      },
    });
    expect(fake.territoryOwnershipCount).toHaveBeenCalledWith({
      where: { companyId: '22222222-2222-4222-8222-222222222222', endedAt: null },
    });
  });

  it('uses captured-at history ordering and the ownership relation for public history', async () => {
    const fake = createPrismaFake();
    const repository = new PrismaTerritoryRepository(fake.prisma);

    await repository.listTerritoryHistory('55555555-5555-4555-8555-555555555555', {
      cursor: {
        capturedAt: new Date('2026-08-30T12:00:00.000Z'),
        id: '44444444-4444-4444-8444-444444444444',
      },
      limit: 51,
    });

    const query = fake.territoryOwnershipFindMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      take: 51,
      where: {
        AND: [
          { territoryId: '55555555-5555-4555-8555-555555555555' },
          {
            OR: [
              { capturedAt: { lt: new Date('2026-08-30T12:00:00.000Z') } },
              {
                capturedAt: new Date('2026-08-30T12:00:00.000Z'),
                id: { lt: '44444444-4444-4444-8444-444444444444' },
              },
            ],
          },
        ],
      },
    });
    expect(publicCompanySelect(query)).toEqual({
      id: true,
      logoUrl: true,
      name: true,
      slug: true,
      status: true,
      verifications: { select: { level: true, status: true }, where: { status: 'VERIFIED' } },
      websiteUrl: true,
    });
  });
});
