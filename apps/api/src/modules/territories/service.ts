import type {
  CompanyPublicSummary,
  CompanyTerritories,
  PaginationQuery,
  TerritoryCategory,
  TerritoryDetail,
  TerritoryHistoryEntry,
  TerritoryListQuery,
  TerritoryOwnershipSummary,
  TerritorySummary,
} from '@takeover/shared';
import { displayWeightSchema, ERROR_CODES } from '@takeover/shared';
import { z } from 'zod';
import {
  assertPublicCompany,
  deriveTerritoryStatus,
  serializeTerritoryVersion,
  TERRITORY_HISTORY_PREVIEW_LIMIT,
} from './domain.js';
import type {
  CategoryRecord,
  CursorPage,
  CursorQuery,
  HistoryCursor,
  OwnershipRecord,
  TerritoryCursor,
  TerritoryRecord,
  TerritoryRepository,
} from './repository.js';

const territoryCursorSchema = z
  .object({
    displayWeight: displayWeightSchema,
    id: z.uuid(),
    k: z.literal('territory'),
    name: z.string().trim().min(1).max(120),
    v: z.literal(1),
  })
  .strict();

const historyCursorSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    id: z.uuid(),
    k: z.literal('history'),
    v: z.literal(1),
  })
  .strict();

export class InvalidTerritoryCursorError extends Error {
  readonly code = 'INVALID_CURSOR';
  readonly statusCode = 400;

  constructor() {
    super('The pagination cursor is invalid');
    this.name = 'InvalidTerritoryCursorError';
  }
}

export class TerritoryNotFoundError extends Error {
  readonly code = ERROR_CODES.TERRITORY_NOT_FOUND;
  readonly statusCode = 404;

  constructor() {
    super('Territory was not found');
    this.name = 'TerritoryNotFoundError';
  }
}

export class TerritoryCategoryNotFoundError extends Error {
  readonly code = ERROR_CODES.TERRITORY_CATEGORY_NOT_FOUND;
  readonly statusCode = 404;

  constructor() {
    super('Territory category was not found');
    this.name = 'TerritoryCategoryNotFoundError';
  }
}

export class CompanyNotFoundError extends Error {
  readonly code = ERROR_CODES.COMPANY_NOT_FOUND;
  readonly statusCode = 404;

  constructor() {
    super('Company was not found');
    this.name = 'CompanyNotFoundError';
  }
}

export type TerritoryListResult = {
  items: TerritorySummary[];
  limit: number;
  nextCursor?: string;
};

export type TerritoryHistoryResult = {
  items: TerritoryHistoryEntry[];
  limit: number;
  nextCursor?: string;
};

export type CompanyTerritoriesResult = CompanyTerritories & {
  limit: number;
  nextCursor?: string;
};

function mapCategory(record: CategoryRecord): TerritoryCategory {
  return {
    ...(record.description === null ? {} : { description: record.description }),
    id: record.id,
    name: record.name,
    slug: record.slug,
  };
}

function mapOwnership(record: OwnershipRecord): TerritoryOwnershipSummary {
  return {
    capturedAt: record.capturedAt.toISOString(),
    id: record.id,
    owner: assertPublicCompany(record.company),
    ...(record.previousCompany === undefined
      ? {}
      : { previousOwner: assertPublicCompany(record.previousCompany) }),
    source: record.source.toLowerCase() as TerritoryOwnershipSummary['source'],
    territoryVersion: serializeTerritoryVersion(record.territoryVersion),
  };
}

function mapHistoryEntry(record: OwnershipRecord): TerritoryHistoryEntry {
  return {
    ...mapOwnership(record),
    ...(record.endedAt === null ? {} : { endedAt: record.endedAt.toISOString() }),
  };
}

function mapTerritory(record: TerritoryRecord): TerritorySummary {
  return {
    category: mapCategory(record.category),
    createdAt: record.createdAt.toISOString(),
    ...(record.currentOwnership === undefined
      ? {}
      : { currentOwnership: mapOwnership(record.currentOwnership) }),
    description: record.description,
    displayWeight: record.displayWeight,
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: deriveTerritoryStatus(record.availabilityStatus, record.currentOwnership !== undefined),
    updatedAt: record.updatedAt.toISOString(),
    version: serializeTerritoryVersion(record.version),
    visualMetadata: record.visualMetadata,
  };
}

function encodeTerritoryCursor(record: TerritoryRecord): string {
  return Buffer.from(
    JSON.stringify({
      displayWeight: record.displayWeight,
      id: record.id,
      k: 'territory',
      name: record.name,
      v: 1,
    }),
  ).toString('base64url');
}

function encodeHistoryCursor(record: OwnershipRecord): string {
  return Buffer.from(
    JSON.stringify({
      capturedAt: record.capturedAt.toISOString(),
      id: record.id,
      k: 'history',
      v: 1,
    }),
  ).toString('base64url');
}

