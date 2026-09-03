import type {
  PaymentProvider,
  PaymentProviderCheckoutInput,
  PaymentProviderCheckoutResult,
  PaymentProviderRefundInput,
  PaymentProviderRefundResult,
} from '../../service.js';
import { PaymentProviderRefundError } from '../../service.js';
import { URL } from 'node:url';

/**
 * Dodo Payments provider implementation.
 */
export class DodoPaymentProvider implements PaymentProvider {
  readonly name = 'DODO';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly productIds: Record<string, string>;

  constructor(options: { apiKey: string; baseUrl: string; productIds: Record<string, string> }) {
    this.apiKey = options.apiKey;
    // Ensure no trailing slash – we will append "/checkouts" ourselves.
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.productIds = options.productIds ?? {};
    if (Object.keys(this.productIds).length === 0) {
      throw new Error('DodoPaymentProvider: no product IDs configured');
    }
  }

  /**
   * Create a checkout session with Dodo.
   */
  async createCheckout(
    input: PaymentProviderCheckoutInput,
  ): Promise<PaymentProviderCheckoutResult> {
    const productId = this.productIds[input.amount.currency];
    if (!productId) {
      throw new Error(`Unsupported currency for Dodo checkout: ${input.amount.currency}`);
    }

    const requestBody = {
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
          amount: input.amount.amountMinor,
        },
      ],
      return_url: input.returnUrl,
      cancel_url: input.returnUrl,
      metadata: {
        checkout_id: input.checkoutId,
        quote_id: input.quoteId,
        amount_minor: input.amount.amountMinor,
        currency: input.amount.currency,
      },
    };

    const endpoint = `${this.baseUrl}/checkouts`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Dodo checkout request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Dodo checkout failed: ${response.status} ${errorBody}`);
    }

    const data = (await response.json()) as { checkout_url?: unknown; session_id?: unknown };
    const providerCheckoutId = data.session_id;
    const providerCheckoutUrl = data.checkout_url;

    if (typeof providerCheckoutId !== 'string' || providerCheckoutId.length === 0) {
      throw new Error('Dodo checkout response missing providerCheckoutId');
    }
    if (typeof providerCheckoutUrl !== 'string' || providerCheckoutUrl.length === 0) {
      throw new Error('Dodo checkout response missing providerCheckoutUrl');
    }

    const parsedUrl = new URL(providerCheckoutUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Provider checkout URL is not HTTPS');
    }

    return {
      providerCheckoutId,
      providerCheckoutUrl,
    };
  }

  async refundPayment(input: PaymentProviderRefundInput): Promise<PaymentProviderRefundResult> {
    const requestBody = {
      payment_id: input.providerPaymentId,
      metadata: {
        amount_minor: input.amount.amountMinor,
        currency: input.amount.currency,
        payment_id: input.paymentId,
      },
      reason: input.reason,
    };

    const endpoint = `${this.baseUrl}/refunds`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PaymentProviderRefundError('Dodo refund request timed out', { retryable: true });
      }
      throw new PaymentProviderRefundError('Dodo refund request failed', { retryable: true });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new PaymentProviderRefundError(
        `Dodo refund request failed with status ${response.status}`,
        { retryable: response.status === 429 || response.status >= 500 },
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Dodo refund response was malformed');
    }

    if (!isDodoRefundResponse(data)) {
      throw new Error('Dodo refund response was malformed');
    }
    if (data.payment_id !== input.providerPaymentId) {
      throw new Error('Dodo refund response payment mismatch');
    }

    return {
      providerRefundId: data.refund_id,
      status: data.status,
    };
  }
}

function isDodoRefundResponse(value: unknown): value is {
  payment_id: string;
  refund_id: string;
  status: 'succeeded' | 'failed' | 'pending' | 'review';
} {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.payment_id === 'string' &&
    typeof record.refund_id === 'string' &&
    (record.status === 'succeeded' ||
      record.status === 'failed' ||
      record.status === 'pending' ||
      record.status === 'review')
  );
}
