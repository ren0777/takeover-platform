import { z } from 'zod';
import { COMPANY_STATUSES, VERIFICATION_LEVELS } from './constants.js';

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'URL must use HTTPS');

export const companyStatusSchema = z.enum(COMPANY_STATUSES);
export type CompanyStatus = z.infer<typeof companyStatusSchema>;

export const verificationLevelSchema = z.enum(VERIFICATION_LEVELS);
export type VerificationLevel = z.infer<typeof verificationLevelSchema>;

export const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  websiteUrl: httpsUrlSchema,
  logoUrl: httpsUrlSchema.optional(),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140).nullable().optional(),
  websiteUrl: httpsUrlSchema,
  logoUrl: httpsUrlSchema.nullable().optional(),
  status: companyStatusSchema,
  expiresAt: isoDateTimeSchema.nullable().optional(),
  activatedAt: isoDateTimeSchema.nullable().optional(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
});
export type Company = z.infer<typeof companySchema>;

export const companyContactSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  verifiedAt: isoDateTimeSchema.nullable(),
});
export type CompanyContact = z.infer<typeof companyContactSchema>;

export const companyVerificationSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  level: verificationLevelSchema,
  status: z.enum(['pending', 'verified', 'failed', 'revoked']),
  verifiedAt: isoDateTimeSchema.nullable().optional(),
  revokedAt: isoDateTimeSchema.nullable().optional(),
});
export type CompanyVerification = z.infer<typeof companyVerificationSchema>;
