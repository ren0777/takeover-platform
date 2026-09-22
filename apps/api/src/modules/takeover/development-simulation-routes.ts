import { randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertTrustedMutationOrigin } from '../../security/request-origin.js';
import {
  MANAGEMENT_CSRF_COOKIE_NAME,
  MANAGEMENT_SESSION_COOKIE_NAME,
} from '../../security/session-cookie.js';
import { ManagementAuthorizationRequiredError } from '../company-identity/authorization.js';
import type { CompanyIdentityService } from '../company-identity/service.js';
import {
  DEVELOPMENT_PAYMENT_OUTCOMES,
  simulatedEventsFor,
  type DevelopmentPaymentOutcome,
} from './providers/development/DevelopmentPaymentProvider.js';

/**
 * DEV ONLY — drives the local payment simulator.
 *
 * This route never touches payment, capture or ownership rows. It looks up the
 * attempt behind a status token, builds a provider event from the *stored
 * quote*, signs it, and posts it to the normal signed webhook route. Every
 * consequence therefore happens in the real ingestion, capture and
 * reconciliation services, exactly as a provider callback would.
 *
 * It is registered only when the development provider is explicitly enabled,
 * which configuration forbids under NODE_ENV=production.
 */

const simulationRequestSchema = z
  .object({
    outcome: z.enum(DEVELOPMENT_PAYMENT_OUTCOMES),
    statusToken: z.string().regex(/^[A-Za-z0-9_-]{43,}$/),
  })
  .strict();

export type DevelopmentSimulationTarget = {
  amountMinor: bigint;
  checkoutId: string;
  currency: string;
  providerCheckoutId: string;
  quoteId: string;
};

export type DevelopmentSimulationRoutesOptions = {
  identityService: Pick<CompanyIdentityService, 'getManagementContext'>;
  /** Resolves the immutable quote behind a status token, scoped to the caller. */
  resolveTarget(
    statusToken: string,
    companyId: string,
  ): Promise<DevelopmentSimulationTarget | null>;
  webAppOrigin: string;
  /** Per-process secret for signing simulated events; never persisted. */
  webhookSecret: string;
  webhookPath: string;
};

function requiredCookie(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new ManagementAuthorizationRequiredError();
  return value;
}

/**
 * The event body a provider would send. The amount and currency come from the
 * stored quote, never from the request, so a simulated payment can never differ
 * from what the server itself priced.
 */
function buildEventPayload(input: {
  amountMinor: bigint | null;
  currency: string;
  eventType: string;
  providerCheckoutId: string;
  providerPaymentId: string;
  target: DevelopmentSimulationTarget;
}): Record<string, unknown> {
  return {
    data: {
      checkout_session_id: input.providerCheckoutId,
      currency: input.currency,
      metadata: {
        amount_minor: Number(input.target.amountMinor),
        checkout_id: input.target.checkoutId,
        currency: input.target.currency,
        quote_id: input.target.quoteId,
        simulated: 'DEV ONLY - no real charge',
      },
      payment_id: input.providerPaymentId,
      ...(input.amountMinor === null ? {} : { total_amount: Number(input.amountMinor) }),
    },
    type: input.eventType,
  };
}

export async function developmentSimulationRoutes(
  app: FastifyInstance,
  options: DevelopmentSimulationRoutesOptions,
): Promise<void> {
  const signer = new Webhook(options.webhookSecret);

  app.post('/api/dev/payment-simulations', async (request, reply) => {
    // Exactly the guards every other mutation uses: no dev shortcut.
    assertTrustedMutationOrigin(
      typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      options.webAppOrigin,
    );
    const sessionToken = requiredCookie(request.cookies[MANAGEMENT_SESSION_COOKIE_NAME]);
    const csrfCookie = requiredCookie(request.cookies[MANAGEMENT_CSRF_COOKIE_NAME]);
    const csrfToken = requiredCookie(
      typeof request.headers['x-csrf-token'] === 'string'
        ? request.headers['x-csrf-token']
        : undefined,
    );
    if (csrfCookie !== csrfToken) throw new ManagementAuthorizationRequiredError();
    const context = await options.identityService.getManagementContext(sessionToken, csrfToken);

    const input = simulationRequestSchema.parse(request.body);
    const target = await options.resolveTarget(input.statusToken, context.company.id);
    if (target === null) return reply.status(404).send({ error: { code: 'NOT_FOUND' } });

    const deliveries: Array<{ eventType: string; status: number }> = [];
    for (const event of simulatedEventsFor(input.outcome as DevelopmentPaymentOutcome)) {
      const payload = buildEventPayload({
        amountMinor: event.includeMoney ? target.amountMinor : null,
        currency: target.currency,
        eventType: event.eventType,
        providerCheckoutId: target.providerCheckoutId,
        providerPaymentId: event.providerPaymentId,
        target,
      });
      const body = JSON.stringify(payload);
      const timestamp = new Date();
      const signature = signer.sign(event.eventId, timestamp, body);
      // Dispatched through the app's own webhook route: real signature
      // verification, real replay identity, real ingestion. No network.
      const response = await app.inject({
        headers: {
          'content-type': 'application/json',
          'webhook-id': event.eventId,
          'webhook-signature': signature,
          'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        },
        method: 'POST',
        payload: body,
        url: options.webhookPath,
      });
      deliveries.push({ eventType: event.eventType, status: response.statusCode });
    }

    return reply.status(202).send({
      data: {
        deliveries,
        outcome: input.outcome,
        simulated: true,
        warning: 'DEV ONLY - no real charge was made',
      },
      meta: { requestId: request.id },
    });
  });
}

/** A per-process signing secret. Never written to disk or configuration. */
export function createDevelopmentWebhookSecret(): string {
  return `whsec_${Buffer.from(`${randomUUID()}${randomUUID()}`).toString('base64')}`;
}
