import { Buffer } from 'node:buffer';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';
import type { OperatorConfig } from '../modules/operator/index.js';

const DEVELOPMENT_TOKEN_SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveSeconds = z.coerce.number().int().positive();

function decodedSecret(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length >= 32 ? new Uint8Array(bytes) : null;
}

function isValidWebhookSecret(value: string): boolean {
  try {
    new Webhook(value);
    return true;
  } catch {
    return false;
  }
}

const apiEnvironmentSchema = z
  .object({
    ACCESS_REQUEST_TTL_SECONDS: positiveSeconds.default(604_800),
    ACCESS_REQUESTS_PER_CONTACT_COMPANY_PER_DAY: positiveSeconds.default(3),
    ACCESS_REQUESTS_PER_IP_PER_HOUR: positiveSeconds.default(10),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    API_TRUSTED_PROXIES: z
      .string()
      .default('')
      .transform((value) =>
        value.trim() === '' ? [] : value.split(',').map((address) => address.trim()),
      )
      .pipe(z.array(z.union([z.ipv4(), z.ipv6()])).max(16)),
    DATABASE_URL: z.url().optional(),
    DEV_EMAIL_CAPTURE_ENABLED: booleanString.default(false),
    DEV_EMAIL_LOG_ENABLED: booleanString.default(false),
    DRAFT_TTL_SECONDS: positiveSeconds.default(86_400),
    EMAIL_PROVIDER: z.enum(['development', 'unavailable', 'resend']).default('development'),
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    EMAIL_FROM: z.email().optional(),
    EMAIL_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(10_000),
    OPERATOR_ID: z.string().uuid().optional(),
    OPERATOR_CREDENTIAL: z.string().optional(),
    OPERATOR_PERMISSIONS: z
      .string()
      .default('read')
      .transform((value) => value.split(',').map((v) => v.trim()))
      .pipe(z.array(z.enum(['read', 'moderate'])).min(1))
      .refine((permissions) => new Set(permissions).size === permissions.length),
    SEASON_DURATION_DAYS: z.coerce.number().int().min(1).max(366).default(30),
    SEASON_STARTS_AT: z.string().datetime().optional(),
    EMAIL_VERIFICATION_TTL_SECONDS: positiveSeconds.default(900),
    LINK_ISSUANCE_PER_EMAIL_PER_HOUR: positiveSeconds.default(5),
    LINK_ISSUANCE_PER_IP_PER_HOUR: positiveSeconds.default(20),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MANAGEMENT_LINK_TTL_SECONDS: positiveSeconds.default(900),
    MANAGEMENT_SESSION_TTL_SECONDS: positiveSeconds.default(28_800),
    MANAGER_NOTIFICATION_COOLDOWN_SECONDS: positiveSeconds.default(3_600),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RECOVERY_REQUEST_TTL_SECONDS: positiveSeconds.default(604_800),
    TAKEOVER_QUOTE_TTL_SECONDS: positiveSeconds.max(3_600).default(300),
    RECOVERY_REQUESTS_PER_CONTACT_COMPANY_PER_DAY: positiveSeconds.default(2),
    TOKEN_EXCHANGE_ATTEMPTS_PER_IP_PER_HOUR: positiveSeconds.default(60),
    TOKEN_EXCHANGE_FAILURES_PER_SELECTOR: positiveSeconds.default(10),
    TOKEN_HMAC_SECRET: z.string().default(DEVELOPMENT_TOKEN_SECRET),
    TAKEOVER_RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
    TAKEOVER_RECONCILIATION_ENABLED: booleanString.default(true),
    TAKEOVER_RECONCILIATION_INTERVAL_SECONDS: positiveSeconds.default(300),
    WEB_APP_ORIGIN: z.url().default('http://localhost:3000'),
    DODO_API_KEY: z.string().nonempty().optional(),
    DODO_LIVE_ENABLED: booleanString.default(false),
    PAYMENTS_ENABLED: booleanString.default(false),
    DODO_BASE_URL: z.string().url().default('https://test.dodopayments.com/'),
    DODO_PRODUCT_IDS: z.string().optional(),
    DODO_DEFAULT_PRODUCT_ID: z.string().nonempty().optional(),
    DODO_WEBHOOK_SECRET: z.string().nonempty().optional(),
  })
  .superRefine((value, context) => {
    if (decodedSecret(value.TOKEN_HMAC_SECRET) === null) {
      context.addIssue({
        code: 'custom',
        message: 'must decode to at least 32 bytes',
        path: ['TOKEN_HMAC_SECRET'],
      });
    }

    const webUrl = new URL(value.WEB_APP_ORIGIN);
    if (value.EMAIL_PROVIDER === 'resend') {
      for (const field of ['RESEND_API_KEY', 'EMAIL_FROM'] as const) {
        if (value[field] === undefined)
          context.addIssue({ code: 'custom', message: 'required for Resend', path: [field] });
      }
      if (webUrl.protocol !== 'https:')
        context.addIssue({
          code: 'custom',
          message: 'production email links require HTTPS',
          path: ['WEB_APP_ORIGIN'],
        });
    }
    if (value.OPERATOR_ID !== undefined || value.OPERATOR_CREDENTIAL !== undefined) {
      if (value.OPERATOR_ID === undefined)
        context.addIssue({
          code: 'custom',
          message: 'required for operator access',
          path: ['OPERATOR_ID'],
        });
      if (
        value.OPERATOR_CREDENTIAL === undefined ||
        decodedSecret(value.OPERATOR_CREDENTIAL) === null
      ) {
        context.addIssue({
          code: 'custom',
          message: 'must be a random base64url secret of at least 32 bytes',
          path: ['OPERATOR_CREDENTIAL'],
        });
      }
    }
    if (webUrl.origin !== value.WEB_APP_ORIGIN.replace(/\/$/, '')) {
      context.addIssue({
        code: 'custom',
        message: 'must be an origin without path, query, or fragment',
        path: ['WEB_APP_ORIGIN'],
      });
    }

    if (value.NODE_ENV === 'production') {
      if (value.DATABASE_URL === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'required in production',
          path: ['DATABASE_URL'],
        });
      }
      if (value.TOKEN_HMAC_SECRET === DEVELOPMENT_TOKEN_SECRET) {
        context.addIssue({
          code: 'custom',
          message: 'must be explicitly configured in production',
          path: ['TOKEN_HMAC_SECRET'],
        });
      }
      if (value.EMAIL_PROVIDER === 'development') {
        context.addIssue({
          code: 'custom',
          message: 'development transport is forbidden in production',
          path: ['EMAIL_PROVIDER'],
        });
      }
      if (value.DEV_EMAIL_CAPTURE_ENABLED) {
        context.addIssue({
          code: 'custom',
          message: 'development capture is forbidden in production',
          path: ['DEV_EMAIL_CAPTURE_ENABLED'],
        });
      }
      if (value.DEV_EMAIL_LOG_ENABLED) {
        context.addIssue({
          code: 'custom',
          message: 'development link logging is forbidden in production',
          path: ['DEV_EMAIL_LOG_ENABLED'],
        });
      }
      if (webUrl.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          message: 'must use HTTPS in production',
          path: ['WEB_APP_ORIGIN'],
        });
      }
    }
    if (
      value.DODO_WEBHOOK_SECRET !== undefined &&
      !isValidWebhookSecret(value.DODO_WEBHOOK_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'must be a valid Standard Webhooks signing secret',
        path: ['DODO_WEBHOOK_SECRET'],
      });
    }
  });

