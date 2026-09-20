import { randomUUID } from 'node:crypto';
import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { CompetitionService } from '../../src/modules/competition/service.js';

const prisma = getDatabaseClient();
const start = new Date('2026-01-01T00:00:00.000Z');
const boundary = new Date('2026-01-31T00:00:00.000Z');
const service = new CompetitionService(prisma, { seasonStartsAt: start });
async function fixture() {
  const suffix = randomUUID();
  const companies = await Promise.all(
    ['a', 'b'].map((label) =>
      prisma.company.create({
        data: {
          name: label,
          normalizedName: label,
          websiteUrl: `https://${label}-${suffix}.example`,
          normalizedWebsite: `https://${label}-${suffix}.example`,
          slug: `${label}-${suffix}`,
          status: 'ACTIVE',
        },
      }),
    ),
  );
  const category = await prisma.territoryCategory.create({
    data: { name: suffix, slug: suffix, displayOrder: 1 },
  });
  const territory = await prisma.territory.create({
    data: {
      name: suffix,
      slug: suffix,
      description: 'test',
      categoryId: category.id,
      displayWeight: 1,
    },
  });
  const first = companies[0]!;
  const second = companies[1]!;
  return { territory, first, second };
}
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE competition_seasons, capture_activity, territory_ownerships, territories, territory_categories, companies RESTART IDENTITY CASCADE',
  );
});

describe('competition PostgreSQL invariants', () => {
  it('opens a new activity view at the latest events while preserving cursor replay', async () => {
    const { territory, first } = await fixture();
    for (let index = 0; index < 3; index++) {
      await prisma.territoryOwnership.create({ data: { territoryId: territory.id, companyId: first.id,
        capturedAt: new Date(start.getTime() + index * 2000), endedAt: new Date(start.getTime() + index * 2000 + 1000),
        source: 'PAID_CAPTURE', territoryVersion: BigInt(index + 1) } });
    }
    const replay = await service.activity('0', 3);
    const latest = await service.activity('0', 2, true);
    expect(latest.items.map((item) => item.id)).toEqual(replay.items.slice(1).map((item) => item.id));
    expect(latest.nextCursor).toBe(replay.nextCursor);
    expect(latest.hasMore).toBe(false);
  });
  it('concurrent historical rollover freezes only pre-boundary reigns and preserves current paid ownership', async () => {
    const { territory, first, second } = await fixture();
    await prisma.territoryOwnership.create({
      data: {
        territoryId: territory.id,
        companyId: first.id,
        capturedAt: start,
        endedAt: boundary,
        source: 'INITIAL_SEED',
        territoryVersion: 1n,
      },
    });
    await prisma.territoryOwnership.create({
      data: {
        territoryId: territory.id,
        companyId: second.id,
        capturedAt: boundary,
        source: 'PAID_CAPTURE',
        territoryVersion: 2n,
      },
    });
    await Promise.all([
      service.seasons(boundary),
      service.seasons(boundary),
      service.seasons(boundary),
    ]);
    const seasons = await service.seasons(boundary);
    expect(await prisma.competitionSeason.count()).toBe(2);
    expect(seasons.archives[0]?.standings?.[0]?.companyId).toBe(first.id);
    expect((await service.leaderboard()).standings[0]?.companyId).toBe(second.id);
    const frozen = seasons.archives[0]!;
    await expect(
      prisma.competitionSeason.update({ where: { id: frozen.id }, data: { standings: [] } }),
    ).rejects.toThrow();
    expect((await service.seasons(boundary)).archives).toEqual(seasons.archives);
  });

  it('never publishes rolled-back captures and resumes across sequence gaps', async () => {
    const { territory, first } = await fixture();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.territoryOwnership.create({
          data: {
            territoryId: territory.id,
            companyId: first.id,
            capturedAt: start,
            source: 'PAID_CAPTURE',
            territoryVersion: 1n,
          },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await service.activity()).items).toEqual([]);
    await prisma.territoryOwnership.create({
      data: {
        territoryId: territory.id,
        companyId: first.id,
        capturedAt: start,
        source: 'PAID_CAPTURE',
        territoryVersion: 1n,
      },
    });
    const firstPage = await service.activity();
    expect(firstPage.items).toHaveLength(1);
    expect(BigInt(firstPage.nextCursor)).toBeGreaterThan(1n);
    expect((await service.activity(firstPage.nextCursor)).items).toEqual([]);
  });

  it('does not expose a later event while a lower cursor remains uncommitted', async () => {
    const { territory, first, second } = await fixture();
    const other = await prisma.territory.create({
      data: {
        name: 'other',
        slug: randomUUID(),
        description: 'test',
        categoryId: territory.categoryId,
        displayWeight: 1,
      },
    });
    let release!: () => void;
    let inserted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const transaction = prisma.$transaction(async (tx) => {
      await tx.territoryOwnership.create({
        data: {
          territoryId: territory.id,
          companyId: first.id,
          capturedAt: start,
          source: 'PAID_CAPTURE',
          territoryVersion: 1n,
        },
      });
      inserted();
      await gate;
    });
    await ready;
    const later = prisma.territoryOwnership
      .create({
        data: {
          territoryId: other.id,
          companyId: second.id,
          capturedAt: start,
          source: 'PAID_CAPTURE',
          territoryVersion: 1n,
        },
      })
      .then((value) => value);
    try {
      expect((await service.activity()).items).toEqual([]);
    } finally {
      release();
    }
    await Promise.all([transaction, later]);
    const page = await service.activity('0', 1);
    expect(page.items[0]?.companyName).toBe(first.name);
    expect(page.hasMore).toBe(true);
    expect((await service.activity(page.nextCursor)).items[0]?.companyName).toBe(second.name);
  });
});
