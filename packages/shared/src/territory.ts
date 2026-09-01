import { z } from 'zod';
import {
  OWNERSHIP_SOURCES,
  TERRITORY_AVAILABILITY_STATUSES,
  TERRITORY_PUBLIC_STATUSES,
} from './constants.js';
import { httpsUrlSchema, verificationLevelSchema } from './company.js';
import { apiSuccessSchema } from './api.js';

const isoDateTimeSchema = z.string().datetime({ offset: true });
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const territoryVersionSchema = z.string().regex(/^[1-9][0-9]*$/);
export const displayWeightSchema = z.number().int().min(1).max(100);
export const territoryStatusSchema = z.enum(TERRITORY_PUBLIC_STATUSES);
export const territoryAvailabilityStatusSchema = z.enum(TERRITORY_AVAILABILITY_STATUSES);
export const ownershipSourceSchema = z.enum(OWNERSHIP_SOURCES);

export const territoryCategorySchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema.max(100),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type TerritoryCategory = z.infer<typeof territoryCategorySchema>;

export const territoryVisualMetadataSchema = z
  .object({
    iconKey: slugSchema.max(80).optional(),
    imageUrl: httpsUrlSchema.optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
  })
  .strict();
export type TerritoryVisualMetadata = z.infer<typeof territoryVisualMetadataSchema>;

export const companyPublicSummarySchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema.max(140),
    name: z.string().trim().min(1).max(120),
    websiteUrl: httpsUrlSchema,
    logoUrl: httpsUrlSchema.optional(),
    status: z.enum(['active', 'suspended', 'archived']),
    verificationLevels: z.array(verificationLevelSchema),
  })
  .strict();
export type CompanyPublicSummary = z.infer<typeof companyPublicSummarySchema>;

export const territoryOwnershipSummarySchema = z
  .object({
    id: z.uuid(),
    owner: companyPublicSummarySchema,
    previousOwner: companyPublicSummarySchema.optional(),
    capturedAt: isoDateTimeSchema,
    territoryVersion: territoryVersionSchema,
    source: ownershipSourceSchema,
  })
  .strict();
export type TerritoryOwnershipSummary = z.infer<typeof territoryOwnershipSummarySchema>;

export const territoryHistoryEntrySchema = z
  .object({
    id: z.uuid(),
    owner: companyPublicSummarySchema,
    previousOwner: companyPublicSummarySchema.optional(),
    capturedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema.optional(),
    territoryVersion: territoryVersionSchema,
    source: ownershipSourceSchema,
  })
  .strict();
export type TerritoryHistoryEntry = z.infer<typeof territoryHistoryEntrySchema>;

export const territorySummarySchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema.max(120),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    category: territoryCategorySchema,
    displayWeight: displayWeightSchema,
    status: territoryStatusSchema,
    visualMetadata: territoryVisualMetadataSchema,
    version: territoryVersionSchema,
    currentOwnership: territoryOwnershipSummarySchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type TerritorySummary = z.infer<typeof territorySummarySchema>;

export const territoryDetailSchema = territorySummarySchema
  .extend({ ownershipHistoryPreview: z.array(territoryHistoryEntrySchema) })
  .strict();
export type TerritoryDetail = z.infer<typeof territoryDetailSchema>;

export const companyTerritoriesSchema = z
  .object({
    company: companyPublicSummarySchema,
    currentTerritoryCount: z.number().int().min(0),
    territories: z.array(territorySummarySchema),
  })
  .strict();
export type CompanyTerritories = z.infer<typeof companyTerritoriesSchema>;

export const paginationQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageMetaSchema = z
  .object({
    requestId: z.string().min(1),
    limit: z.number().int().min(1).max(100),
    nextCursor: z.string().min(1).optional(),
  })
  .strict();
export type PageMeta = z.infer<typeof pageMetaSchema>;

export const territoryListQuerySchema = paginationQuerySchema
  .extend({
    category: slugSchema.max(100).optional(),
    status: territoryStatusSchema.optional(),
  })
  .strict();
export type TerritoryListQuery = z.infer<typeof territoryListQuerySchema>;

export const territoryPageSchema = apiSuccessSchema(z.array(territorySummarySchema))
  .extend({ meta: pageMetaSchema })
  .strict();
export type TerritoryPage = z.infer<typeof territoryPageSchema>;

export const territoryHistoryPageSchema = apiSuccessSchema(z.array(territoryHistoryEntrySchema))
  .extend({ meta: pageMetaSchema })
  .strict();
export type TerritoryHistoryPage = z.infer<typeof territoryHistoryPageSchema>;
