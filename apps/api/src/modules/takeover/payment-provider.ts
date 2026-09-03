import { ERROR_CODES } from '@takeover/shared';
import type { PaymentProvider, PaymentProviderCheckoutInput } from './service.js';

export class PaymentProviderUnavailableError extends Error {
  readonly code = ERROR_CODES.SERVICE_UNAVAILABLE;
  readonly statusCode = 503;

  constructor() {
    super('Payment provider is not configured');
    this.name = 'PaymentProviderUnavailableError';
  }
}

export class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = 'UNCONFIGURED';

  createCheckout(_input: PaymentProviderCheckoutInput): Promise<never> {
    throw new PaymentProviderUnavailableError();
  }
}
