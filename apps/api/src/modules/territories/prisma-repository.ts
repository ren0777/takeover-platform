import { getDatabaseClient, Prisma, type PrismaClient } from '@takeover/database';
import { territoryVisualMetadataSchema } from '@takeover/shared';
import {
  OwnershipConflictError,
  StaleTerritoryVersionError,
  TerritoryDataIntegrityError,
  TerritoryDisabledError,
  type PublicCompanyRecord,
} from './domain.js';
import type {
  CategoryRecord,
  CursorPage,
  CursorQuery,
  HistoryCursor,
  OwnershipRecord,
  ReplaceActiveOwnershipInput,
  ReplaceActiveOwnershipResult,
  TerritoryCursor,
  TerritoryListQueryRecord,
  TerritoryOwnershipRepository,
  TerritoryRecord,
  TerritoryRepository,
} from './repository.js';

export type TerritoryReadPrismaClient = {
  company: Pick<PrismaClient['company'], 'findFirst'>;
  territory: Pick<PrismaClient['territory'], 'findMany' | 'findUnique'>;
  territoryCategory: Pick<PrismaClient['territoryCategory'], 'findFirst' | 'findMany'>;
  territoryOwnership: Pick<PrismaClient['territoryOwnership'], 'count' | 'findMany'>;
};

const publicCompanySelect = {
  id: true,
  logoUrl: true,
  name: true,
  slug: true,
  status: true,
  verifications: {
    select: { level: true, status: true },
    where: { status: 'VERIFIED' },
  },
  websiteUrl: true,
} as const satisfies Prisma.CompanySelect;

type CompanyRow = PublicCompanyRecord;

type OwnershipRow = {
  capturedAt: Date;
  company: CompanyRow;
  endedAt: Date | null;
  id: string;
  source: OwnershipRecord['source'];
  territoryVersion: bigint;
};

type TerritoryRow = {
  availabilityStatus: TerritoryRecord['availabilityStatus'];
  category: CategoryRecord;
  createdAt: Date;
  description: string;
  displayWeight: number;
  id: string;
  name: string;
  ownershipHistory: OwnershipRow[];
  slug: string;
  updatedAt: Date;
  version: bigint;
  visualMetadata: unknown;
};

function mapOwnershipRows(rows: OwnershipRow[]): OwnershipRecord[] {
  const activeRows = rows.filter((row) => row.endedAt === null);
  if (activeRows.length > 1) {
    throw new TerritoryDataIntegrityError('Territory has multiple active ownership rows');
  }

  return rows.map((row, index) => {
    const previous = rows[index + 1];
    return {
      capturedAt: row.capturedAt,
      company: row.company,
      endedAt: row.endedAt,
      id: row.id,
      ...(previous === undefined ? {} : { previousCompany: previous.company }),
      source: row.source,
      territoryVersion: row.territoryVersion,
    };
  });
}

function mapTerritoryRow(row: TerritoryRow, includeHistoryPreview = false): TerritoryRecord {
  const ownerships = mapOwnershipRows(row.ownershipHistory);
  const activeOwnership = ownerships.find((ownership) => ownership.endedAt === null);
  return {
    availabilityStatus: row.availabilityStatus,
    category: row.category,
    createdAt: row.createdAt,
    ...(activeOwnership === undefined ? {} : { currentOwnership: activeOwnership }),
    description: row.description,
    displayWeight: row.displayWeight,
    ...(includeHistoryPreview ? { historyPreview: ownerships } : {}),
    id: row.id,
    name: row.name,
    slug: row.slug,
    updatedAt: row.updatedAt,
    version: row.version,
    visualMetadata: territoryVisualMetadataSchema.parse(row.visualMetadata),
  };
}

function territoryCursorWhere(
  cursor: TerritoryCursor | undefined,
): Prisma.TerritoryWhereInput | undefined {
  if (cursor === undefined) return undefined;
  return {
    OR: [
      { displayWeight: { lt: cursor.displayWeight } },
      { displayWeight: cursor.displayWeight, name: { gt: cursor.name } },
      { displayWeight: cursor.displayWeight, id: { gt: cursor.id }, name: cursor.name },
    ],
  };
}

function historyCursorWhere(
  cursor: HistoryCursor | undefined,
): Prisma.TerritoryOwnershipWhereInput | undefined {
  if (cursor === undefined) return undefined;
  return {
    OR: [
      { capturedAt: { lt: cursor.capturedAt } },
      { capturedAt: cursor.capturedAt, id: { lt: cursor.id } },
    ],
  };
}

function territoryOrderBy(): Prisma.TerritoryOrderByWithRelationInput[] {
  return [{ displayWeight: 'desc' }, { name: 'asc' }, { id: 'asc' }];
}

function historyOrderBy(): Prisma.TerritoryOwnershipOrderByWithRelationInput[] {
  return [{ capturedAt: 'desc' }, { id: 'desc' }];
}

function territoryInclude(historyTake: number) {
  return {
    category: { select: { description: true, id: true, name: true, slug: true } },
    ownershipHistory: {
      include: { company: { select: publicCompanySelect } },
      orderBy: historyOrderBy(),
      take: historyTake,
    },
  } as const;
}

