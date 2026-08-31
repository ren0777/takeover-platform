import {
  displayWeightSchema,
  territoryAvailabilityStatusSchema,
  territoryCategorySchema,
  territorySummarySchema,
  territoryVisualMetadataSchema,
} from '@takeover/shared';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export type TerritorySeedCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
};

export type TerritorySeedTerritory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  displayWeight: number;
  availabilityStatus: 'ACTIVE';
  visualMetadata: {
    iconKey: string;
    accentColor: string;
  };
};

export type TerritorySeedDefinition = {
  categories: TerritorySeedCategory[];
  territories: TerritorySeedTerritory[];
};

export type TerritorySeedResult = {
  categoriesCreatedOrUpdated: number;
  territoriesCreatedOrUpdated: number;
};

type SeedCollisionRow = { id: string; slug: string };

function assertUnique(values: string[], entity: string, field: 'id' | 'slug'): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${entity} ${field}: ${value}`);
    seen.add(value);
  }
}

function parseCategory(category: TerritorySeedCategory): TerritorySeedCategory {
  territoryCategorySchema.parse({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
  });
  if (!Number.isInteger(category.displayOrder) || category.displayOrder < 0) {
    throw new Error(`invalid category display order: ${category.slug}`);
  }
  return category;
}

function parseTerritory(territory: TerritorySeedTerritory): TerritorySeedTerritory {
  territorySummarySchema.shape.id.parse(territory.id);
  territorySummarySchema.shape.slug.parse(territory.slug);
  territorySummarySchema.shape.name.parse(territory.name);
  territorySummarySchema.shape.description.parse(territory.description);
  territoryCategorySchema.shape.id.parse(territory.categoryId);
  displayWeightSchema.parse(territory.displayWeight);
  territoryVisualMetadataSchema.parse(territory.visualMetadata);
  territoryAvailabilityStatusSchema.parse(territory.availabilityStatus.toLowerCase());
  if (territory.availabilityStatus !== 'ACTIVE') {
    throw new Error(`invalid territory availability status: ${territory.slug}`);
  }
  return territory;
}

export function validateTerritorySeed(definition: TerritorySeedDefinition): TerritorySeedDefinition {
  if (!Array.isArray(definition.categories) || !Array.isArray(definition.territories)) {
    throw new Error('territory seed must contain categories and territories arrays');
  }

  const categories = definition.categories.map(parseCategory);
  const territories = definition.territories.map(parseTerritory);
  assertUnique(categories.map((category) => category.id), 'category', 'id');
  assertUnique(categories.map((category) => category.slug), 'category', 'slug');
  assertUnique(territories.map((territory) => territory.id), 'territory', 'id');
  assertUnique(territories.map((territory) => territory.slug), 'territory', 'slug');

  const categoryIds = new Set(categories.map((category) => category.id));
  for (const territory of territories) {
    if (!categoryIds.has(territory.categoryId)) {
      throw new Error(`unknown territory category: ${territory.categoryId}`);
    }
  }
  for (const category of categories) {
    if (!territories.some((territory) => territory.categoryId === category.id)) {
      throw new Error(`empty territory category: ${category.id}`);
    }
  }

  return { categories, territories };
}

function assertNoStableCollisions(
  entity: 'category' | 'territory',
  expected: Array<{ id: string; slug: string }>,
  existing: SeedCollisionRow[],
): void {
  const expectedById = new Map(expected.map((row) => [row.id, row]));
  const expectedBySlug = new Map(expected.map((row) => [row.slug, row]));
  for (const row of existing) {
    const idMatch = expectedById.get(row.id);
    if (idMatch !== undefined && idMatch.slug !== row.slug) {
      throw new Error(
        `${entity} stable ID collision: ${row.id} is ${row.slug}, expected ${idMatch.slug}`,
      );
    }
    const slugMatch = expectedBySlug.get(row.slug);
    if (slugMatch !== undefined && slugMatch.id !== row.id) {
      throw new Error(
        `${entity} stable slug collision: ${row.slug} is ${row.id}, expected ${slugMatch.id}`,
      );
    }
  }
}

async function preflightStableCollisions(
  prisma: PrismaClient,
  definition: TerritorySeedDefinition,
): Promise<void> {
  const [categories, territories] = await Promise.all([
    prisma.territoryCategory.findMany({
      where: {
        OR: [
          { id: { in: definition.categories.map((category) => category.id) } },
          { slug: { in: definition.categories.map((category) => category.slug) } },
        ],
      },
      select: { id: true, slug: true },
    }),
    prisma.territory.findMany({
      where: {
        OR: [
          { id: { in: definition.territories.map((territory) => territory.id) } },
          { slug: { in: definition.territories.map((territory) => territory.slug) } },
        ],
      },
      select: { id: true, slug: true },
    }),
  ]);
  assertNoStableCollisions('category', definition.categories, categories);
  assertNoStableCollisions('territory', definition.territories, territories);
}

export async function applyTerritorySeed(
  prisma: PrismaClient,
  definition: TerritorySeedDefinition,
): Promise<TerritorySeedResult> {
  const validatedDefinition = validateTerritorySeed(definition);
  await preflightStableCollisions(prisma, validatedDefinition);

  return prisma.$transaction(async (transaction) => {
    for (const category of validatedDefinition.categories) {
      await transaction.territoryCategory.upsert({
        where: { id: category.id },
        create: category,
        update: {
          slug: category.slug,
          name: category.name,
          description: category.description,
          displayOrder: category.displayOrder,
        },
      });
    }
    for (const territory of validatedDefinition.territories) {
      await transaction.territory.upsert({
        where: { id: territory.id },
        create: {
          ...territory,
          visualMetadata: territory.visualMetadata as Prisma.InputJsonValue,
        },
        update: {
          slug: territory.slug,
          name: territory.name,
          description: territory.description,
          categoryId: territory.categoryId,
          displayWeight: territory.displayWeight,
          availabilityStatus: territory.availabilityStatus,
          visualMetadata: territory.visualMetadata as Prisma.InputJsonValue,
        },
      });
    }
    return {
      categoriesCreatedOrUpdated: validatedDefinition.categories.length,
      territoriesCreatedOrUpdated: validatedDefinition.territories.length,
    };
  });
}
