import { ERROR_CODES } from '@takeover/shared';
import { ApiRequestError } from '@/lib/api/client';

/**
 * Honest copy for a failed public read.
 *
 * These surfaces have no fallback: when a live read fails the page says so
 * rather than showing fixtures, stale values, or an empty board that would
 * read as "nobody owns anything". The distinction that matters to a reader is
 * "we could not reach the service" versus "the service answered with something
 * we refuse to render", so those are separated; everything else is generic.
 */
export type ReadFailure = {
  title: string;
  description: string;
  requestId?: string;
};

export function describeReadFailure(error: unknown, subject: string): ReadFailure {
  if (!(error instanceof ApiRequestError)) {
    return {
      title: `Could not load ${subject}`,
      description: 'Something went wrong on our side. Nothing here is out of date — it is missing.',
    };
  }

  const requestId = error.requestId === undefined ? {} : { requestId: error.requestId };

  // status 0 is the client's own "the request never completed" marker.
  if (error.status === 0 || error.code === ERROR_CODES.SERVICE_UNAVAILABLE) {
    return {
      title: 'The service is unavailable',
      description: `We could not reach the service to load ${subject}. This is an outage, not an empty result — try again shortly.`,
      ...requestId,
    };
  }

  // A 200 that fails the shared contract: the response was understood as
  // malformed, and rendering part of it would show something untrue.
  if (error.status === 200 && error.code === ERROR_CODES.INTERNAL_ERROR) {
    return {
      title: 'Unexpected response from the service',
      description: `The service returned ${subject} in a shape this page does not recognise, so nothing is shown rather than something wrong.`,
      ...requestId,
    };
  }

  if (error.code === ERROR_CODES.RATE_LIMITED) {
    return {
      title: 'Too many requests',
      description: `Loading ${subject} was rate limited. Wait a moment and try again.`,
      ...requestId,
    };
  }

  return {
    title: `Could not load ${subject}`,
    description: error.message,
    ...requestId,
  };
}
