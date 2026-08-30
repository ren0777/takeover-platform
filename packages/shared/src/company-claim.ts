import { z } from 'zod';
import { ACCESS_REQUEST_STATUSES, QUOTE_AUTHORITY, TAKEOVER_INTENT_STATUSES } from './constants.js';
import { companyInputSchema, companySchema, verificationLevelSchema } from './company.js';
import { moneySchema } from './money.js';

const isoDateTimeSchema = z.string().datetime({ offset: true });
const opaqueIdSchema = z.uuid();

export const accessRequestStatusSchema = z.enum(ACCESS_REQUEST_STATUSES);
export type AccessRequestStatus = z.infer<typeof accessRequestStatusSchema>;

export const takeoverIntentStatusSchema = z.enum(TAKEOVER_INTENT_STATUSES);
export type TakeoverIntentStatus = z.infer<typeof takeoverIntentStatusSchema>;

export const territoryExternalRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const quoteSnapshotSchema = z
  .object({
    territoryVersion: z.string().min(1).max(128),
    ownerCompanyId: opaqueIdSchema.optional(),
    currentWinningAmount: moneySchema.optional(),
    minimumTakeoverAmount: moneySchema.optional(),
    observedAt: isoDateTimeSchema,
  })
  .refine(
    ({ currentWinningAmount, minimumTakeoverAmount }) =>
      currentWinningAmount === undefined ||
      minimumTakeoverAmount === undefined ||
      currentWinningAmount.currency === minimumTakeoverAmount.currency,
    'quote snapshot currencies must match',
  );
export type QuoteSnapshot = z.infer<typeof quoteSnapshotSchema>;

export const takeoverPreparationRequestSchema = z
  .object({
    territoryExternalRef: territoryExternalRefSchema,
    intendedBid: moneySchema
      .refine(({ amountMinor }) => amountMinor > 0, 'bid must be positive')
      .optional(),
    quoteSnapshot: quoteSnapshotSchema.optional(),
  })
  .refine(({ intendedBid, quoteSnapshot }) => {
    const currencies = [
      intendedBid?.currency,
      quoteSnapshot?.currentWinningAmount?.currency,
      quoteSnapshot?.minimumTakeoverAmount?.currency,
    ].filter((currency): currency is string => currency !== undefined);
    return currencies.every((currency) => currency === currencies[0]);
  }, 'takeover preparation currencies must match');
export type TakeoverPreparationRequest = z.infer<typeof takeoverPreparationRequestSchema>;

export const takeoverIntentSchema = z.object({
  id: opaqueIdSchema,
  companyId: opaqueIdSchema,
  territoryExternalRef: territoryExternalRefSchema,
  intendedBid: moneySchema.optional(),
  quoteSnapshot: quoteSnapshotSchema.optional(),
  quoteAuthority: z.literal(QUOTE_AUTHORITY),
  checkoutAvailable: z.literal(false),
  status: takeoverIntentStatusSchema,
  expiresAt: isoDateTimeSchema,
});
export type TakeoverIntent = z.infer<typeof takeoverIntentSchema>;

export const companyClaimRequestSchema = z.object({
  company: companyInputSchema,
  contactEmail: z.email(),
  intent: z.object({ territoryExternalRef: territoryExternalRefSchema }),
});
export type CompanyClaimRequest = z.infer<typeof companyClaimRequestSchema>;

export const contactVerificationStateSchema = z.object({
  status: z.enum(['verification_required', 'verified']),
  deliveryAccepted: z.boolean(),
});

export const companyClaimResultSchema = z.object({
  company: companySchema,
  intent: takeoverIntentSchema,
  contactVerification: contactVerificationStateSchema,
  nextAction: z.enum(['verify_email', 'await_company_access', 'manage_company']),
  checkoutAvailable: z.literal(false),
});
export type CompanyClaimResult = z.infer<typeof companyClaimResultSchema>;

export const emailVerificationRequestSchema = z.object({
  companyId: opaqueIdSchema,
  contactEmail: z.email(),
});
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;

export const acceptedDeliverySchema = z.object({ accepted: z.literal(true) });
export type AcceptedDelivery = z.infer<typeof acceptedDeliverySchema>;

export const emailTokenExchangeRequestSchema = z.object({
  token: z.string().min(16).max(1024),
});
export type EmailTokenExchangeRequest = z.infer<typeof emailTokenExchangeRequestSchema>;

export const managementContextSchema = z.object({
  company: companySchema,
  verificationLevels: z.array(verificationLevelSchema),
  sessionExpiresAt: isoDateTimeSchema,
  csrfToken: z.string().min(16).max(512),
});
export type ManagementContext = z.infer<typeof managementContextSchema>;

export const companyAccessRequestSchema = z.object({
  id: opaqueIdSchema,
  companyId: opaqueIdSchema,
  status: accessRequestStatusSchema,
  requestedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable().optional(),
});
export type CompanyAccessRequest = z.infer<typeof companyAccessRequestSchema>;

export const emailTokenExchangeResultSchema = z.object({
  company: companySchema,
  intent: takeoverIntentSchema,
  managementContext: managementContextSchema.optional(),
  accessRequest: companyAccessRequestSchema.optional(),
  nextAction: z.enum(['manage_company', 'await_company_access']),
  checkoutAvailable: z.literal(false),
});
export type EmailTokenExchangeResult = z.infer<typeof emailTokenExchangeResultSchema>;

export const managementLinkRequestSchema = z.object({
  companyId: opaqueIdSchema,
  contactEmail: z.email(),
});
export type ManagementLinkRequest = z.infer<typeof managementLinkRequestSchema>;

export const accessDecisionRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type AccessDecisionRequest = z.infer<typeof accessDecisionRequestSchema>;

export const accessDecisionResultSchema = z.object({
  accessRequest: companyAccessRequestSchema,
  checkoutAvailable: z.literal(false),
});
export type AccessDecisionResult = z.infer<typeof accessDecisionResultSchema>;

export const recoveryRequestSchema = z.object({
  accessRequestId: opaqueIdSchema,
  contactEmail: z.email(),
});
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;

export const recoveryRequestResultSchema = z.object({
  id: opaqueIdSchema,
  status: z.literal('pending'),
  expiresAt: isoDateTimeSchema,
  executionAvailable: z.literal(false),
});
export type RecoveryRequestResult = z.infer<typeof recoveryRequestResultSchema>;
