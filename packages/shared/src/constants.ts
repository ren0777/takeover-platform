export const DEFAULT_CURRENCY = 'USD';

export const HEALTH_STATUS = {
  OK: 'ok',
  READY: 'ready',
} as const;

export const COMPANY_STATUSES = ['draft', 'active', 'suspended', 'archived'] as const;

export const VERIFICATION_LEVELS = [
  'contact_verified',
  'domain_verified',
  'manually_verified',
] as const;

export const ACCESS_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
] as const;

export const TAKEOVER_INTENT_STATUSES = [
  'awaiting_email_verification',
  'awaiting_company_access',
  'identity_ready',
  'expired',
  'cancelled',
] as const;

export const QUOTE_AUTHORITY = 'reference_only' as const;
