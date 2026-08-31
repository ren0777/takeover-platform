import { z } from 'zod';
import { ACCESS_REQUEST_STATUSES, QUOTE_AUTHORITY, TAKEOVER_INTENT_STATUSES } from './constants.js';
import {
  companyInputSchema,
  companySchema,
  httpsUrlSchema,
  verificationLevelSchema,
} from './company.js';
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

const opaqueCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const companyAccessReviewListQuerySchema = z.object({
  cursor: opaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CompanyAccessReviewListQuery = z.infer<typeof companyAccessReviewListQuerySchema>;

export const companyAccessReviewItemSchema = z.object({
  id: opaqueIdSchema,
  companyId: opaqueIdSchema,
  requesterEmail: z.email(),
  status: z.literal('pending'),
  requestedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  intent: z
    .object({
      id: opaqueIdSchema,
      territoryExternalRef: territoryExternalRefSchema,
    })
    .optional(),
});
export type CompanyAccessReviewItem = z.infer<typeof companyAccessReviewItemSchema>;

export const companyAccessReviewPageSchema = z.object({
  items: z.array(companyAccessReviewItemSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});
export type CompanyAccessReviewPage = z.infer<typeof companyAccessReviewPageSchema>;

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

const companySlugLocatorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function isReservedManagementLinkIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && [0, 2, 168].includes(second)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
}

function isReservedManagementLinkIp(hostname: string): boolean {
  const bareHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(bareHostname)) {
    return isReservedManagementLinkIpv4(bareHostname);
  }
  if (!bareHostname.includes(':')) return false;
  const leadingHextet = bareHostname.split(':')[0];
  const firstHextet = Number.parseInt(
    leadingHextet === undefined || leadingHextet === '' ? '0' : leadingHextet,
    16,
  );
  if (firstHextet < 0x2000 || firstHextet > 0x3fff) return true;
  const secondHextet = Number.parseInt(bareHostname.split(':')[1] ?? '0', 16);
  if (firstHextet === 0x2001 && (secondHextet <= 0x003f || secondHextet === 0x0db8)) {
    return true;
  }
  return bareHostname.startsWith('2002:') || bareHostname.startsWith('3fff:');
}

const managementLinkWebsiteUrlSchema = httpsUrlSchema.refine((value) => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  return (
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local') &&
    !isReservedManagementLinkIp(hostname)
  );
}, 'Management-link website must be a public HTTPS URL without credentials, query, or fragment');

export const managementLinkRequestSchema = z.union([
  z
    .object({
      companyWebsiteUrl: managementLinkWebsiteUrlSchema,
      contactEmail: z.email(),
    })
    .strict(),
  z
    .object({
      companySlug: companySlugLocatorSchema,
      contactEmail: z.email(),
    })
    .strict(),
]);
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
