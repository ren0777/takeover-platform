import { describe, expect, it, vi } from 'vitest';
import { approvedTerritorySeed } from '../src/territory-seed-data.js';
import {
  applyTerritorySeed,
  validateTerritorySeed,
  type TerritorySeedDefinition,
} from '../src/territory-seed.js';

function cloneSeed(): TerritorySeedDefinition {
  return structuredClone(approvedTerritorySeed);
}

function createSeedPrisma(options?: {
  categories?: Array<{ id: string; slug: string }>;
  territories?: Array<{ id: string; slug: string }>;
  onTerritoryUpsert?: () => Promise<void>;
}) {
  const events: string[] = [];
  const transactionClient = {
    territoryCategory: {
      findMany: vi.fn(async () => {
        events.push('category.findMany');
        return options?.categories ?? [];
      }),
      upsert: vi.fn(async () => {
        events.push('category.upsert');
      }),
    },
    territory: {
      findMany: vi.fn(async () => {
        events.push('territory.findMany');
        return options?.territories ?? [];
      }),
      upsert: vi.fn(async () => {
        events.push('territory.upsert');
        await options?.onTerritoryUpsert?.();
      }),
    },
  };
  const $transaction = vi.fn(
    async (operation: (transaction: typeof transactionClient) => Promise<unknown>) =>
      operation(transactionClient),
  );

  return { prisma: { $transaction }, transactionClient, events, $transaction };
}

