import {
  attemptStatusSchema,
  checkoutResponseSchema,
  quoteResponseSchema,
  type AttemptStatus,
  type CheckoutRequest,
  type CheckoutResponse,
  type QuoteResponse,
} from '@takeover/shared';
import { apiRequest } from '@/lib/api/client';
import { TAKEOVER_API_PATHS } from '@/lib/api/takeover-paths';

/**
 * Typed client for the Phase 3 takeover endpoints.
 *
 * Every response shape comes from `@takeover/shared`; no domain type is
 * restated here. There is deliberately no fixture mode anywhere in this file
 * or its data layer: a fabricated quote, checkout, or capture would be a lie
 * about money, so these always talk to the real API or fail.
 */

/** Re-exported so callers keep one import for the client and its paths. */
export { TAKEOVER_API_PATHS };

/**
 * Request body for a quote.
 *
 * ASSUMED, not published: `@takeover/shared` exports `quoteResponseSchema` but
 * no request schema, so the territory locator is the frontend's best guess.
 * It is written once, here, so a correction is a one-line change. The response
 * is validated against the authoritative contract either way.
 */
export function requestTakeoverQuote(territorySlug: string): Promise<QuoteResponse> {
  return apiRequest({
    method: 'POST',
    path: TAKEOVER_API_PATHS.quotes,
    body: { territorySlug },
    withCsrf: true,
    schema: quoteResponseSchema,
  });
}

/**
 * Creates the provider checkout for an existing quote.
 *
 * The request carries only `quoteId` — the server derives the charge from the
 * quote, and the contract rejects a client-supplied amount or return URL.
 */
export function createTakeoverCheckout(request: CheckoutRequest): Promise<CheckoutResponse> {
  return apiRequest({
    method: 'POST',
    path: TAKEOVER_API_PATHS.checkouts,
    body: request,
    withCsrf: true,
    schema: checkoutResponseSchema,
  });
}

/**
 * Reads one attempt's authoritative status.
 *
 * Authorised by the opaque status token alone, so a payer who no longer holds
 * a management session — or who returned in a different browser — can still
 * see what happened to their money. No CSRF header: this is a read.
 */
export function fetchTakeoverStatus(statusToken: string): Promise<AttemptStatus> {
  return apiRequest({
    method: 'GET',
    path: TAKEOVER_API_PATHS.status(statusToken),
    schema: attemptStatusSchema,
  });
}
