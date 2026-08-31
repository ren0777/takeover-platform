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

describe('approved territory seed validation', () => {
  it('contains exactly eight active categories and twenty-seven active unclaimed territories', () => {
    const definition = validateTerritorySeed(approvedTerritorySeed);

    expect(definition.categories).toHaveLength(8);
    expect(definition.territories).toHaveLength(27);
    expect(new Set(definition.categories.map((category) => category.id)).size).toBe(8);
    expect(new Set(definition.categories.map((category) => category.slug)).size).toBe(8);
    expect(new Set(definition.territories.map((territory) => territory.id)).size).toBe(27);
    expect(new Set(definition.territories.map((territory) => territory.slug)).size).toBe(27);
    expect(definition.territories.every((territory) => territory.availabilityStatus === 'ACTIVE')).toBe(
      true,
    );
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

  it('rejects a pre-existing stable id that belongs to a conflicting category slug', async () => {
    const transaction = vi.fn();

    await expect(
      applyTerritorySeed(
        {
          $transaction: transaction,
          territoryCategory: {
            findMany: vi.fn(async () => [
              { id: approvedTerritorySeed.categories[0].id, slug: 'conflicting-category' },
            ]),
          },
          territory: { findMany: vi.fn(async () => []) },
        },
        approvedTerritorySeed,
      ),
    ).rejects.toThrow(
      'category stable ID collision: 20000000-0000-4000-8000-000000000001 is conflicting-category, expected ai',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('accepts a valid territory slug above the category limit up to the canonical 120-character limit', () => {
    const definition = cloneSeed();
    definition.territories[0] = {
      ...definition.territories[0],
      slug: `a${'a'.repeat(100)}`,
    };

    expect(validateTerritorySeed(definition).territories[0].slug).toHaveLength(101);
  });
});
