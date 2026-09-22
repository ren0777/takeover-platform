import type { FastifyInstance } from 'fastify';
import {
  dodoWebhookRoutes,
  providerWebhookRoutes,
} from '../modules/takeover/dodo-webhook-routes.js';
import { developmentSimulationRoutes } from '../modules/takeover/development-simulation-routes.js';
import { DEVELOPMENT_PROVIDER_NAME } from '../modules/takeover/providers/development/DevelopmentPaymentProvider.js';
import { takeoverRoutes, type TakeoverRoutesOptions } from '../modules/takeover/routes.js';
import { cookiesPlugin } from './cookies.js';

export const DEVELOPMENT_WEBHOOK_PATH = '/api/payment/webhooks/development';

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
  // DEV ONLY: the simulator posts signed events to its own provider path,
  // through the same verification and ingestion the real route uses. Neither
  // this route nor the simulation endpoint exists unless configuration
  // explicitly enabled the simulator, which production refuses.
  if (options.config.developmentPayments !== undefined) {
    const { webhookSecret } = options.config.developmentPayments;
    await app.register(async (webhookApp) => {
      await providerWebhookRoutes(webhookApp, {
        path: DEVELOPMENT_WEBHOOK_PATH,
        provider: DEVELOPMENT_PROVIDER_NAME,
        service: options.service,
        webhookSecret,
      });
    });
  }
  await cookiesPlugin(app);
  if (options.config.developmentPayments !== undefined) {
    await developmentSimulationRoutes(app, {
      identityService: options.identityService,
      resolveTarget: (statusToken, companyId) =>
        options.service.findSimulationTarget(statusToken, companyId),
      webAppOrigin: options.config.webAppOrigin,
      webhookPath: DEVELOPMENT_WEBHOOK_PATH,
      webhookSecret: options.config.developmentPayments.webhookSecret,
    });
  }
  await takeoverRoutes(app, options);
}
