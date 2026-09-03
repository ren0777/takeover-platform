import { createHash } from 'node:crypto';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TakeoverService } from './service.js';

const DODO_PROVIDER = 'DODO';

const dodoPaymentEventSchema = z
  .object({
    data: z
      .object({
        checkout_session_id: z.string().optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        metadata: z.record(z.string(), z.unknown()).default({}),
        payment_id: z.string().optional(),
        status: z.string().optional(),
        total_amount: z.number().int().nonnegative().optional(),
      })
      .passthrough(),
    type: z.string(),
  })
  .passthrough();

export class DodoWebhookSignatureError extends Error {
  readonly statusCode = 401;

  constructor() {
    super('Invalid Dodo webhook signature');
    this.name = 'DodoWebhookSignatureError';
  }
}

export type DodoWebhookRoutesOptions = {
  service: Pick<TakeoverService, 'processVerifiedProviderWebhook'>;
  webhookSecret?: string;
};

function requiredHeader(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new DodoWebhookSignatureError();
  return value;
}

function rawPayload(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  throw new Error('Dodo webhook route requires raw request body');
}

function signatureDigest(signature: string): Uint8Array {
  return createHash('sha256').update(signature).digest();
}

export async function dodoWebhookRoutes(
  app: FastifyInstance,
  options: DodoWebhookRoutesOptions,
): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/api/payment/webhooks/dodo', async (request, reply) => {
    if (options.webhookSecret === undefined) {
      return reply.status(503).send({ received: false });
    }

    const webhookId = requiredHeader(request.headers['webhook-id']);
    const webhookSignature = requiredHeader(request.headers['webhook-signature']);
    const webhookTimestamp = requiredHeader(request.headers['webhook-timestamp']);
    const body = rawPayload(request.body);

    try {
      new Webhook(options.webhookSecret).verify(
        body,
        {
          'webhook-id': webhookId,
          'webhook-signature': webhookSignature,
          'webhook-timestamp': webhookTimestamp,
        },
        { jsonParse: false },
      );
    } catch (error) {
      if (error instanceof WebhookVerificationError || error instanceof SyntaxError) {
        throw new DodoWebhookSignatureError();
      }
      throw new DodoWebhookSignatureError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      return reply.status(400).send({ received: false });
    }

    const event = dodoPaymentEventSchema.parse(parsed);
    await options.service.processVerifiedProviderWebhook({
      ...(event.data.total_amount === undefined
        ? {}
        : { amountMinor: BigInt(event.data.total_amount) }),
      ...(event.data.currency === undefined ? {} : { currency: event.data.currency }),
      eventType: event.type,
      metadata: event.data.metadata,
      payload: parsed,
      provider: DODO_PROVIDER,
      ...(event.data.checkout_session_id === undefined
        ? {}
        : { providerCheckoutId: event.data.checkout_session_id }),
      providerEventId: webhookId,
      ...(event.data.payment_id === undefined ? {} : { providerPaymentId: event.data.payment_id }),
      signatureDigest: signatureDigest(webhookSignature),
    });

    return reply.status(200).send({ received: true });
  });
}
