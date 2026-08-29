import { z } from 'zod';

export const ERROR_CODES = {
  AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
  COMPANY_ACCESS_DENIED: 'COMPANY_ACCESS_DENIED',
  COMPANY_ACCESS_PENDING: 'COMPANY_ACCESS_PENDING',
  COMPANY_WEBSITE_CLAIMED: 'COMPANY_WEBSITE_CLAIMED',
  CONFLICT: 'CONFLICT',
  CONTACT_VERIFICATION_REQUIRED: 'CONTACT_VERIFICATION_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_OR_EXPIRED_TOKEN: 'INVALID_OR_EXPIRED_TOKEN',
  MANUAL_RECOVERY_UNAVAILABLE: 'MANUAL_RECOVERY_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function apiSuccessSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
