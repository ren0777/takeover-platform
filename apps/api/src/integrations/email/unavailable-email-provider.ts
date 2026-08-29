import type { EmailProvider } from './email-provider.js';

export class EmailDeliveryUnavailableError extends Error {
  readonly code = 'EMAIL_DELIVERY_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Production email delivery is not configured');
    this.name = 'EmailDeliveryUnavailableError';
  }
}

const unavailable = async (): Promise<never> => {
  throw new EmailDeliveryUnavailableError();
};

export const unavailableEmailProvider: EmailProvider = {
  sendVerification: unavailable,
  sendManagementLink: unavailable,
  sendAccessRequestNotification: unavailable,
  sendAccessDecisionNotification: unavailable,
};
