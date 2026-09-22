import { randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  PaymentProviderCheckoutInput,
  PaymentProviderCheckoutResult,
  PaymentProviderRefundInput,
  PaymentProviderRefundLookupInput,
  PaymentProviderRefundResult,
} from '../../service.js';

/**
 * A local, deterministic stand-in for a real payment provider.
 *
 * DEV ONLY — it never contacts a network, never moves money, and never issues
 * a real charge. It exists so the whole checkout -> confirmed payment ->
 * capture -> ownership -> next price flow can be exercised without provider
 * credentials. Configuration refuses to select it under NODE_ENV=production.
 *
 * It implements the same `PaymentProvider` boundary a real adapter does, so
 * the core checkout, webhook, reconciliation and capture services are used
 * unchanged. Outcomes are driven by signed webhooks through the normal webhook
 * route, never by writing to the database directly.
 */
export const DEVELOPMENT_PROVIDER_NAME = 'DEVELOPMENT';

/**
 * A deliberately unreachable host (RFC 2606 `.invalid`). It satisfies the
 * HTTPS-only checkout contract while guaranteeing that a browser which somehow
 * followed it would reach nothing at all. The UI never navigates here: the
 * checkout response is marked `simulated`, and the browser goes to the app's
 * own status page instead.
 */
const SIMULATED_CHECKOUT_ORIGIN = 'https://dev-payment-simulator.invalid';

export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = DEVELOPMENT_PROVIDER_NAME;

  /** Idempotent per checkoutId, exactly as the real adapters must be. */
  async createCheckout(
    input: PaymentProviderCheckoutInput,
  ): Promise<PaymentProviderCheckoutResult> {
    return {
      providerCheckoutId: input.checkoutId,
      providerCheckoutUrl: `${SIMULATED_CHECKOUT_ORIGIN}/checkout/${encodeURIComponent(input.checkoutId)}`,
    };
  }

  /**
   * Refunds resolve immediately and locally. No money exists to return; this
   * only lets the existing refund and reconciliation paths be exercised.
   */
  async refundPayment(input: PaymentProviderRefundInput): Promise<PaymentProviderRefundResult> {
    return { providerRefundId: `dev-refund-${input.paymentId}`, status: 'succeeded' };
  }

  /**
   * The simulator keeps no provider-side ledger, so it can never claim a
   * refund exists. Returning null makes the caller fall back to its own
   * durable state rather than trusting an invented provider record.
   */
  async lookupRefund(
    _input: PaymentProviderRefundLookupInput,
  ): Promise<PaymentProviderRefundResult | null> {
    return null;
  }
}

/** The outcomes a developer can drive from the local simulation panel. */
export const DEVELOPMENT_PAYMENT_OUTCOMES = [
  'success',
  'failure',
  'pending',
  'unknown',
  'duplicate_success',
  'late_failure',
] as const;
export type DevelopmentPaymentOutcome = (typeof DEVELOPMENT_PAYMENT_OUTCOMES)[number];

export type SimulatedEvent = {
  eventId: string;
  eventType: string;
  includeMoney: boolean;
  providerPaymentId: string;
};

/**
 * The exact sequence of provider events an outcome sends, in order.
 *
 * Every event is delivered through the signed webhook route, so ordering,
 * replay and duplicate handling are exercised by the real ingestion path.
 */
export function simulatedEventsFor(
  outcome: DevelopmentPaymentOutcome,
  providerPaymentId = `dev-payment-${randomUUID()}`,
): SimulatedEvent[] {
  const event = (eventType: string, includeMoney: boolean): SimulatedEvent => ({
    eventId: `dev-event-${randomUUID()}`,
    eventType,
    includeMoney,
    providerPaymentId,
  });
  switch (outcome) {
    case 'success':
      return [event('payment.succeeded', true)];
    case 'failure':
      return [event('payment.failed', true)];
    case 'pending':
      // Non-terminal: recorded as an auditable receipt, never a charge.
      return [event('payment.processing', false)];
    case 'unknown':
      // An event type the processor does not recognise; it must be ignored
      // rather than guessed at in either direction.
      return [event('payment.unknown_state', false)];
    case 'duplicate_success':
      // The same settled payment announced twice under different event ids.
      return [event('payment.succeeded', true), event('payment.succeeded', true)];
    case 'late_failure':
      // A failure arriving after the money already settled must not undo it.
      return [event('payment.succeeded', true), event('payment.failed', true)];
  }
}