export type IdentityConfig = Readonly<{
  accessRequestTtlSeconds: number;
  developmentEmailCaptureEnabled: boolean;
  developmentEmailLogEnabled: boolean;
  draftTtlSeconds: number;
  emailProvider: 'development' | 'unavailable' | 'resend';
  productionEmail?: { apiKey: string; fromEmail: string; timeoutMs: number };
  emailVerificationTtlSeconds: number;
  managementLinkTtlSeconds: number;
  managementSessionTtlSeconds: number;
  rateLimits: Readonly<{
    accessRequestsPerContactCompanyPerDay: number;
    accessRequestsPerIpPerHour: number;
    linkIssuancePerEmailPerHour: number;
    linkIssuancePerIpPerHour: number;
    managerNotificationCooldownSeconds: number;
    recoveryRequestsPerContactCompanyPerDay: number;
    tokenExchangeAttemptsPerIpPerHour: number;
    tokenExchangeFailuresPerSelector: number;
  }>;
  /** How long a generated takeover quote stays usable. Bounded to keep prices fresh. */
  quoteTtlSeconds: number;
  recoveryRequestTtlSeconds: number;
  tokenHmacSecret: Uint8Array;
  webAppOrigin: string;
}>;

export type DodoConfig = Readonly<{
  apiKey: string;
  baseUrl: string;
  productIds?: Record<string, string>;
  webhookSecret?: string;
}>;

