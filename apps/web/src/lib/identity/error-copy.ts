import { ERROR_CODES } from '@takeover/shared';

export type IdentityErrorCopy = {
  title: string;
  message: string;
  /** Whether retrying the same action could plausibly succeed. */
  canRetry: boolean;
};

/**
 * Maps stable API error codes to user-facing copy.
 *
 * Copy rules enforced here:
 * - Enumeration resistance: never reveal whether an email, company, or token
 *   existed. `INVALID_OR_EXPIRED_TOKEN` deliberately does not distinguish
 *   expiry from prior consumption.
 * - Honesty: nothing claims verification, access, payment, or ownership
 *   succeeded, and manual recovery is never described as something that will be
 *   actioned, because no operator path exists yet.
 */
const COPY: Record<string, IdentityErrorCopy> = {
  [ERROR_CODES.AUTHORIZATION_REQUIRED]: {
    title: 'Your management session has ended',
    message: 'Request a new management link to continue.',
    canRetry: true,
  },
  [ERROR_CODES.COMPANY_ACCESS_DENIED]: {
    title: 'Access was not granted',
    message: 'A manager of this company declined the request. Nothing was charged.',
    canRetry: false,
  },
  [ERROR_CODES.COMPANY_ACCESS_PENDING]: {
    title: 'Waiting on a manager',
    message:
      'A manager of this company was notified and must approve the request before it can continue. Nothing has been charged.',
    canRetry: false,
  },
  [ERROR_CODES.COMPANY_WEBSITE_CLAIMED]: {
    title: 'This website is already claimed',
    message:
      'Another company already uses this website. Request access to it instead of creating a second one.',
    canRetry: false,
  },
  [ERROR_CODES.CONFLICT]: {
    title: 'This was already handled',
    message: 'Someone else completed this action first. Reload to see the current state.',
    canRetry: false,
  },
  [ERROR_CODES.CONTACT_VERIFICATION_REQUIRED]: {
    title: 'Verify your contact email first',
    message: 'Open the link sent to your contact email, then try again.',
    canRetry: false,
  },
  [ERROR_CODES.INTERNAL_ERROR]: {
    title: 'Something went wrong',
    message: 'This is a problem on our side. Nothing was changed.',
    canRetry: true,
  },
  [ERROR_CODES.INVALID_OR_EXPIRED_TOKEN]: {
    title: 'This link is no longer usable',
    message: 'Request a new link and open the most recent email.',
    canRetry: true,
  },
  [ERROR_CODES.MANUAL_RECOVERY_UNAVAILABLE]: {
    title: 'Recovery is recorded but cannot run yet',
    message:
      'Your request has been stored. There is no automated review process yet, so do not expect a decision from this step.',
    canRetry: false,
  },
  [ERROR_CODES.NOT_FOUND]: {
    title: 'Not found',
    message: 'This record does not exist, or it is not visible to your session.',
    canRetry: false,
  },
  [ERROR_CODES.RATE_LIMITED]: {
    title: 'Too many attempts',
    message: 'Wait a little while before trying again.',
    canRetry: true,
  },
  [ERROR_CODES.SERVICE_UNAVAILABLE]: {
    title: 'This is not connected yet',
    message: 'The service backing this step is unavailable, so nothing was changed.',
    canRetry: true,
  },
  [ERROR_CODES.VALIDATION_ERROR]: {
    title: 'Check the details you entered',
    message: 'Something in the form was not accepted. Correct it and try again.',
    canRetry: false,
  },
};

const FALLBACK: IdentityErrorCopy = {
  title: 'Something went wrong',
  message: 'The request did not complete, and nothing was changed.',
  canRetry: true,
};

export function describeIdentityError(code: string): IdentityErrorCopy {
  return COPY[code] ?? FALLBACK;
}