describe('approved territory seed validation', () => {
  it('contains exactly eight active categories and twenty-seven active unclaimed territories', () => {
    const definition = validateTerritorySeed(approvedTerritorySeed);

    expect(definition.categories).toHaveLength(8);
    expect(definition.territories).toHaveLength(27);
    expect(new Set(definition.categories.map((category) => category.id)).size).toBe(8);
    expect(new Set(definition.categories.map((category) => category.slug)).size).toBe(8);
    expect(new Set(definition.territories.map((territory) => territory.id)).size).toBe(27);
    expect(new Set(definition.territories.map((territory) => territory.slug)).size).toBe(27);
    expect(
      definition.territories.every((territory) => territory.availabilityStatus === 'ACTIVE'),
    ).toBe(true);
    expect(
      definition.categories.every((category) =>
        definition.territories.some((territory) => territory.categoryId === category.id),
      ),
    ).toBe(true);
    expect(
      definition.territories.every((territory) =>
        definition.categories.some((category) => category.id === territory.categoryId),
      ),
    ).toBe(true);
  });

  it('uses the canonical visual metadata and display-weight schemas without ownership fields', () => {
    const definition = validateTerritorySeed(approvedTerritorySeed);

    for (const territory of definition.territories) {
      expect(territory.displayWeight).toBeGreaterThanOrEqual(1);
      expect(territory.displayWeight).toBeLessThanOrEqual(100);
      expect(territory.visualMetadata).toMatchObject({
        iconKey: expect.any(String),
        accentColor: expect.stringMatching(/^#[0-9A-F]{6}$/),
      });
      expect(territory).not.toHaveProperty('companyId');
      expect(territory).not.toHaveProperty('ownerCompanyId');
      expect(territory).not.toHaveProperty('ownership');
      expect(territory).not.toHaveProperty('payment');
      expect(territory).not.toHaveProperty('audit');
    }
  });

  it('rejects duplicate stable category ids deterministically before a transaction can start', async () => {
    const definition = cloneSeed();
    definition.categories[1] = { ...definition.categories[1], id: definition.categories[0].id };
    const transaction = vi.fn();

    await expect(
      applyTerritorySeed(
        {
          $transaction: transaction,
          territoryCategory: { findMany: vi.fn() },
          territory: { findMany: vi.fn() },
        },
        definition,
      ),
    ).rejects.toThrow('duplicate category id: 20000000-0000-4000-8000-000000000001');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate stable territory slugs deterministically before a transaction can start', async () => {
    const definition = cloneSeed();
    definition.territories[1] = {
      ...definition.territories[1],
      slug: definition.territories[0].slug,
    };
    const transaction = vi.fn();

    await expect(
      applyTerritorySeed(
        {
          $transaction: transaction,
          territoryCategory: { findMany: vi.fn() },
          territory: { findMany: vi.fn() },
        },
        definition,
      ),
    ).rejects.toThrow('duplicate territory slug: ai-coding');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a pre-existing stable id that belongs to a conflicting category slug inside the transaction', async () => {
    const { prisma, $transaction, transactionClient } = createSeedPrisma({
      categories: [{ id: approvedTerritorySeed.categories[0].id, slug: 'conflicting-category' }],
    });

    await expect(applyTerritorySeed(prisma as never, approvedTerritorySeed)).rejects.toThrow(
      'category stable ID collision: 20000000-0000-4000-8000-000000000001 is conflicting-category, expected ai',
    );
    expect($transaction).toHaveBeenCalledOnce();
    expect(transactionClient.territoryCategory.upsert).not.toHaveBeenCalled();
  });

  it('accepts a valid territory slug above the category limit up to the canonical 120-character limit', () => {
    const definition = cloneSeed();
    definition.territories[0] = {
      ...definition.territories[0],
      slug: `a${'a'.repeat(100)}`,
    };

    expect(validateTerritorySeed(definition).territories[0].slug).toHaveLength(101);
  });

  it('rejects an unknown root or category field before a transaction', async () => {
    const definition = cloneSeed() as TerritorySeedDefinition & {
      unexpectedRoot?: unknown;
      categories: Array<TerritorySeedDefinition['categories'][number] & { ownership?: unknown }>;
    };
    definition.unexpectedRoot = { companyId: 'not-allowed' };
    definition.categories[0].ownership = { companyId: 'not-allowed' };
    const $transaction = vi.fn();

    expect(() => validateTerritorySeed(definition)).toThrow(
      'unexpected territory seed field: unexpectedRoot',
    );
    await expect(applyTerritorySeed({ $transaction } as never, definition)).rejects.toThrow(
      'unexpected territory seed field: unexpectedRoot',
    );
    expect($transaction).not.toHaveBeenCalled();
  });

  it('rejects a forbidden territory ownership or takeover-intent field', () => {
    const definition = cloneSeed() as TerritorySeedDefinition & {
      territories: Array<
        TerritorySeedDefinition['territories'][number] & { takeoverIntent?: unknown }
      >;
    };
    definition.territories[0].takeoverIntent = { territoryId: 'not-allowed' };

    expect(() => validateTerritorySeed(definition)).toThrow(
      'unexpected territory seed field: takeoverIntent',
    );
  });

  it('rejects forbidden nested territory visual metadata fields', () => {
    const definition = cloneSeed() as TerritorySeedDefinition & {
      territories: Array<
        TerritorySeedDefinition['territories'][number] & {
          visualMetadata: TerritorySeedDefinition['territories'][number]['visualMetadata'] & {
            ownerCompanyId?: unknown;
          };
        }
      >;
    };
    definition.territories[0].visualMetadata.ownerCompanyId = 'not-allowed';

    expect(() => validateTerritorySeed(definition)).toThrow(
      'unexpected territory visual metadata field: ownerCompanyId',
    );
  });

  it('rejects stable category slugs and territory IDs that belong to different existing records', async () => {
    const categoryId = '20000000-0000-4000-8000-000000000099';
    const { prisma, $transaction } = createSeedPrisma({
      categories: [{ id: categoryId, slug: approvedTerritorySeed.categories[0].slug }],
      territories: [{ id: approvedTerritorySeed.territories[0].id, slug: 'other-territory' }],
    });

    await expect(applyTerritorySeed(prisma as never, approvedTerritorySeed)).rejects.toThrow(
      `category stable slug collision: ai is ${categoryId}, expected 20000000-0000-4000-8000-000000000001`,
    );
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('rejects a stable territory ID that belongs to a different existing slug', async () => {
    const { prisma, $transaction } = createSeedPrisma({
      territories: [{ id: approvedTerritorySeed.territories[0].id, slug: 'other-territory' }],
    });

    await expect(applyTerritorySeed(prisma as never, approvedTerritorySeed)).rejects.toThrow(
      'territory stable ID collision: 21000000-0000-4000-8000-000000000001 is other-territory, expected ai-coding',
    );
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('runs ordered collision reads and all upserts within one transaction', async () => {
    const { prisma, $transaction, transactionClient, events } = createSeedPrisma();

    await expect(applyTerritorySeed(prisma as never, approvedTerritorySeed)).resolves.toEqual({
      categoriesCreatedOrUpdated: 8,
      territoriesCreatedOrUpdated: 27,
    });

    expect($transaction).toHaveBeenCalledOnce();
    expect(transactionClient.territoryCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    );
    expect(transactionClient.territory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    );
    expect(events.slice(0, 2)).toEqual(['category.findMany', 'territory.findMany']);
    expect(events.slice(2, 10)).toEqual(Array(8).fill('category.upsert'));
    expect(events.slice(10)).toEqual(Array(27).fill('territory.upsert'));
  });

  it('maps concurrent unique-constraint failures to a deterministic seed collision error', async () => {
    const { prisma } = createSeedPrisma({
      onTerritoryUpsert: async () => {
        throw { code: 'P2002' };
      },
    });

    await expect(applyTerritorySeed(prisma as never, approvedTerritorySeed)).rejects.toThrow(
      'concurrent territory seed collision',
    );
  });
});