type LockedTerritoryRow = {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  id: string;
  version: bigint;
};

export class TerritoryOwnershipTerritoryNotFoundError extends Error {
  readonly code = 'TERRITORY_NOT_FOUND';

  constructor() {
    super('Territory was not found');
    this.name = 'TerritoryOwnershipTerritoryNotFoundError';
  }
}

const territoryOwnershipTransactionClientBrand = Symbol('territoryOwnershipTransactionClient');

export type TerritoryOwnershipTransactionClient = {
  readonly [territoryOwnershipTransactionClientBrand]: true;
  readonly client: Prisma.TransactionClient;
};

function transactionBoundaryError(): TypeError {
  return new TypeError(
    'PrismaTerritoryOwnershipRepository requires a transaction-scoped Prisma client',
  );
}

function isFullPrismaClient(client: Prisma.TransactionClient): boolean {
  const candidate = client as { $connect?: unknown; $disconnect?: unknown };
  return typeof candidate.$connect === 'function' || typeof candidate.$disconnect === 'function';
}

export function createTerritoryOwnershipTransactionClient(
  client: Prisma.TransactionClient,
): TerritoryOwnershipTransactionClient {
  if (isFullPrismaClient(client)) throw transactionBoundaryError();
  return Object.freeze({
    [territoryOwnershipTransactionClientBrand]: true as const,
    client,
  });
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

const ownershipConflictConstraints = new Set([
  'territory_ownerships_company_id_fkey',
  'territory_ownerships_no_overlap',
  'territory_ownerships_one_active_per_territory',
  'territory_ownerships_reign_check',
  'territory_ownerships_territory_id_territory_version_key',
  'territory_ownerships_version_check',
]);

function prismaErrorConstraint(meta: Record<string, unknown>): string | undefined {
  const directConstraint = meta.constraint;
  if (typeof directConstraint === 'string') return directConstraint;
  const driverError = recordValue(meta.driverAdapterError);
  const cause = recordValue(driverError?.cause);
  const constraint = recordValue(cause?.constraint);
  return typeof constraint?.index === 'string' ? constraint.index : undefined;
}

function isOwnershipUniqueTarget(target: unknown): boolean {
  if (typeof target === 'string') {
    return [
      'territory_ownerships_one_active_per_territory',
      'territory_ownerships_territory_id_territory_version_key',
    ].includes(target);
  }
  if (!Array.isArray(target)) return false;
  return (
    target.length === 2 && target.includes('territory_id') && target.includes('territory_version')
  );
}

function isOwnershipConstraintError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const meta = error.meta;
  if (meta?.modelName !== 'TerritoryOwnership') return false;

  if (error.code === 'P2002') return isOwnershipUniqueTarget(meta.target);
  const constraint = prismaErrorConstraint(meta);
  if (error.code === 'P2003') return constraint === 'territory_ownerships_company_id_fkey';
  if (error.code === 'P2004') {
    return constraint !== undefined && ownershipConflictConstraints.has(constraint);
  }
  if (error.code !== 'P2039') return false;

  if (constraint !== undefined) return ownershipConflictConstraints.has(constraint);
  const driverError = recordValue(meta.driverAdapterError);
  const cause = recordValue(driverError?.cause);
  const originalMessage = cause?.originalMessage;
  return (
    cause?.originalCode === 'P0001' &&
    typeof originalMessage === 'string' &&
    [
      'invalid territory ownership end transition',
      'territory ownership history is immutable',
    ].includes(originalMessage)
  );
}

export class PrismaTerritoryOwnershipRepository implements TerritoryOwnershipRepository {
  private readonly transaction: Prisma.TransactionClient;

  constructor(transaction: TerritoryOwnershipTransactionClient) {
    if (
      typeof transaction !== 'object' ||
      transaction === null ||
      transaction[territoryOwnershipTransactionClientBrand] !== true ||
      isFullPrismaClient(transaction.client)
    ) {
      throw transactionBoundaryError();
    }
    this.transaction = transaction.client;
  }

