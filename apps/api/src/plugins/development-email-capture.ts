import type { FastifyInstance } from 'fastify';
import type { DevelopmentEmailCapture } from '../integrations/email/development-email-provider.js';

type DevelopmentEmailCapturePluginOptions = {
  apiHost: string;
  capture: DevelopmentEmailCapture;
  enabled: boolean;
  nodeEnv: 'development' | 'test' | 'production';
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export async function developmentEmailCapturePlugin(
  app: FastifyInstance,
  options: DevelopmentEmailCapturePluginOptions,
): Promise<void> {
  if (
    options.nodeEnv !== 'development' ||
    !options.enabled ||
    !LOOPBACK_HOSTS.has(options.apiHost)
  ) {
    return;
  }

  app.get<{ Params: { messageId: string } }>(
    '/__dev/email-captures/:messageId',
    async (request, reply) => {
      const message = options.capture.get(request.params.messageId);
      reply.headers({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      if (message === null) return reply.status(404).send({ error: 'Capture not found' });
      return reply.send(message);
    },
  );
}
