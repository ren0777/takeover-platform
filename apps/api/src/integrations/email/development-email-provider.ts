import { randomUUID } from 'node:crypto';
import type {
  AccessDecisionEmail,
  AccessRequestEmail,
  EmailDeliveryResult,
  EmailProvider,
  ManagementLinkEmail,
  VerificationEmail,
} from './email-provider.js';

export type DevelopmentEmailMessage = {
  acceptedAt: Date;
  body: string;
  messageId: string;
  toEmail: string;
  type: 'verification' | 'management_link' | 'access_request' | 'access_decision';
};

export type DevelopmentEmailCapture = {
  clear(): void;
  get(messageId: string): DevelopmentEmailMessage | null;
  list(): DevelopmentEmailMessage[];
};

type DevelopmentEmailProviderOptions = {
  capacity?: number;
  createMessageId?: () => string;
  now?: () => Date;
  webAppOrigin: string;
};

function fragmentLink(origin: string, path: string, rawToken: string): string {
  return `${origin}${path}#token=${encodeURIComponent(rawToken)}`;
}

export function createDevelopmentEmailProvider(options: DevelopmentEmailProviderOptions): {
  capture: DevelopmentEmailCapture;
  provider: EmailProvider;
} {
  const capacity = options.capacity ?? 100;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error('Development email capture capacity must be a positive safe integer');
  }

  const createMessageId = options.createMessageId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const messages = new Map<string, DevelopmentEmailMessage>();

  const retain = (
    type: DevelopmentEmailMessage['type'],
    toEmail: string,
    body: string,
  ): EmailDeliveryResult => {
    const acceptedAt = now();
    const messageId = createMessageId();
    messages.set(messageId, { acceptedAt, body, messageId, toEmail, type });
    while (messages.size > capacity) {
      const oldestId = messages.keys().next().value as string | undefined;
      if (oldestId === undefined) break;
      messages.delete(oldestId);
    }
    return { acceptedAt, messageId };
  };

  const provider: EmailProvider = {
    async sendVerification(input: VerificationEmail) {
      return retain(
        'verification',
        input.toEmail,
        `Verify contact for ${input.companyName}: ${fragmentLink(options.webAppOrigin, '/verify', input.rawToken)}`,
      );
    },
    async sendManagementLink(input: ManagementLinkEmail) {
      return retain(
        'management_link',
        input.toEmail,
        `Manage ${input.companyName}: ${fragmentLink(options.webAppOrigin, '/manage', input.rawToken)}`,
      );
    },
    async sendAccessRequestNotification(input: AccessRequestEmail) {
      return retain(
        'access_request',
        input.toEmail,
        `${input.requesterEmail} requested access to ${input.companyName}: ${fragmentLink(options.webAppOrigin, '/access-review', input.rawReviewToken)}`,
      );
    },
    async sendAccessDecisionNotification(input: AccessDecisionEmail) {
      const continuation =
        input.rawManagementToken === undefined
          ? ''
          : ` ${fragmentLink(options.webAppOrigin, '/manage', input.rawManagementToken)}`;
      return retain(
        'access_decision',
        input.toEmail,
        `Access to ${input.companyName} was ${input.decision}.${continuation}`,
      );
    },
  };

  const capture: DevelopmentEmailCapture = {
    clear: () => messages.clear(),
    get: (messageId) => messages.get(messageId) ?? null,
    list: () => [...messages.values()],
  };

  return { capture, provider };
}
