import type { TerritoryVisualMetadata } from '@takeover/shared';
import type { PublicCompanyRecord } from './domain.js';

export type CategoryRecord = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

export type TerritoryCursor = {
  displayWeight: number;
  id: string;
  name: string;
};

export type HistoryCursor = {
  capturedAt: Date;
  id: string;
};

export type CursorQuery<TCursor> = {
  cursor?: TCursor;
  limit: number;
};

export type CursorPage<TRecord> = {
  items: TRecord[];
};

export type TerritoryListQueryRecord = {
  category?: string;
  page: CursorQuery<TerritoryCursor>;
  status?: 'unclaimed' | 'claimed' | 'disabled';
};

export type OwnershipRecord = {
  capturedAt: Date;
  company: PublicCompanyRecord;
  endedAt: Date | null;
  id: string;
  previousCompany?: PublicCompanyRecord;
  source: 'INITIAL_SEED' | 'PAID_CAPTURE';
  territoryVersion: bigint;
};

export type TerritoryRecord = {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  category: CategoryRecord;
  createdAt: Date;
  currentOwnership?: OwnershipRecord;
  description: string;
  displayWeight: number;
  historyPreview?: OwnershipRecord[];
  id: string;
  name: string;
  slug: string;
  updatedAt: Date;
  version: bigint;
  visualMetadata: TerritoryVisualMetadata;
};

export interface TerritoryRepository {
  listCategories(): Promise<CategoryRecord[]>;
  listTerritories(query: TerritoryListQueryRecord): Promise<CursorPage<TerritoryRecord>>;
  findTerritoryBySlug(slug: string, historyLimit: number): Promise<TerritoryRecord | null>;
  listTerritoryHistory(
    territoryId: string,
    page: CursorQuery<HistoryCursor>,
  ): Promise<CursorPage<OwnershipRecord>>;
  findPublicCompanyBySlug(slug: string): Promise<PublicCompanyRecord | null>;
  listCompanyTerritories(
    companyId: string,
    page: CursorQuery<TerritoryCursor>,
  ): Promise<CursorPage<TerritoryRecord>>;
  countCompanyTerritories(companyId: string): Promise<number>;
}
