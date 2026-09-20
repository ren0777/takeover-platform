import type {
  AccessDecisionEmail,
  AccessRequestEmail,
  EmailDeliveryResult,
  EmailProvider,
  ManagementLinkEmail,
  VerificationEmail,
} from './email-provider.js';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;

export class ProductionEmailDeliveryError extends Error {
  readonly code = 'EMAIL_DELIVERY_FAILED';

  constructor(message = 'Production email delivery failed') {
    super(message);
    this.name = 'ProductionEmailDeliveryError';
  }
}

export type ProductionEmailProviderOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  fromEmail: string;
  now?: () => Date;
  timeoutMs?: number;
  webAppOrigin: string;
};

type ResendEmail = {
  from: string;
  subject: string;
  text: string;
  to: string[];
};

function fragmentLink(origin: string, path: string, rawToken: string): string {
  return `${origin}${path}#token=${encodeURIComponent(rawToken)}`;
}

function safeDisplayText(value: string): string {
  // eslint-disable-next-line no-control-regex -- Deliberately remove controls from email display text.
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

function required(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} is required`);
  return value;
}

function webOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value) {
    throw new Error('Production email web app origin must be an HTTPS origin');
  }
  return value;
}

export function createProductionEmailProvider(
  options: ProductionEmailProviderOptions,
): EmailProvider {
  const apiKey = required(options.apiKey, 'Production email API key');
  const fromEmail = required(options.fromEmail, 'Production email from address');
  const origin = webOrigin(options.webAppOrigin);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('Production email timeout must be a positive safe integer');
  }

  async function send(
    toEmail: string,
    subject: string,
    text: string,
  ): Promise<EmailDeliveryResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(RESEND_EMAILS_ENDPOINT, {
        body: JSON.stringify({ from: fromEmail, subject, text, to: [toEmail] } satisfies ResendEmail),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        method: 'POST', redirect: 'error', signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProductionEmailDeliveryError(`Production email delivery failed with provider status ${response.status}`);
      }
      let body: unknown;
      try {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing body');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 8192) { await reader.cancel(); throw new Error('Oversized body'); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new ProductionEmailDeliveryError('Production email provider returned an invalid response');
      }
      if (typeof body !== 'object' || body === null || !('id' in body) ||
          typeof body.id !== 'string' || body.id.length === 0 || body.id.length > 256) {
        throw new ProductionEmailDeliveryError('Production email provider returned an invalid response');
      }
      return { acceptedAt: now(), messageId: body.id };
    } catch (error) {
      if (error instanceof ProductionEmailDeliveryError) throw error;
      throw new ProductionEmailDeliveryError();
    } finally { clearTimeout(timeout); }
  }

  return {
    sendVerification(input: VerificationEmail) {
      return send(
        input.toEmail,
        'Verify your TakeOver contact',
        `Verify contact for ${safeDisplayText(input.companyName)}: ${fragmentLink(origin, '/verify', input.rawToken)}`,
      );
    },
    sendManagementLink(input: ManagementLinkEmail) {
      const companyName = safeDisplayText(input.companyName);
      return send(
        input.toEmail,
        `Manage ${companyName} on TakeOver`,
        `Manage ${companyName}: ${fragmentLink(origin, '/manage', input.rawToken)}`,
      );
    },
    sendAccessRequestNotification(input: AccessRequestEmail) {
      return send(
        input.toEmail,
        'Review a TakeOver access request',
        `${safeDisplayText(input.requesterEmail)} requested access to ${safeDisplayText(input.companyName)}: ${fragmentLink(origin, '/access-review', input.rawReviewToken)}`,
      );
    },
    sendAccessDecisionNotification(input: AccessDecisionEmail) {
      const continuation =
        input.rawManagementToken === undefined
          ? ''
          : ` ${fragmentLink(origin, '/manage', input.rawManagementToken)}`;
      return send(
        input.toEmail,
        `TakeOver access request ${input.decision}`,
        `Access to ${safeDisplayText(input.companyName)} was ${input.decision}.${continuation}`,
      );
    },
  };
}
