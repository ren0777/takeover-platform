import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config/env.js';
import {
  createDevelopmentEmailProvider,
  type DevelopmentEmailCapture,
} from '../integrations/email/development-email-provider.js';
import type { EmailProvider } from '../integrations/email/email-provider.js';
import { unavailableEmailProvider } from '../integrations/email/unavailable-email-provider.js';
import { createProductionEmailProvider } from '../integrations/email/production-email-provider.js';
import { developmentEmailCapturePlugin } from './development-email-capture.js';

declare module 'fastify' {
  interface FastifyInstance {
    emailProvider: EmailProvider;
  }
}

export type EmailPluginOptions = Pick<ApiConfig, 'host' | 'nodeEnv'> & {
  identity: ApiConfig['identity'];
};

export async function emailPlugin(
  app: FastifyInstance,
  options: EmailPluginOptions,
): Promise<DevelopmentEmailCapture | null> {
  if (options.identity.emailProvider === 'resend') {
    if (!options.identity.productionEmail) throw new Error('Production email configuration is required');
    app.decorate('emailProvider', createProductionEmailProvider({
      ...options.identity.productionEmail, webAppOrigin: options.identity.webAppOrigin,
    }));
    return null;
  }
  if (options.identity.emailProvider === 'unavailable') {
    app.decorate('emailProvider', unavailableEmailProvider);
    return null;
  }

  const { capture, provider } = createDevelopmentEmailProvider({
    // Opt-in only; parseApiConfig rejects it under NODE_ENV=production.
    ...(options.identity.developmentEmailLogEnabled ? { logger: app.log } : {}),
    webAppOrigin: options.identity.webAppOrigin,
  });
  app.decorate('emailProvider', provider);
  await developmentEmailCapturePlugin(app, {
    apiHost: options.host,
    capture,
    enabled: options.identity.developmentEmailCaptureEnabled,
    nodeEnv: options.nodeEnv,
  });
  return capture;
}
