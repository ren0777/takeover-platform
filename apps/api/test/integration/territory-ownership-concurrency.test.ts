import { randomUUID } from 'node:crypto';
import { getDatabaseClient, type Prisma } from '@takeover/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OwnershipConflictError,
  StaleTerritoryVersionError,
  TerritoryDisabledError,
} from '../../src/modules/territories/domain.js';
import {
  createTerritoryOwnershipTransactionClient,
  PrismaTerritoryOwnershipRepository,
  PrismaTerritoryRepository,
} from '../../src/modules/territories/prisma-repository.js';

const prisma = getDatabaseClient();

function ownershipRepository(transaction: Prisma.TransactionClient) {
  return new PrismaTerritoryOwnershipRepository(
    createTerritoryOwnershipTransactionClient(transaction),
  );
}

type Fixture = {
  categoryId: string;
  companyIds: [string, string, string];
  territoryId: string;
};

let fixture: Fixture | undefined;

async function createCompany(
  transaction: Prisma.TransactionClient,
  label: string,
): Promise<string> {
  const suffix = randomUUID();
  const company = await transaction.company.create({
    data: {
      name: `${label} ${suffix}`,
      normalizedName: `${label.toLowerCase()} ${suffix}`,
      normalizedWebsite: `https://${suffix}.example/`,
      slug: `${label.toLowerCase()}-${suffix}`,
      status: 'ACTIVE',
      websiteUrl: `https://${suffix}.example/`,
    },
  });
  return company.id;
}

async function createFixture(): Promise<Fixture> {
  return prisma.$transaction(async (transaction) => {
    const suffix = randomUUID();
    const category = await transaction.territoryCategory.create({
      data: {
        displayOrder: 100,
        name: `Ownership concurrency ${suffix}`,
        slug: `ownership-concurrency-${suffix}`,
      },
    });
    const territory = await transaction.territory.create({
      data: {
        categoryId: category.id,
        description: 'A UUID-scoped fixture for the transaction-bound ownership primitive.',
        displayWeight: 50,
        name: `Ownership concurrency ${suffix}`,
        slug: `ownership-concurrency-${suffix}`,
        visualMetadata: {},
      },
    });
    const companyIds: [string, string, string] = [
      await createCompany(transaction, 'Ownership Alpha'),
      await createCompany(transaction, 'Ownership Bravo'),
      await createCompany(transaction, 'Ownership Charlie'),
    ];

    return { categoryId: category.id, companyIds, territoryId: territory.id };
  });
}

async function cleanFixture(): Promise<void> {
  if (fixture === undefined) return;

  await prisma.territoryOwnership.deleteMany({ where: { territoryId: fixture.territoryId } });
  await prisma.territory.deleteMany({ where: { id: fixture.territoryId } });
  await prisma.territoryCategory.deleteMany({ where: { id: fixture.categoryId } });
  await prisma.company.deleteMany({ where: { id: { in: fixture.companyIds } } });
  fixture = undefined;
}

async function createInitialOwnership(companyId: string, capturedAt: Date) {
  if (fixture === undefined) throw new Error('fixture is not initialized');
  return prisma.territoryOwnership.create({
    data: {
      capturedAt,
      companyId,
      reason: 'approved initial fixture owner',
      source: 'INITIAL_SEED',
      territoryId: fixture.territoryId,
      territoryVersion: 1n,
    },
  });
}

async function nonOwnershipState() {
  return {
    auditLogs: await prisma.auditLog.count(),
    contacts: await prisma.companyContact.count(),
    managementSessions: await prisma.companyManagementSession.count(),
    takeoverIntents: await prisma.takeoverIntent.count(),
  };
}

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(cleanFixture);

