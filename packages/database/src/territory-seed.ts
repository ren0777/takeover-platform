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

function assertSeedRecord(
  value: unknown,
  allowedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`invalid ${label}`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`invalid ${label}`);
  }
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(value)
    .filter((field) => !allowed.has(field))
    .sort();
  if (unexpected.length > 0) {
    throw new Error(`unexpected ${label} field: ${unexpected[0]}`);
  }
  return value as Record<string, unknown>;
}

function assertUnique(values: string[], entity: string, field: 'id' | 'slug'): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${entity} ${field}: ${value}`);
    seen.add(value);
  }
}

function parseCategory(input: unknown): TerritorySeedCategory {
  const category = assertSeedRecord(
    input,
    ['id', 'slug', 'name', 'description', 'displayOrder'],
    'category seed',
  );
  const displayOrder = category.displayOrder;
  const parsedCategory = territoryCategorySchema.parse({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
  });
  if (parsedCategory.description === undefined) {
    throw new Error(`invalid category description: ${parsedCategory.slug}`);
  }
  if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder) || displayOrder < 0) {
    throw new Error(`invalid category display order: ${parsedCategory.slug}`);
  }

  return {
    id: parsedCategory.id,
    slug: parsedCategory.slug,
    name: parsedCategory.name,
    description: parsedCategory.description,
    displayOrder,
  };
}

function parseTerritory(input: unknown): TerritorySeedTerritory {
  const territory = assertSeedRecord(
    input,
    [
      'id',
      'slug',
      'name',
      'description',
      'categoryId',
      'displayWeight',
      'availabilityStatus',
      'visualMetadata',
    ],
    'territory seed',
  );
  const visualMetadata = assertSeedRecord(
    territory.visualMetadata,
    ['iconKey', 'accentColor'],
    'territory visual metadata',
  );
  const availabilityStatus = territory.availabilityStatus;
  if (typeof availabilityStatus !== 'string') {
    throw new Error(`invalid territory availability status: ${String(territory.slug)}`);
  }
  const parsedVisualMetadata = territoryVisualMetadataSchema.parse({
    iconKey: visualMetadata.iconKey,
    accentColor: visualMetadata.accentColor,
  });
  if (
    parsedVisualMetadata.iconKey === undefined ||
    parsedVisualMetadata.accentColor === undefined
  ) {
    throw new Error(`incomplete territory visual metadata: ${String(territory.slug)}`);
  }
  const id = territorySummarySchema.shape.id.parse(territory.id);
  const slug = territorySummarySchema.shape.slug.parse(territory.slug);
  const name = territorySummarySchema.shape.name.parse(territory.name);
  const description = territorySummarySchema.shape.description.parse(territory.description);
  const categoryId = territoryCategorySchema.shape.id.parse(territory.categoryId);
  const displayWeight = displayWeightSchema.parse(territory.displayWeight);
  territoryAvailabilityStatusSchema.parse(availabilityStatus.toLowerCase());
  if (availabilityStatus !== 'ACTIVE') {
    throw new Error(`invalid territory availability status: ${slug}`);
  }

  return {
    id,
    slug,
    name,
    description,
    categoryId,
    displayWeight,
    availabilityStatus: 'ACTIVE',
    visualMetadata: {
      iconKey: parsedVisualMetadata.iconKey,
      accentColor: parsedVisualMetadata.accentColor,
    },
  };
}

export function validateTerritorySeed(
  definition: TerritorySeedDefinition,
): TerritorySeedDefinition {
  const seed = assertSeedRecord(definition, ['categories', 'territories'], 'territory seed');
  if (!Array.isArray(seed.categories) || !Array.isArray(seed.territories)) {
    throw new Error('territory seed must contain categories and territories arrays');
  }

  const categories = seed.categories
    .map(parseCategory)
    .sort((left, right) => left.id.localeCompare(right.id));
  const territories = seed.territories
    .map(parseTerritory)
    .sort((left, right) => left.id.localeCompare(right.id));
  assertUnique(
    categories.map((category) => category.id),
    'category',
    'id',
  );
  assertUnique(
    categories.map((category) => category.slug),
    'category',
    'slug',
  );
  assertUnique(
    territories.map((territory) => territory.id),
    'territory',
    'id',
  );
  assertUnique(
    territories.map((territory) => territory.slug),
    'territory',
    'slug',
  );

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
  prisma: Prisma.TransactionClient,
  definition: TerritorySeedDefinition,
): Promise<void> {
  const categories = await prisma.territoryCategory.findMany({
    where: {
      OR: [
        { id: { in: definition.categories.map((category) => category.id) } },
        { slug: { in: definition.categories.map((category) => category.slug) } },
      ],
    },
    select: { id: true, slug: true },
    orderBy: { id: 'asc' },
  });
  const territories = await prisma.territory.findMany({
    where: {
      OR: [
        { id: { in: definition.territories.map((territory) => territory.id) } },
        { slug: { in: definition.territories.map((territory) => territory.slug) } },
      ],
    },
    select: { id: true, slug: true },
    orderBy: { id: 'asc' },
  });
  assertNoStableCollisions('category', definition.categories, categories);
  assertNoStableCollisions('territory', definition.territories, territories);
}

export async function applyTerritorySeed(
  prisma: PrismaClient,
  definition: TerritorySeedDefinition,
): Promise<TerritorySeedResult> {
  const validatedDefinition = validateTerritorySeed(definition);
  try {
    return await prisma.$transaction(async (transaction) => {
      await preflightStableCollisions(transaction, validatedDefinition);
      for (const category of validatedDefinition.categories) {
        await transaction.territoryCategory.upsert({
          where: { id: category.id },
          create: {
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            displayOrder: category.displayOrder,
          },
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
            id: territory.id,
            slug: territory.slug,
            name: territory.name,
            description: territory.description,
            categoryId: territory.categoryId,
            displayWeight: territory.displayWeight,
            availabilityStatus: territory.availabilityStatus,
            visualMetadata: {
              iconKey: territory.visualMetadata.iconKey,
              accentColor: territory.visualMetadata.accentColor,
            } as Prisma.InputJsonValue,
          },
          update: {
            slug: territory.slug,
            name: territory.name,
            description: territory.description,
            categoryId: territory.categoryId,
            displayWeight: territory.displayWeight,
            availabilityStatus: territory.availabilityStatus,
            visualMetadata: {
              iconKey: territory.visualMetadata.iconKey,
              accentColor: territory.visualMetadata.accentColor,
            } as Prisma.InputJsonValue,
          },
        });
      }
      return {
        categoriesCreatedOrUpdated: validatedDefinition.categories.length,
        territoriesCreatedOrUpdated: validatedDefinition.territories.length,
      };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new Error('concurrent territory seed collision');
    }
    throw error;
  }
}