export type ApiConfig = {
  host: string;
  trustedProxies: string[];
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl?: string;
  identity: IdentityConfig;
  takeoverReconciliation: Readonly<{
    batchSize: number;
    enabled: boolean;
    intervalSeconds: number;
  }>;
  dodo?: DodoConfig;
  /**
   * PAYMENTS_ENABLED: checkout is offered only with this explicit enablement,
   * independently of DODO_LIVE_ENABLED, which alone guards the live host.
   */
  paymentsEnabled: boolean;
  operator?: OperatorConfig;
  competition: { seasonDurationDays: number; seasonStartsAt?: Date };
};

export function parseApiConfig(source: NodeJS.ProcessEnv): ApiConfig {
  // Compose and secret injectors commonly represent an unconfigured optional value as empty.
  const normalized = { ...source };
  for (const field of [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'DODO_API_KEY',
    'DODO_PRODUCT_IDS',
    'DODO_WEBHOOK_SECRET',
    'DODO_DEFAULT_PRODUCT_ID',
    'OPERATOR_ID',
    'OPERATOR_CREDENTIAL',
    'SEASON_STARTS_AT',
  ]) {
    if (normalized[field] === '') delete normalized[field];
  }
  const result = apiEnvironmentSchema.safeParse(normalized);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(
      ', ',
    );
    throw new Error(`Invalid API configuration: ${fields}`);
  }

  const tokenHmacSecret = decodedSecret(result.data.TOKEN_HMAC_SECRET);
  if (tokenHmacSecret === null) throw new Error('Invalid API configuration: TOKEN_HMAC_SECRET');

  const rateLimits = Object.freeze({
    accessRequestsPerContactCompanyPerDay: result.data.ACCESS_REQUESTS_PER_CONTACT_COMPANY_PER_DAY,
    accessRequestsPerIpPerHour: result.data.ACCESS_REQUESTS_PER_IP_PER_HOUR,
    linkIssuancePerEmailPerHour: result.data.LINK_ISSUANCE_PER_EMAIL_PER_HOUR,
    linkIssuancePerIpPerHour: result.data.LINK_ISSUANCE_PER_IP_PER_HOUR,
    managerNotificationCooldownSeconds: result.data.MANAGER_NOTIFICATION_COOLDOWN_SECONDS,
    recoveryRequestsPerContactCompanyPerDay:
      result.data.RECOVERY_REQUESTS_PER_CONTACT_COMPANY_PER_DAY,
    tokenExchangeAttemptsPerIpPerHour: result.data.TOKEN_EXCHANGE_ATTEMPTS_PER_IP_PER_HOUR,
    tokenExchangeFailuresPerSelector: result.data.TOKEN_EXCHANGE_FAILURES_PER_SELECTOR,
  });
  // Parse DODO_PRODUCT_IDS JSON mapping if provided.
  let productIds: Record<string, string> | undefined;
  if (result.data.DODO_PRODUCT_IDS) {
    try {
      const parsed = JSON.parse(result.data.DODO_PRODUCT_IDS);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('DODO_PRODUCT_IDS must be a JSON object');
      }
      productIds = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!/^[A-Z]{3}$/.test(key)) {
          throw new Error(`Invalid currency code in DODO_PRODUCT_IDS: ${key}`);
        }
        if (typeof value !== 'string' || value.length === 0) {
          throw new Error(`Invalid product ID for currency ${key} in DODO_PRODUCT_IDS`);
        }
        productIds[key] = value;
      }
    } catch (e) {
      throw new Error(`Invalid DODO_PRODUCT_IDS JSON: ${(e as Error).message}`);
    }
  }
  // Validate DODO configuration
  if (result.data.DODO_API_KEY) {
    if (!productIds || Object.keys(productIds).length === 0) {
      throw new Error(
        'DODO_PRODUCT_IDS must be a non-empty JSON object when DODO_API_KEY is configured',
      );
    }
    if (result.data.DODO_WEBHOOK_SECRET === undefined) {
      throw new Error('DODO_WEBHOOK_SECRET must be configured when DODO_API_KEY is configured');
    }
  }
  try {
    const baseUrlObj = new URL(result.data.DODO_BASE_URL);
    if (baseUrlObj.protocol !== 'https:') {
      throw new Error('DODO_BASE_URL must be HTTPS');
    }
    if (
      baseUrlObj.username ||
      baseUrlObj.password ||
      baseUrlObj.search ||
      baseUrlObj.hash ||
      baseUrlObj.pathname !== '/'
    ) {
      throw new Error(
        'DODO_BASE_URL must be an origin without credentials, path, query, or fragment',
      );
    }
    if (
      result.data.NODE_ENV === 'production' &&
      !['test.dodopayments.com', 'live.dodopayments.com'].includes(baseUrlObj.host)
    ) {
      throw new Error('DODO_BASE_URL must use an official Dodo API host in production');
    }
    if (baseUrlObj.hostname === 'live.dodopayments.com' && !result.data.DODO_LIVE_ENABLED) {
      throw new Error('DODO_LIVE_ENABLED must be true before enabling live payments');
    }
  } catch (e) {
    throw new Error(`Invalid DODO_BASE_URL: ${(e as Error).message}`);
  }

  const identity: IdentityConfig = Object.freeze({
    accessRequestTtlSeconds: result.data.ACCESS_REQUEST_TTL_SECONDS,
    developmentEmailCaptureEnabled: result.data.DEV_EMAIL_CAPTURE_ENABLED,
    developmentEmailLogEnabled: result.data.DEV_EMAIL_LOG_ENABLED,
    draftTtlSeconds: result.data.DRAFT_TTL_SECONDS,
    emailProvider: result.data.EMAIL_PROVIDER,
    ...(result.data.EMAIL_PROVIDER === 'resend'
      ? {
          productionEmail: {
            apiKey: result.data.RESEND_API_KEY!,
            fromEmail: result.data.EMAIL_FROM!,
            timeoutMs: result.data.EMAIL_TIMEOUT_MS,
          },
        }
      : {}),
    emailVerificationTtlSeconds: result.data.EMAIL_VERIFICATION_TTL_SECONDS,
    managementLinkTtlSeconds: result.data.MANAGEMENT_LINK_TTL_SECONDS,
    managementSessionTtlSeconds: result.data.MANAGEMENT_SESSION_TTL_SECONDS,
    rateLimits,
    quoteTtlSeconds: result.data.TAKEOVER_QUOTE_TTL_SECONDS,
    recoveryRequestTtlSeconds: result.data.RECOVERY_REQUEST_TTL_SECONDS,
    tokenHmacSecret,
    webAppOrigin: result.data.WEB_APP_ORIGIN.replace(/\/$/, ''),
  });
  const config: ApiConfig = {
    competition: {
      seasonDurationDays: result.data.SEASON_DURATION_DAYS,
      ...(result.data.SEASON_STARTS_AT === undefined
        ? {}
        : { seasonStartsAt: new Date(result.data.SEASON_STARTS_AT) }),
    },
    host: result.data.API_HOST,
    trustedProxies: result.data.API_TRUSTED_PROXIES,
    identity,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    paymentsEnabled: result.data.PAYMENTS_ENABLED,
    port: result.data.API_PORT,
    takeoverReconciliation: Object.freeze({
      batchSize: result.data.TAKEOVER_RECONCILIATION_BATCH_SIZE,
      enabled: result.data.TAKEOVER_RECONCILIATION_ENABLED,
      intervalSeconds: result.data.TAKEOVER_RECONCILIATION_INTERVAL_SECONDS,
    }),
  };

  if (result.data.OPERATOR_ID !== undefined && result.data.OPERATOR_CREDENTIAL !== undefined) {
    config.operator = {
      operatorId: result.data.OPERATOR_ID,
      credential: result.data.OPERATOR_CREDENTIAL,
      permissions: result.data.OPERATOR_PERMISSIONS,
    };
  }

  if (result.data.DODO_API_KEY !== undefined) {
    const webhookSecret = result.data.DODO_WEBHOOK_SECRET;
    if (webhookSecret === undefined) {
      throw new Error('DODO_WEBHOOK_SECRET must be configured when DODO_API_KEY is configured');
    }
    config.dodo = {
      apiKey: result.data.DODO_API_KEY,
      baseUrl: result.data.DODO_BASE_URL,
      productIds: productIds ?? {},
      webhookSecret,
    };
  }

  if (result.data.DATABASE_URL !== undefined) config.databaseUrl = result.data.DATABASE_URL;
  return config;
}
