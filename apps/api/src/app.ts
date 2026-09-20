import { ERROR_CODES, type ApiError } from '@takeover/shared';
import { getDatabaseClient } from '@takeover/database';
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
import { UnavailablePaymentProvider } from './modules/takeover/payment-provider.js';
import { DodoPaymentProvider } from './modules/takeover/providers/dodo/DodoPaymentProvider.js';
import { PrismaTakeoverRepository } from './modules/takeover/prisma-repository.js';
import { TakeoverReconciliationDriver } from './modules/takeover/reconciliation-driver.js';
import { TakeoverService } from './modules/takeover/service.js';
import { companyIdentityPlugin } from './plugins/company-identity.js';
import { databasePlugin } from './plugins/database.js';
import { emailPlugin } from './plugins/email.js';
import { healthPlugin } from './plugins/health.js';
import { takeoverPlugin } from './plugins/takeover.js';
import { territoriesPlugin } from './plugins/territories.js';
import { createOpaqueTokenService } from './security/opaque-token.js';
import { safeRequestUrl } from './security/request-log.js';
import { registerCompetition } from './modules/competition/routes.js';
import { registerOperatorRoutes } from './modules/operator/index.js';
import { PrismaOperatorRepository } from './modules/operator/prisma-repository.js';

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
  takeover?: {
    config: { dodoWebhookSecret?: string; webAppOrigin: string };
    identityService: CompanyIdentityService;
    reconciliationDriver?: {
      runOnce(): Promise<unknown>;
      start(): void;
      stop(): void;
    };
    service: TakeoverService;
  };
};

function registerTakeoverReconciliationDriver(
  app: FastifyInstance,
  driver: { runOnce(): Promise<unknown>; start(): void; stop(): void },
): void {
  app.addHook('onReady', async () => {
    void driver.runOnce().catch((error: unknown) => {
      app.log.error(
        { err: error, event: 'takeover.reconciliation.startup_failed' },
        'Takeover reconciliation startup sweep failed',
      );
    });
    driver.start();
  });
  app.addHook('onClose', async () => {
    driver.stop();
  });
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const runtimeConfig = options.config;
  const nodeEnv = runtimeConfig?.nodeEnv ?? options.nodeEnv ?? 'development';
  const logger =
    options.logger ??
    ({
      level: runtimeConfig?.logLevel ?? options.logLevel ?? 'info',
      serializers: {
        req: (request: { method: string; url: string; id: string }) => ({
          method: request.method, url: safeRequestUrl(request.url), id: request.id,
        }),
      },
      redact: {
        paths: [
          'req.body.token',
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.webhook-signature',
          'req.headers.x-csrf-token',
          'res.headers.set-cookie',
        ],
        censor: '[redacted]',
      },
    } satisfies FastifyServerOptions['logger']);

  const app = Fastify({
    bodyLimit: 262_144,
    connectionTimeout: 10_000,
    requestTimeout: 15_000,
    logController: new LogController({ disableRequestLogging: nodeEnv === 'test' }),
    logger,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    if (nodeEnv === 'production') reply.header('strict-transport-security', 'max-age=31536000');
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

  app.register(healthPlugin, runtimeConfig?.databaseUrl === undefined ? {} : {
    checkDatabase: async () => { await getDatabaseClient().$queryRaw`SELECT 1`; },
  });
  if (runtimeConfig?.databaseUrl !== undefined) {
    app.register(async (competitionApp) => {
      await registerCompetition(competitionApp, { prisma: getDatabaseClient(), config: runtimeConfig.competition });
    });
    if (runtimeConfig.operator !== undefined) {
      app.register(async (operatorApp) => {
        await registerOperatorRoutes(operatorApp, { config: runtimeConfig.operator!, repository: new PrismaOperatorRepository(getDatabaseClient()) });
      });
    }
  }
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
  if (options.takeover !== undefined) {
    app.register(takeoverPlugin, options.takeover);
    if (options.takeover.reconciliationDriver !== undefined) {
      registerTakeoverReconciliationDriver(app, options.takeover.reconciliationDriver);
    }
  } else if (runtimeConfig?.databaseUrl !== undefined) {
    app.register(async (takeoverApp) => {
      await databasePlugin(takeoverApp);
      await emailPlugin(takeoverApp, runtimeConfig);
      const identityService = createCompanyIdentityService({
        clock: { now: () => new Date() },
        config: runtimeConfig.identity,
        emailProvider: takeoverApp.emailProvider,
        repository: new PrismaCompanyIdentityRepository(takeoverApp.database),
        tokens: createOpaqueTokenService(runtimeConfig.identity.tokenHmacSecret),
      });
      // Determine which payment provider to use.
      const provider =
        runtimeConfig?.dodo?.apiKey && runtimeConfig?.dodo?.baseUrl
          ? new DodoPaymentProvider({
              apiKey: runtimeConfig.dodo.apiKey,
              baseUrl: runtimeConfig.dodo.baseUrl,
              productIds: runtimeConfig.dodo.productIds ?? {},
            })
          : new UnavailablePaymentProvider();

      const repository = new PrismaTakeoverRepository(takeoverApp.database);
      const service = new TakeoverService({
        clock: { now: () => new Date() },
        provider,

        repository,
        statusTokenSecret: runtimeConfig.identity.tokenHmacSecret,
        statusTokenTtlSeconds: 86_400,
        trustedWebOrigin: runtimeConfig.identity.webAppOrigin,
      });
      await takeoverPlugin(takeoverApp, {
        config: {
          ...(runtimeConfig.dodo?.webhookSecret === undefined
            ? {}
            : { dodoWebhookSecret: runtimeConfig.dodo.webhookSecret }),
          webAppOrigin: runtimeConfig.identity.webAppOrigin,
        },
        identityService,
        service,
      });
      if (runtimeConfig.dodo !== undefined && runtimeConfig.takeoverReconciliation.enabled) {
        registerTakeoverReconciliationDriver(
          takeoverApp,
          new TakeoverReconciliationDriver({
            batchSize: runtimeConfig.takeoverReconciliation.batchSize,
            clock: { now: () => new Date() },
            intervalMs: runtimeConfig.takeoverReconciliation.intervalSeconds * 1_000,
            logger: takeoverApp.log,
            repository,
            service,
          }),
        );
      }
    });
  }
  return app;
}
