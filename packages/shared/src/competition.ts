import { z } from 'zod';

export const COMPETITION_RULES = {
  version: 'v1',
  territoryPoints: 100,
  categoryPoints: 25,
} as const;
export const competitionStandingSchema = z.object({
  rank: z.number().int().positive(),
  companyId: z.string(),
  companyName: z.string(),
  companySlug: z.string().nullable(),
  territories: z.number().int().nonnegative(),
  categories: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
});
export type CompetitionStanding = z.infer<typeof competitionStandingSchema>;
export const leaderboardSchema = z.object({
  rules: z.object({
    version: z.literal('v1'),
    territoryPoints: z.literal(100),
    categoryPoints: z.literal(25),
  }),
  standings: competitionStandingSchema.array(),
});
export const seasonSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  scoringVersion: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  finalizedAt: z.string().datetime().nullable(),
  standings: competitionStandingSchema.array().nullable(),
});
export const seasonsSchema = z.object({ current: seasonSchema, archives: seasonSchema.array() });
export const hallOfFameSchema = seasonSchema.array();
export const activityItemSchema = z.object({
  id: z.string().regex(/^\d+$/),
  companyName: z.string(),
  companySlug: z.string().nullable(),
  territoryName: z.string(),
  territorySlug: z.string(),
  capturedAt: z.string().datetime(),
});
export const activityPageSchema = z.object({
  items: activityItemSchema.array(),
  nextCursor: z.string().regex(/^\d+$/),
  hasMore: z.boolean(),
});
export type ActivityPage = z.infer<typeof activityPageSchema>;
export const competitionStatisticsSchema = z.object({
  companyId: z.string(),
  activeTerritories: z.number().int().nonnegative(),
  categories: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  captures: z.number().int().nonnegative(),
  spend: z.array(z.object({ currency: z.string(), amountMinor: z.string().regex(/^\d+$/) })),
});
