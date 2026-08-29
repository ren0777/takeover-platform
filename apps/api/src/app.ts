import { ERROR_CODES, type ApiError } from '@takeover/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions, LogController } from 'fastify';
import type { ApiConfig } from './config/env.js';
import { healthPlugin } from './plugins/health.js';

export type BuildAppOptions = {
  logger?: FastifyServerOptions['logger'];
  nodeEnv?: ApiConfig['nodeEnv'];
  logLevel?: ApiConfig['logLevel'];
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const nodeEnv = options.nodeEnv ?? 'development';
  const logger =
    options.logger ??
    ({
      level: options.logLevel ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
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
    const statusCode =
      reportedStatusCode !== undefined && reportedStatusCode < 500 ? reportedStatusCode : 500;
    const isServerError = statusCode >= 500;
    if (isServerError) {
      request.log.error(
        { err: normalizedError, event: 'request.failed' },
        'Unhandled request error',
      );
    }

    const body: ApiError = {
      error: {
        code: isServerError ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_ERROR,
        message:
          isServerError && nodeEnv === 'production'
            ? 'Internal server error'
            : normalizedError.message,
        requestId: request.id,
      },
    };
    return reply.status(statusCode).send(body);
  });

  app.register(healthPlugin);
  return app;
}
