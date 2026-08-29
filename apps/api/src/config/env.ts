import { Buffer } from 'node:buffer';
import { z } from 'zod';

const DEVELOPMENT_TOKEN_SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveSeconds = z.coerce.number().int().positive();

function decodedSecret(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length >= 32 ? new Uint8Array(bytes) : null;
}

const apiEnvironmentSchema = z
  .object({
    ACCESS_REQUEST_TTL_SECONDS: positiveSeconds.default(604_800),
    ACCESS_REQUESTS_PER_CONTACT_COMPANY_PER_DAY: positiveSeconds.default(3),
    ACCESS_REQUESTS_PER_IP_PER_HOUR: positiveSeconds.default(10),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z.url().optional(),
    DEV_EMAIL_CAPTURE_ENABLED: booleanString.default(false),
    DRAFT_TTL_SECONDS: positiveSeconds.default(86_400),
    EMAIL_PROVIDER: z.enum(['development', 'unavailable']).default('development'),
    EMAIL_VERIFICATION_TTL_SECONDS: positiveSeconds.default(900),
    LINK_ISSUANCE_PER_EMAIL_PER_HOUR: positiveSeconds.default(5),
    LINK_ISSUANCE_PER_IP_PER_HOUR: positiveSeconds.default(20),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MANAGEMENT_LINK_TTL_SECONDS: positiveSeconds.default(900),
    MANAGEMENT_SESSION_TTL_SECONDS: positiveSeconds.default(28_800),
    MANAGER_NOTIFICATION_COOLDOWN_SECONDS: positiveSeconds.default(3_600),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RECOVERY_REQUEST_TTL_SECONDS: positiveSeconds.default(604_800),
    RECOVERY_REQUESTS_PER_CONTACT_COMPANY_PER_DAY: positiveSeconds.default(2),
    TOKEN_EXCHANGE_ATTEMPTS_PER_IP_PER_HOUR: positiveSeconds.default(60),
    TOKEN_EXCHANGE_FAILURES_PER_SELECTOR: positiveSeconds.default(10),
    TOKEN_HMAC_SECRET: z.string().default(DEVELOPMENT_TOKEN_SECRET),
    WEB_APP_ORIGIN: z.url().default('http://localhost:3000'),
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
    if (webUrl.origin !== value.WEB_APP_ORIGIN.replace(/\/$/, '')) {
      context.addIssue({
        code: 'custom',
        message: 'must be an origin without path, query, or fragment',
        path: ['WEB_APP_ORIGIN'],
      });
    }

    if (value.NODE_ENV === 'production') {
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
      if (webUrl.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          message: 'must use HTTPS in production',
          path: ['WEB_APP_ORIGIN'],
        });
      }
    }
  });

export type IdentityConfig = Readonly<{
  accessRequestTtlSeconds: number;
  developmentEmailCaptureEnabled: boolean;
  draftTtlSeconds: number;
  emailProvider: 'development' | 'unavailable';
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
  recoveryRequestTtlSeconds: number;
  tokenHmacSecret: Uint8Array;
  webAppOrigin: string;
}>;

export type ApiConfig = {
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl?: string;
  identity: IdentityConfig;
};

export function parseApiConfig(source: NodeJS.ProcessEnv): ApiConfig {
  const result = apiEnvironmentSchema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(
      ', ',
    );
    throw new Error(`Invalid API configuration: ${fields}`);
  }

  const tokenHmacSecret = decodedSecret(result.data.TOKEN_HMAC_SECRET);
  if (tokenHmacSecret === null) throw new Error('Invalid API configuration: TOKEN_HMAC_SECRET');

  const rateLimits = Object.freeze({
    accessRequestsPerContactCompanyPerDay:
      result.data.ACCESS_REQUESTS_PER_CONTACT_COMPANY_PER_DAY,
    accessRequestsPerIpPerHour: result.data.ACCESS_REQUESTS_PER_IP_PER_HOUR,
    linkIssuancePerEmailPerHour: result.data.LINK_ISSUANCE_PER_EMAIL_PER_HOUR,
    linkIssuancePerIpPerHour: result.data.LINK_ISSUANCE_PER_IP_PER_HOUR,
    managerNotificationCooldownSeconds: result.data.MANAGER_NOTIFICATION_COOLDOWN_SECONDS,
    recoveryRequestsPerContactCompanyPerDay:
      result.data.RECOVERY_REQUESTS_PER_CONTACT_COMPANY_PER_DAY,
    tokenExchangeAttemptsPerIpPerHour: result.data.TOKEN_EXCHANGE_ATTEMPTS_PER_IP_PER_HOUR,
    tokenExchangeFailuresPerSelector: result.data.TOKEN_EXCHANGE_FAILURES_PER_SELECTOR,
  });
  const identity: IdentityConfig = Object.freeze({
    accessRequestTtlSeconds: result.data.ACCESS_REQUEST_TTL_SECONDS,
    developmentEmailCaptureEnabled: result.data.DEV_EMAIL_CAPTURE_ENABLED,
    draftTtlSeconds: result.data.DRAFT_TTL_SECONDS,
    emailProvider: result.data.EMAIL_PROVIDER,
    emailVerificationTtlSeconds: result.data.EMAIL_VERIFICATION_TTL_SECONDS,
    managementLinkTtlSeconds: result.data.MANAGEMENT_LINK_TTL_SECONDS,
    managementSessionTtlSeconds: result.data.MANAGEMENT_SESSION_TTL_SECONDS,
    rateLimits,
    recoveryRequestTtlSeconds: result.data.RECOVERY_REQUEST_TTL_SECONDS,
    tokenHmacSecret,
    webAppOrigin: result.data.WEB_APP_ORIGIN.replace(/\/$/, ''),
  });
  const config: ApiConfig = {
    host: result.data.API_HOST,
    identity,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.API_PORT,
  };

  if (result.data.DATABASE_URL !== undefined) config.databaseUrl = result.data.DATABASE_URL;
  return config;
}
