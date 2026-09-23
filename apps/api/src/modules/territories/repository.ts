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
  source: 'INITIAL_SEED' | 'PAID_CAPTURE' | 'REFUND_RESTORATION';
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

export type ReplaceActiveOwnershipInput = {
  territoryId: string;
  newOwnerCompanyId: string;
  expectedTerritoryVersion: bigint;
  transitionAt: Date;
  source: 'INITIAL_SEED' | 'PAID_CAPTURE' | 'REFUND_RESTORATION';
  reason?: string;
  /**
   * Allows the transition on a disabled territory. Only a correction may set
   * this: a refund has to be recorded whatever an operator has since done to
   * the territory, whereas nobody may buy their way onto a disabled one.
   */
  allowDisabledTerritory?: boolean;
};

/** Ends the open reign and leaves the territory unclaimed. */
export type ReleaseActiveOwnershipInput = {
  territoryId: string;
  expectedTerritoryVersion: bigint;
  transitionAt: Date;
};

export type ReleaseActiveOwnershipResult = {
  territoryId: string;
  endedOwnershipId: string | null;
  territoryVersion: bigint;
};

export type ReplaceActiveOwnershipResult = {
  territoryId: string;
  previousOwnershipId: string | null;
  ownershipId: string;
  territoryVersion: bigint;
};

export interface TerritoryOwnershipRepository {
  replaceActiveOwnership(input: ReplaceActiveOwnershipInput): Promise<ReplaceActiveOwnershipResult>;
  releaseActiveOwnership(input: ReleaseActiveOwnershipInput): Promise<ReleaseActiveOwnershipResult>;
}

export interface TerritoryRepository {
  listCategories(): Promise<CategoryRecord[]>;
  findCategoryBySlug(slug: string): Promise<CategoryRecord | null>;
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
