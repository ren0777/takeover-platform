import { ERROR_CODES, type ApiError } from '@takeover/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions, LogController } from 'fastify';
import { ZodError } from 'zod';
import type { ApiConfig } from './config/env.js';
import {
  createCompanyIdentityService,
  IdentityRateLimitError,
  type CompanyIdentityService,
} from './modules/company-identity/service.js';
import { PrismaCompanyIdentityRepository } from './modules/company-identity/prisma-repository.js';
import { PrismaTerritoryRepository } from './modules/territories/prisma-repository.js';
import { TerritoryService } from './modules/territories/service.js';
import { companyIdentityPlugin } from './plugins/company-identity.js';
import { databasePlugin } from './plugins/database.js';
import { emailPlugin } from './plugins/email.js';
import { healthPlugin } from './plugins/health.js';
import { territoriesPlugin } from './plugins/territories.js';
import { createOpaqueTokenService } from './security/opaque-token.js';

export type BuildAppOptions = {
  logger?: FastifyServerOptions['logger'];
  config?: ApiConfig;
  nodeEnv?: ApiConfig['nodeEnv'];
  logLevel?: ApiConfig['logLevel'];
  companyIdentity?: {
    config: ApiConfig['identity'];
    service: CompanyIdentityService;
  };
  territories?: {
    service: TerritoryService;
  };
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const runtimeConfig = options.config;
  const nodeEnv = runtimeConfig?.nodeEnv ?? options.nodeEnv ?? 'development';
  const logger =
    options.logger ??
    ({
      level: options.logLevel ?? 'info',
      redact: {
        paths: [
          'req.body.token',
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-csrf-token',
          'res.headers.set-cookie',
        ],
        censor: '[redacted]',
      },
    } satisfies FastifyServerOptions['logger']);

  const app = Fastify({
    logController: new LogController({ disableRequestLogging: nodeEnv === 'test' }),
    logger,
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ApiError = {
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Route not found',
        requestId: request.id,
      },
    };
    return reply.status(404).send(body);
  });

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error('Unknown request error');
    const reportedStatusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const isValidationError = error instanceof ZodError || normalizedError.name === 'ZodError';
    const statusCode = isValidationError ? 400 : (reportedStatusCode ?? 500);
    const isServerError = statusCode >= 500;
    if (isServerError) {
      request.log.error(
        { err: normalizedError, event: 'request.failed' },
        'Unhandled request error',
      );
    }

    const reportedCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      Object.values(ERROR_CODES).includes(
        error.code as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
      )
        ? error.code
        : undefined;
    const code =
      reportedCode ??
      (statusCode === 401 || statusCode === 403
        ? ERROR_CODES.AUTHORIZATION_REQUIRED
        : statusCode === 503
          ? ERROR_CODES.SERVICE_UNAVAILABLE
          : isServerError
            ? ERROR_CODES.INTERNAL_ERROR
            : ERROR_CODES.VALIDATION_ERROR);
    const body: ApiError = {
      error: {
        code,
        message:
          isServerError && nodeEnv === 'production'
            ? 'Internal server error'
            : normalizedError.message,
        requestId: request.id,
        ...(normalizedError instanceof IdentityRateLimitError
          ? { details: { retryAfterSeconds: normalizedError.retryAfterSeconds } }
          : {}),
      },
    };
    if (normalizedError instanceof IdentityRateLimitError) {
      reply.header('retry-after', String(normalizedError.retryAfterSeconds));
    }
    return reply.status(statusCode).send(body);
  });

  app.register(healthPlugin);
  if (options.companyIdentity !== undefined) {
    app.register(companyIdentityPlugin, {
      config: options.companyIdentity.config,
      nodeEnv,
      service: options.companyIdentity.service,
    });
  } else if (runtimeConfig?.databaseUrl !== undefined) {
    app.register(async (identityApp) => {
      await databasePlugin(identityApp);
      await emailPlugin(identityApp, runtimeConfig);
      const service = createCompanyIdentityService({
        clock: { now: () => new Date() },
        config: runtimeConfig.identity,
        emailProvider: identityApp.emailProvider,
        repository: new PrismaCompanyIdentityRepository(identityApp.database),
        tokens: createOpaqueTokenService(runtimeConfig.identity.tokenHmacSecret),
      });
      await companyIdentityPlugin(identityApp, {
        config: runtimeConfig.identity,
        nodeEnv,
        service,
      });
    });
  }
  if (options.territories !== undefined) {
    app.register(territoriesPlugin, { service: options.territories.service });
  } else if (runtimeConfig?.databaseUrl !== undefined) {
    app.register(async (territoryApp) => {
      await databasePlugin(territoryApp);
      const territoryService = new TerritoryService(
        new PrismaTerritoryRepository(territoryApp.database),
      );
      await territoriesPlugin(territoryApp, { service: territoryService });
    });
  }
  return app;
}
