// Quote response contract for Phase 3
import { z } from 'zod'; import { uuidSchema } from './uuid-schema.js';
import { moneySchema } from './money.js';

export const quoteStatusEnum = z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']);
export type QuoteStatus = z.infer<typeof quoteStatusEnum>;

export const quoteResponseSchema = z.object({
  quoteId: uuidSchema,
  territoryId: uuidSchema,
  territorySlug: z.string(),
  territoryVersion: z.string().min(1).max(128), // opaque decimal string
  minimumAmount: moneySchema,
  expiresAt: z.string().datetime({ offset: true }),
  status: quoteStatusEnum,
  checkoutAvailable: z.boolean(),
  eligibilityReason: z.string().optional(),
}).strict();
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