describe('transaction-bound territory ownership replacement', () => {
  it('rejects a full Prisma client at construction before starting any mutation', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const territoryBefore = await prisma.territory.findUniqueOrThrow({
      where: { id: fixture.territoryId },
    });

    expect(() => {
      // @ts-expect-error A full PrismaClient must not satisfy the transaction-only constructor.
      new PrismaTerritoryOwnershipRepository(prisma);
    }).toThrow('PrismaTerritoryOwnershipRepository requires a transaction-scoped Prisma client');

    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toEqual(territoryBefore);
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('adds a first owner with one version increment and no identity, audit, or intent side effects', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const transitionAt = new Date('2026-09-01T08:00:00.000Z');
    const sideEffectsBefore = await nonOwnershipState();

    expect(new PrismaTerritoryRepository()).not.toHaveProperty('replaceActiveOwnership');

    const result = await prisma.$transaction((transaction) =>
      ownershipRepository(transaction).replaceActiveOwnership({
        expectedTerritoryVersion: 1n,
        newOwnerCompanyId: fixture!.companyIds[0],
        reason: 'approved launch owner',
        source: 'INITIAL_SEED',
        territoryId: fixture!.territoryId,
        transitionAt,
      }),
    );

    expect(result).toMatchObject({
      previousOwnershipId: null,
      territoryId: fixture.territoryId,
      territoryVersion: 2n,
    });
    expect(result.ownershipId).toEqual(expect.any(String));
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 2n });
    await expect(
      prisma.territoryOwnership.findUniqueOrThrow({ where: { id: result.ownershipId } }),
    ).resolves.toMatchObject({
      capturedAt: transitionAt,
      companyId: fixture.companyIds[0],
      endedAt: null,
      reason: 'approved launch owner',
      source: 'INITIAL_SEED',
      territoryId: fixture.territoryId,
      territoryVersion: 2n,
    });
    await expect(nonOwnershipState()).resolves.toEqual(sideEffectsBefore);
  });

  it('ends the active reign and creates its replacement at one timestamp without rewriting history', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const capturedAt = new Date('2026-08-01T08:00:00.000Z');
    const transitionAt = new Date('2026-09-01T08:00:00.000Z');
    const original = await createInitialOwnership(fixture.companyIds[0], capturedAt);

    const result = await prisma.$transaction((transaction) =>
      ownershipRepository(transaction).replaceActiveOwnership({
        expectedTerritoryVersion: 1n,
        newOwnerCompanyId: fixture!.companyIds[1],
        source: 'PAID_CAPTURE',
        territoryId: fixture!.territoryId,
        transitionAt,
      }),
    );

    expect(result).toMatchObject({
      previousOwnershipId: original.id,
      territoryId: fixture.territoryId,
      territoryVersion: 2n,
    });
    const history = await prisma.territoryOwnership.findMany({
      orderBy: { capturedAt: 'asc' },
      where: { territoryId: fixture.territoryId },
    });
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ ...original, endedAt: transitionAt });
    expect(history[1]).toMatchObject({
      capturedAt: transitionAt,
      companyId: fixture.companyIds[1],
      endedAt: null,
      id: result.ownershipId,
      source: 'PAID_CAPTURE',
      territoryVersion: 2n,
    });
  });

  it('rejects a missing territory with a stable error', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');

    await expect(
      prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: fixture!.companyIds[0],
          source: 'INITIAL_SEED',
          territoryId: randomUUID(),
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        }),
      ),
    ).rejects.toMatchObject({ code: 'TERRITORY_NOT_FOUND' });
  });

  it('rejects replacing an active owner with the same company without changing state', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const original = await createInitialOwnership(
      fixture.companyIds[0],
      new Date('2026-08-01T08:00:00.000Z'),
    );

    await expect(
      prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: fixture!.companyIds[0],
          source: 'PAID_CAPTURE',
          territoryId: fixture!.territoryId,
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(OwnershipConflictError);
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 1n });
    await expect(
      prisma.territoryOwnership.findMany({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toEqual([original]);
  });

  it('rejects a disabled territory without changing its owner or version', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const original = await createInitialOwnership(
      fixture.companyIds[0],
      new Date('2026-08-01T08:00:00.000Z'),
    );
    await prisma.territory.update({
      data: { availabilityStatus: 'DISABLED' },
      where: { id: fixture.territoryId },
    });

    await expect(
      prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: fixture!.companyIds[1],
          source: 'PAID_CAPTURE',
          territoryId: fixture!.territoryId,
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(TerritoryDisabledError);
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ availabilityStatus: 'DISABLED', version: 1n });
    await expect(
      prisma.territoryOwnership.findMany({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toEqual([original]);
  });

  it('rolls back every ownership change when the expected territory version is stale', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const original = await createInitialOwnership(
      fixture.companyIds[0],
      new Date('2026-08-01T08:00:00.000Z'),
    );

    await expect(
      prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 2n,
          newOwnerCompanyId: fixture!.companyIds[1],
          source: 'PAID_CAPTURE',
          territoryId: fixture!.territoryId,
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(StaleTerritoryVersionError);
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 1n });
    await expect(
      prisma.territoryOwnership.findMany({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toEqual([original]);
  });

  it('maps the named history trigger rejection for a non-forward transition and rolls back', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const capturedAt = new Date('2026-09-01T08:00:00.000Z');
    const original = await createInitialOwnership(fixture.companyIds[0], capturedAt);

    await expect(
      prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: fixture!.companyIds[1],
          source: 'PAID_CAPTURE',
          territoryId: fixture!.territoryId,
          transitionAt: capturedAt,
        }),
      ),
    ).rejects.toBeInstanceOf(OwnershipConflictError);
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 1n });
    await expect(
      prisma.territoryOwnership.findMany({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toEqual([original]);
  });

  it('maps only the ownership company foreign-key failure and rolls back the version increment', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');

    await expect(
      prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: randomUUID(),
          source: 'INITIAL_SEED',
          territoryId: fixture!.territoryId,
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(OwnershipConflictError);
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 1n });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('passes an oversized-reason database error through and rolls back without masking it', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');

    let received: unknown;
    try {
      await prisma.$transaction((transaction) =>
        ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: fixture!.companyIds[0],
          reason: 'x'.repeat(501),
          source: 'INITIAL_SEED',
          territoryId: fixture!.territoryId,
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        }),
      );
    } catch (error) {
      received = error;
    }

    expect(received).toMatchObject({ code: 'P2000' });
    expect(received).not.toBeInstanceOf(OwnershipConflictError);
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 1n });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('ends each reign once while preserving immutable fields across sequential replacements', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const firstCapturedAt = new Date('2026-07-01T08:00:00.000Z');
    const firstTransitionAt = new Date('2026-08-01T08:00:00.000Z');
    const secondTransitionAt = new Date('2026-09-01T08:00:00.000Z');
    const original = await createInitialOwnership(fixture.companyIds[0], firstCapturedAt);

    const firstReplacement = await prisma.$transaction((transaction) =>
      ownershipRepository(transaction).replaceActiveOwnership({
        expectedTerritoryVersion: 1n,
        newOwnerCompanyId: fixture!.companyIds[1],
        reason: 'first replacement',
        source: 'PAID_CAPTURE',
        territoryId: fixture!.territoryId,
        transitionAt: firstTransitionAt,
      }),
    );
    await prisma.$transaction((transaction) =>
      ownershipRepository(transaction).replaceActiveOwnership({
        expectedTerritoryVersion: 2n,
        newOwnerCompanyId: fixture!.companyIds[2],
        reason: 'second replacement',
        source: 'PAID_CAPTURE',
        territoryId: fixture!.territoryId,
        transitionAt: secondTransitionAt,
      }),
    );

    const history = await prisma.territoryOwnership.findMany({
      orderBy: { capturedAt: 'asc' },
      where: { territoryId: fixture.territoryId },
    });
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({ ...original, endedAt: firstTransitionAt });
    expect(history[1]).toMatchObject({
      capturedAt: firstTransitionAt,
      companyId: fixture.companyIds[1],
      endedAt: secondTransitionAt,
      id: firstReplacement.ownershipId,
      reason: 'first replacement',
      source: 'PAID_CAPTURE',
      territoryVersion: 2n,
    });
    expect(history[2]).toMatchObject({
      capturedAt: secondTransitionAt,
      companyId: fixture.companyIds[2],
      endedAt: null,
      reason: 'second replacement',
      source: 'PAID_CAPTURE',
      territoryVersion: 3n,
    });
  });

  it('lets the caller roll back the ownership transition with its surrounding transaction', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');

    await expect(
      prisma.$transaction(async (transaction) => {
        await ownershipRepository(transaction).replaceActiveOwnership({
          expectedTerritoryVersion: 1n,
          newOwnerCompanyId: fixture!.companyIds[0],
          source: 'INITIAL_SEED',
          territoryId: fixture!.territoryId,
          transitionAt: new Date('2026-09-01T08:00:00.000Z'),
        });
        throw new Error('force callback rollback');
      }),
    ).rejects.toThrow('force callback rollback');
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: fixture.territoryId } }),
    ).resolves.toMatchObject({ version: 1n });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('serializes two concurrent replacements so exactly one wins without gaps or overlaps', async () => {
    if (fixture === undefined) throw new Error('fixture is not initialized');
    const capturedAt = new Date('2026-08-01T08:00:00.000Z');
    const transitionAt = new Date('2026-09-01T08:00:00.000Z');
    const original = await createInitialOwnership(fixture.companyIds[0], capturedAt);

    const replacements = await Promise.allSettled(
      fixture.companyIds.slice(1).map((newOwnerCompanyId) =>
        prisma.$transaction((transaction) =>
          ownershipRepository(transaction).replaceActiveOwnership({
            expectedTerritoryVersion: 1n,
            newOwnerCompanyId,
            source: 'PAID_CAPTURE',
            territoryId: fixture!.territoryId,
            transitionAt,
          }),
        ),
      ),
    );

    const fulfilled = replacements.filter((result) => result.status === 'fulfilled');
    const rejected = replacements.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: expect.any(StaleTerritoryVersionError) });

    const territory = await prisma.territory.findUniqueOrThrow({
      where: { id: fixture.territoryId },
    });
    const history = await prisma.territoryOwnership.findMany({
      orderBy: { capturedAt: 'asc' },
      where: { territoryId: fixture.territoryId },
    });
    expect(territory.version).toBe(2n);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ ...original, endedAt: transitionAt });
    expect(history[1]).toMatchObject({
      capturedAt: transitionAt,
      endedAt: null,
      territoryVersion: 2n,
    });
    expect(fixture.companyIds.slice(1)).toContain(history[1]?.companyId);
  }, 15_000);
});
