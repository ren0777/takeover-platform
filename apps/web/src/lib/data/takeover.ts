import {
  type AttemptStatus,
  type CheckoutResponse,
  type CheckoutRequest,
  type QuoteResponse,
} from '@takeover/shared';
import { ApiRequestError } from '@/lib/api/client';
import {
  createTakeoverCheckout,
  fetchTakeoverStatus,
  requestTakeoverQuote,
} from '@/lib/api/takeover';

/**
 * The only takeover data entry points.
 *
 * Unlike the public territory reads, there is no fixture/live switch here and
 * there never will be. A fixture quote would invent a price, a fixture
 * checkout would invent a payment, and a fixture status would invent an
 * outcome for real money. These call the API or they fail.
 */

export function getTakeoverQuote(territorySlug: string): Promise<QuoteResponse> {
  return requestTakeoverQuote(territorySlug);
}

/**
 * Starts a checkout and returns the provider handoff.
 *
 * The HTTPS check is defence in depth: `checkoutResponseSchema` already
 * requires it, but this URL is handed straight to the browser's navigation, so
 * a `javascript:` or `data:` URL arriving by any route must never be followed.
 */
export async function startTakeoverCheckout(request: CheckoutRequest): Promise<CheckoutResponse> {
  const checkout = await createTakeoverCheckout(request);

  if (!isSafeCheckoutUrl(checkout.providerCheckoutUrl)) {
    throw new Error('Refusing to hand off to a non-HTTPS checkout URL.');
  }

  return checkout;
}

export function isSafeCheckoutUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Reads attempt status, or `null` when the status token is unknown, expired,
 * or revoked.
 *
 * `null` means "we cannot identify this attempt", which is emphatically not
 * "the payment failed". The status surface must say so in those words.
 */
export async function getTakeoverStatus(statusToken: string): Promise<AttemptStatus | null> {
  try {
    return await fetchTakeoverStatus(statusToken);
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}