function decodeCursor(cursor: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidTerritoryCursorError();

  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidTerritoryCursorError();
  }
}

function decodeTerritoryCursor(cursor: string | undefined): TerritoryCursor | undefined {
  if (cursor === undefined) return undefined;
  const parsed = territoryCursorSchema.safeParse(decodeCursor(cursor));
  if (!parsed.success) throw new InvalidTerritoryCursorError();
  return { displayWeight: parsed.data.displayWeight, id: parsed.data.id, name: parsed.data.name };
}

function decodeHistoryCursor(cursor: string | undefined): HistoryCursor | undefined {
  if (cursor === undefined) return undefined;
  const parsed = historyCursorSchema.safeParse(decodeCursor(cursor));
  if (!parsed.success) throw new InvalidTerritoryCursorError();
  return { capturedAt: new Date(parsed.data.capturedAt), id: parsed.data.id };
}

function pageWithSentinel<TRecord>(
  page: CursorPage<TRecord>,
  limit: number,
): { hasNextPage: boolean; items: TRecord[] } {
  return {
    hasNextPage: page.items.length > limit,
    items: page.items.slice(0, limit),
  };
}

function territoryPageQuery(
  query: Pick<PaginationQuery, 'cursor' | 'limit'>,
): CursorQuery<TerritoryCursor> {
  const cursor = decodeTerritoryCursor(query.cursor);
  return { ...(cursor === undefined ? {} : { cursor }), limit: query.limit + 1 };
}

function nextCursor<TRecord>(
  hasNextPage: boolean,
  last: TRecord | undefined,
  encode: (record: TRecord) => string,
): { nextCursor?: string } {
  return hasNextPage && last !== undefined ? { nextCursor: encode(last) } : {};
}

export class TerritoryService {
  constructor(private readonly repository: TerritoryRepository) {}

  async listCategories(): Promise<TerritoryCategory[]> {
    return (await this.repository.listCategories()).map(mapCategory);
  }

  async listTerritories(query: TerritoryListQuery): Promise<TerritoryListResult> {
    const pageQuery = territoryPageQuery(query);
    if (query.category !== undefined) {
      const category = await this.repository.findCategoryBySlug(query.category);
      if (category === null) throw new TerritoryCategoryNotFoundError();
    }
    const page = await this.repository.listTerritories({
      ...(query.category === undefined ? {} : { category: query.category }),
      page: pageQuery,
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    const visible = pageWithSentinel(page, query.limit);
    const last = visible.items.at(-1);
    return {
      items: visible.items.map(mapTerritory),
      limit: query.limit,
      ...nextCursor(visible.hasNextPage, last, encodeTerritoryCursor),
    };
  }

  async getTerritory(slug: string): Promise<TerritoryDetail> {
    const record = await this.repository.findTerritoryBySlug(slug, TERRITORY_HISTORY_PREVIEW_LIMIT);
    if (record === null) throw new TerritoryNotFoundError();
    return {
      ...mapTerritory(record),
      ownershipHistoryPreview: (record.historyPreview ?? [])
        .slice(0, TERRITORY_HISTORY_PREVIEW_LIMIT)
        .map(mapHistoryEntry),
    };
  }

  async listTerritoryHistory(
    slug: string,
    query: PaginationQuery,
  ): Promise<TerritoryHistoryResult> {
    const territory = await this.repository.findTerritoryBySlug(
      slug,
      TERRITORY_HISTORY_PREVIEW_LIMIT,
    );
    if (territory === null) throw new TerritoryNotFoundError();
    const cursor = decodeHistoryCursor(query.cursor);
    const page = await this.repository.listTerritoryHistory(territory.id, {
      ...(cursor === undefined ? {} : { cursor }),
      limit: query.limit + 1,
    });
    const visible = pageWithSentinel(page, query.limit);
    const last = visible.items.at(-1);
    return {
      items: visible.items.map(mapHistoryEntry),
      limit: query.limit,
      ...nextCursor(visible.hasNextPage, last, encodeHistoryCursor),
    };
  }

  async getCompany(slug: string): Promise<CompanyPublicSummary> {
    const company = await this.repository.findPublicCompanyBySlug(slug);
    if (company === null) throw new CompanyNotFoundError();
    return assertPublicCompany(company);
  }

  async listCompanyTerritories(
    slug: string,
    query: PaginationQuery,
  ): Promise<CompanyTerritoriesResult> {
    const company = await this.getCompany(slug);
    const pageQuery = territoryPageQuery(query);
    const [page, currentTerritoryCount] = await Promise.all([
      this.repository.listCompanyTerritories(company.id, pageQuery),
      this.repository.countCompanyTerritories(company.id),
    ]);
    const visible = pageWithSentinel(page, query.limit);
    const last = visible.items.at(-1);
    return {
      company,
      currentTerritoryCount,
      limit: query.limit,
      territories: visible.items.map(mapTerritory),
      ...nextCursor(visible.hasNextPage, last, encodeTerritoryCursor),
    };
  }
}
