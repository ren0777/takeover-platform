import type { FastifyInstance } from 'fastify';
import { dodoWebhookRoutes } from '../modules/takeover/dodo-webhook-routes.js';
import { takeoverRoutes, type TakeoverRoutesOptions } from '../modules/takeover/routes.js';
import { cookiesPlugin } from './cookies.js';

export async function takeoverPlugin(
  app: FastifyInstance,
  options: TakeoverRoutesOptions,
): Promise<void> {
  await app.register(async (webhookApp) => {
    await dodoWebhookRoutes(webhookApp, {
      service: options.service,
      ...(options.config.dodoWebhookSecret === undefined
        ? {}
        : { webhookSecret: options.config.dodoWebhookSecret }),
    });
  });
  await cookiesPlugin(app);
  await takeoverRoutes(app, options);
}