  async replaceActiveOwnership(
    input: ReplaceActiveOwnershipInput,
  ): Promise<ReplaceActiveOwnershipResult> {
    const [territory] = await this.transaction.$queryRaw<LockedTerritoryRow[]>(Prisma.sql`
      SELECT
        "id",
        "availability_status" AS "availabilityStatus",
        "version"
      FROM "territories"
      WHERE "id" = ${input.territoryId}::uuid
      FOR UPDATE
    `);
    if (territory === undefined) throw new TerritoryOwnershipTerritoryNotFoundError();
    if (territory.availabilityStatus === 'DISABLED') throw new TerritoryDisabledError();
    if (territory.version !== input.expectedTerritoryVersion) {
      throw new StaleTerritoryVersionError();
    }

    const activeOwnership = await this.transaction.territoryOwnership.findFirst({
      select: { companyId: true, id: true },
      where: { endedAt: null, territoryId: territory.id },
    });
    if (activeOwnership?.companyId === input.newOwnerCompanyId) {
      throw new OwnershipConflictError();
    }

    const territoryVersion = input.expectedTerritoryVersion + 1n;
    try {
      if (activeOwnership !== null) {
        const ended = await this.transaction.territoryOwnership.updateMany({
          data: { endedAt: input.transitionAt },
          where: { endedAt: null, id: activeOwnership.id },
        });
        if (ended.count !== 1) throw new OwnershipConflictError();
      }

      const incremented = await this.transaction.territory.updateMany({
        data: { version: { increment: 1 } },
        where: { id: territory.id, version: input.expectedTerritoryVersion },
      });
      if (incremented.count !== 1) throw new StaleTerritoryVersionError();

      const ownership = await this.transaction.territoryOwnership.create({
        data: {
          capturedAt: input.transitionAt,
          companyId: input.newOwnerCompanyId,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
          source: input.source,
          territoryId: territory.id,
          territoryVersion,
        },
        select: { id: true },
      });

      return {
        ownershipId: ownership.id,
        previousOwnershipId: activeOwnership?.id ?? null,
        territoryId: territory.id,
        territoryVersion,
      };
    } catch (error) {
      if (error instanceof OwnershipConflictError || error instanceof StaleTerritoryVersionError) {
        throw error;
      }
      if (isOwnershipConstraintError(error)) throw new OwnershipConflictError();
      throw error;
    }
  }
}

export class PrismaTerritoryRepository implements TerritoryRepository {
  constructor(private readonly prisma: TerritoryReadPrismaClient = getDatabaseClient()) {}

  async listCategories(): Promise<CategoryRecord[]> {
    return this.prisma.territoryCategory.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { description: true, id: true, name: true, slug: true },
    });
  }

  async findCategoryBySlug(slug: string): Promise<CategoryRecord | null> {
    return this.prisma.territoryCategory.findFirst({
      select: { description: true, id: true, name: true, slug: true },
      where: { slug },
    });
  }

  async listTerritories(query: TerritoryListQueryRecord): Promise<CursorPage<TerritoryRecord>> {
    const filters: Prisma.TerritoryWhereInput[] = [];
    if (query.category !== undefined) filters.push({ category: { slug: query.category } });
    if (query.status === 'unclaimed') {
      filters.push({ availabilityStatus: 'ACTIVE', ownershipHistory: { none: { endedAt: null } } });
    }
    if (query.status === 'claimed') {
      filters.push({ availabilityStatus: 'ACTIVE', ownershipHistory: { some: { endedAt: null } } });
    }
    if (query.status === 'disabled') filters.push({ availabilityStatus: 'DISABLED' });
    const cursorFilter = territoryCursorWhere(query.page.cursor);
    if (cursorFilter !== undefined) filters.push(cursorFilter);

    const rows = await this.prisma.territory.findMany({
      ...(filters.length === 0 ? {} : { where: { AND: filters } }),
      include: territoryInclude(2),
      orderBy: territoryOrderBy(),
      take: query.page.limit,
    });
    return { items: rows.map((row) => mapTerritoryRow(row)) };
  }

  async findTerritoryBySlug(slug: string, historyLimit: number): Promise<TerritoryRecord | null> {
    const row = await this.prisma.territory.findUnique({
      include: territoryInclude(Math.max(historyLimit + 1, 2)),
      where: { slug },
    });
    return row === null ? null : mapTerritoryRow(row, true);
  }

  async listTerritoryHistory(
    territoryId: string,
    page: CursorQuery<HistoryCursor>,
  ): Promise<CursorPage<OwnershipRecord>> {
    const cursorFilter = historyCursorWhere(page.cursor);
    const rows = await this.prisma.territoryOwnership.findMany({
      ...(cursorFilter === undefined ? {} : { where: { AND: [{ territoryId }, cursorFilter] } }),
      ...(cursorFilter === undefined ? { where: { territoryId } } : {}),
      include: { company: { select: publicCompanySelect } },
      orderBy: historyOrderBy(),
      take: page.limit,
    });
    return { items: mapOwnershipRows(rows) };
  }

  async findPublicCompanyBySlug(slug: string): Promise<PublicCompanyRecord | null> {
    return this.prisma.company.findFirst({
      select: publicCompanySelect,
      where: { slug, status: { not: 'DRAFT' } },
    });
  }

  async listCompanyTerritories(
    companyId: string,
    page: CursorQuery<TerritoryCursor>,
  ): Promise<CursorPage<TerritoryRecord>> {
    const filters: Prisma.TerritoryWhereInput[] = [
      { ownershipHistory: { some: { companyId, endedAt: null } } },
    ];
    const cursorFilter = territoryCursorWhere(page.cursor);
    if (cursorFilter !== undefined) filters.push(cursorFilter);

    const rows = await this.prisma.territory.findMany({
      include: territoryInclude(2),
      orderBy: territoryOrderBy(),
      take: page.limit,
      where: { AND: filters },
    });
    return { items: rows.map((row) => mapTerritoryRow(row)) };
  }

  async countCompanyTerritories(companyId: string): Promise<number> {
    return this.prisma.territoryOwnership.count({ where: { companyId, endedAt: null } });
  }
}
