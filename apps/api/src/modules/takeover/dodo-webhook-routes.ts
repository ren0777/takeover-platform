import { createHash } from 'node:crypto';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TakeoverService } from './service.js';

const DODO_PROVIDER = 'DODO';

const dodoEventSchema = z
  .object({
    data: z
      .object({
        amount: z.number().int().nonnegative().nullable().optional(),
        checkout_session_id: z.string().optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        metadata: z.record(z.string(), z.unknown()).default({}),
        payment_id: z.string().optional(),
        refund_id: z.string().optional(),
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

export type ProviderWebhookRoutesOptions = DodoWebhookRoutesOptions & {
  /** Provider name recorded on every ingested event. */
  provider: string;
  /** Route path this provider posts to. */
  path: string;
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
  await providerWebhookRoutes(app, {
    ...options,
    path: '/api/payment/webhooks/dodo',
    provider: DODO_PROVIDER,
  });
}

/**
 * One signed-webhook boundary, shared by every provider.
 *
 * Signature verification, replay identity (the webhook id), payload parsing
 * and the provider-neutral hand-off to the service are identical whichever
 * provider posts, so a local simulator exercises exactly the code a real
 * provider does.
 */
export async function providerWebhookRoutes(
  app: FastifyInstance,
  options: ProviderWebhookRoutesOptions,
): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post(options.path, async (request, reply) => {
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

    const event = dodoEventSchema.parse(parsed);
    const amountMinor = event.type.startsWith('refund.')
      ? event.data.amount
      : event.data.total_amount;
    await options.service.processVerifiedProviderWebhook({
      ...(amountMinor === undefined || amountMinor === null
        ? {}
        : { amountMinor: BigInt(amountMinor) }),
      ...(event.data.currency === undefined ? {} : { currency: event.data.currency }),
      eventType: event.type,
      metadata: event.data.metadata,
      payload: parsed,
      provider: options.provider,
      ...(event.data.checkout_session_id === undefined
        ? {}
        : { providerCheckoutId: event.data.checkout_session_id }),
      providerEventId: webhookId,
      ...(event.data.payment_id === undefined ? {} : { providerPaymentId: event.data.payment_id }),
      ...(event.data.refund_id === undefined ? {} : { providerRefundId: event.data.refund_id }),
      signatureDigest: signatureDigest(webhookSignature),
    });

    return reply.status(200).send({ received: true });
  });
}
