import { ERROR_CODES } from '@takeover/shared';

/**
 * Copy for a failed quote or checkout attempt.
 *
 * Pure and table-driven so the panel holds no judgement of its own. Every
 * entry states plainly whether money moved, because that is the only question
 * a person actually has at this point in the flow.
 */
export type QuoteFailure = {
  title: string;
  message: string;
  /** Retrying the same call could plausibly succeed. */
  canRetry: boolean;
  /** The amount is no longer trustworthy: a fresh quote is required. */
  requiresNewQuote: boolean;
};

const FAILURES: Record<string, QuoteFailure> = {
  [ERROR_CODES.TAKEOVER_PRICE_CHANGED]: {
    title: 'The price changed',
    message:
      'The amount to take over this territory moved while you were reviewing it. Nothing was charged. Check the new amount before continuing.',
    canRetry: false,
    requiresNewQuote: true,
  },
  [ERROR_CODES.STALE_TERRITORY_VERSION]: {
    title: 'This territory changed',
    message:
      'The territory was updated while you were reviewing it, so this quote no longer applies. Nothing was charged.',
    canRetry: false,
    requiresNewQuote: true,
  },
  [ERROR_CODES.TERRITORY_DISABLED]: {
    title: 'This territory is unavailable',
    message: 'It cannot be taken over right now. Nothing was charged.',
    canRetry: false,
    requiresNewQuote: false,
  },
  [ERROR_CODES.TERRITORY_NOT_FOUND]: {
    title: 'This territory no longer exists',
    message: 'Nothing was charged.',
    canRetry: false,
    requiresNewQuote: false,
  },
  [ERROR_CODES.AUTHORIZATION_REQUIRED]: {
    title: 'Your management session has ended',
    message:
      'Taking over a territory acts for your company, so you need an active management session. Nothing was charged.',
    canRetry: false,
    requiresNewQuote: false,
  },
  [ERROR_CODES.CONTACT_VERIFICATION_REQUIRED]: {
    title: 'Verify your contact email first',
    message: 'Open the link sent to your contact email, then come back. Nothing was charged.',
    canRetry: false,
    requiresNewQuote: false,
  },
  [ERROR_CODES.COMPANY_ACCESS_PENDING]: {
    title: 'Waiting on a manager',
    message:
      'A manager of your company must approve your access before you can take over a territory. Nothing has been charged.',
    canRetry: false,
    requiresNewQuote: false,
  },
  [ERROR_CODES.COMPANY_ACCESS_DENIED]: {
    title: 'Access was not granted',
    message: 'A manager of this company declined the request. Nothing was charged.',
    canRetry: false,
    requiresNewQuote: false,
  },
  [ERROR_CODES.RATE_LIMITED]: {
    title: 'Too many attempts',
    message: 'Wait a little while before trying again. Nothing was charged.',
    canRetry: true,
    requiresNewQuote: false,
  },
  [ERROR_CODES.SERVICE_UNAVAILABLE]: {
    title: 'The service is unavailable',
    message: 'We could not reach the service, so nothing was started and nothing was charged.',
    canRetry: true,
    requiresNewQuote: false,
  },
  [ERROR_CODES.VALIDATION_ERROR]: {
    title: 'This request was not accepted',
    message: 'The service rejected the request, and nothing was charged.',
    canRetry: false,
    requiresNewQuote: true,
  },
};

const FALLBACK: QuoteFailure = {
  title: 'This did not complete',
  message: 'The request did not go through. Nothing was charged.',
  canRetry: true,
  requiresNewQuote: true,
};

export function describeQuoteError(code: string): QuoteFailure {
  return FAILURES[code] ?? FALLBACK;
}
