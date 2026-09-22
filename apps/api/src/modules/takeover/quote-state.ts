import {
  CURRENCY_CODE_PATTERN,
  ERROR_CODES,
  type TakeoverQuoteAvailability,
  type TakeoverQuoteStaleReason,
} from '@takeover/shared';

/**
 * Pricing and quote-validity rules in one place, so the read model, the
 * preparation quote path and the public quote path cannot drift apart.
 */

export class PricingNotConfiguredError extends Error {
  readonly code = ERROR_CODES.PRICING_NOT_CONFIGURED;
  readonly statusCode = 409;

  constructor() {
    super('No takeover price is configured for this territory');
    this.name = 'PricingNotConfiguredError';
  }
}

/**
 * A claimed territory's stored minimum predates its capture. No approved
 * policy says what taking it over should cost, so it is never quoted.
 */
export class ClaimedTerritoryPricingNotConfiguredError extends Error {
  readonly code = ERROR_CODES.CLAIMED_TERRITORY_PRICING_NOT_CONFIGURED;
  readonly statusCode = 409;

  constructor() {
    super('Takeover pricing for a claimed territory is not configured');
    this.name = 'ClaimedTerritoryPricingNotConfiguredError';
  }
}

export type QuotablePricing = {
  currency: string;
  minimumTakeoverAmountMinor: bigint;
};

export type QuotableTerritory = QuotablePricing & {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  hasActiveOwner: boolean;
};

/**
 * A stored minimum of zero means "no price decided", never "free". Anything
 * the shared money contract could not represent is refused the same way, so a
 * malformed row can never become a quote.
 */
export function isQuotablePricing(pricing: QuotablePricing): boolean {
  const amount = pricing.minimumTakeoverAmountMinor;
  return (
    amount > 0n &&
    amount <= BigInt(Number.MAX_SAFE_INTEGER) &&
    CURRENCY_CODE_PATTERN.test(pricing.currency)
  );
}

/** Whether the server would issue a quote for this territory right now, and if not, why. */
export function quoteAvailabilityFor(territory: QuotableTerritory): TakeoverQuoteAvailability {
  if (territory.availabilityStatus === 'DISABLED') return 'territory_disabled';
  if (territory.hasActiveOwner) return 'claimed_pricing_not_configured';
  if (!isQuotablePricing(territory)) return 'pricing_not_configured';
  return 'quotable';
}

export function assertQuotablePricing(pricing: QuotablePricing): void {
  if (!isQuotablePricing(pricing)) throw new PricingNotConfiguredError();
}

/** Throws the domain error matching a non-quotable availability; disabled is the caller's. */
export function assertQuotableTerritory(territory: QuotableTerritory): void {
  if (territory.hasActiveOwner) throw new ClaimedTerritoryPricingNotConfiguredError();
  assertQuotablePricing(territory);
}

export type QuoteForClassification = {
  /** Set when a checkout was reserved against the quote; it is spent. */
  consumedAt: Date | null;
  currency: string;
  expiresAt: Date;
  minimumAmountMinor: bigint;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  territoryVersion: bigint;
};

export type TerritoryForClassification = {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  currency: string;
  hasActiveOwner: boolean;
  minimumTakeoverAmountMinor: bigint;
  version: bigint;
};

export type QuoteClassification =
  | { state: 'active'; usable: true }
  | { state: 'expired' | 'cancelled'; usable: false }
  | { state: 'stale'; staleReason: TakeoverQuoteStaleReason; usable: false };

/**
 * Whether a quote still describes the world. Time wins over everything (an
 * expired quote is simply expired); a live quote is then compared with the
 * territory and intent as they are now, and the first mismatch is the reason.
 */
export function classifyQuote(input: {
  intentReady: boolean;
  now: Date;
  quote: QuoteForClassification;
  territory: TerritoryForClassification | null;
}): QuoteClassification {
  const { quote, territory } = input;
  if (quote.status === 'CANCELLED') return { state: 'cancelled', usable: false };
  // A spent quote is finished even while its row still reads ACTIVE, exactly
  // as the checkout path treats it.
  if (quote.consumedAt !== null) return { state: 'cancelled', usable: false };
  if (quote.status === 'EXPIRED' || quote.expiresAt <= input.now) {
    return { state: 'expired', usable: false };
  }
  const staleReason = staleReasonFor(input.intentReady, quote, territory);
  if (staleReason !== null) return { state: 'stale', staleReason, usable: false };
  return { state: 'active', usable: true };
}

function staleReasonFor(
  intentReady: boolean,
  quote: QuoteForClassification,
  territory: TerritoryForClassification | null,
): TakeoverQuoteStaleReason | null {
  if (territory === null) return 'territory_missing';
  if (territory.availabilityStatus === 'DISABLED') return 'territory_disabled';
  if (territory.hasActiveOwner) return 'territory_claimed';
  if (territory.version !== quote.territoryVersion) return 'territory_version_changed';
  if (
    territory.minimumTakeoverAmountMinor !== quote.minimumAmountMinor ||
    territory.currency !== quote.currency
  ) {
    return 'pricing_changed';
  }
  if (!intentReady) return 'intent_not_ready';
  return null;
}
