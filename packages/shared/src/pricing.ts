/**
 * The MVP takeover pricing policy, in one place.
 *
 * Quote generation and the capture-completion transaction both derive prices
 * from here, so there is exactly one rule and no parallel implementation.
 *
 * What the money buys is temporary promotional placement: control of a
 * territory until someone else takes it over. It is never equity, intellectual
 * property, permanent ownership, or an investment, and the previous holder
 * receives no payout or revenue share — the payment is platform revenue.
 */

/** Every seeded territory starts here, and no next price may fall below it. */
export const TAKEOVER_BASE_PRICE_MINOR = 1_000n;

/** MVP is single-currency. Any other currency is refused rather than converted. */
export const TAKEOVER_CURRENCY = 'USD';

/** A quote records the price for five minutes; it reserves nothing. */
export const TAKEOVER_QUOTE_TTL_SECONDS = 300;

/**
 * After a successful capture the next price is 120% of the amount actually
 * paid, expressed as a fraction so the arithmetic stays in integers.
 */
export const TAKEOVER_PRICE_INCREASE_NUMERATOR = 6n;
export const TAKEOVER_PRICE_INCREASE_DENOMINATOR = 5n;

/** Upper bound for a money amount that the shared `Money` contract can carry. */
export const MAX_SAFE_AMOUNT_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * The next takeover price for a territory, in integer minor units.
 *
 * `paidMinor` is the amount actually settled for the previous successful
 * capture — never a quoted, intended, abandoned, failed or refunded amount.
 * The result is 120% of it, rounded **up** to the next whole minor unit, and
 * never below `baseMinor`:
 *
 * ```
 * next = max(baseMinor, ceil(paidMinor * 6 / 5))
 * ```
 *
 * Examples (USD cents):
 * - 1000 ($10.00) -> 1200 ($12.00), exact
 * - 1200 ($12.00) -> 1440 ($14.40), exact
 * - 1201 ($12.01) -> 1442 ($14.42), since 1441.2 rounds up
 * -    1 ($0.01)  -> 1000 ($10.00), raised to the base price
 *
 * Rounding up is deliberate: a fractional cent may never be given away, and a
 * capture must always raise the next price by at least one minor unit.
 */
export function nextTakeoverPriceMinor(
  paidMinor: bigint,
  baseMinor = TAKEOVER_BASE_PRICE_MINOR,
): bigint {
  assertUsableAmount(paidMinor, 'settled capture amount');
  assertUsableAmount(baseMinor, 'base price');
  if (paidMinor <= 0n) {
    throw new TakeoverPricingError('A settled capture amount must be positive');
  }
  if (baseMinor <= 0n) {
    throw new TakeoverPricingError('A base price must be positive');
  }
  const increased = ceilDivide(
    paidMinor * TAKEOVER_PRICE_INCREASE_NUMERATOR,
    TAKEOVER_PRICE_INCREASE_DENOMINATOR,
  );
  const next = increased > baseMinor ? increased : baseMinor;
  assertUsableAmount(next, 'next price');
  return next;
}

export class TakeoverPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TakeoverPricingError';
  }
}

/** Integer ceiling division for non-negative values. */
function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Refuses anything the money contract could not carry: a negative amount, or
 * one past the safe-integer boundary the shared `Money` type is bounded by.
 */
function assertUsableAmount(amountMinor: bigint, label: string): void {
  if (amountMinor < 0n) {
    throw new TakeoverPricingError(`A ${label} must not be negative`);
  }
  if (amountMinor > MAX_SAFE_AMOUNT_MINOR) {
    throw new TakeoverPricingError(`A ${label} exceeds the safe amount boundary`);
  }
}

/** MVP currency check; quoting or pricing in anything else is refused. */
export function isTakeoverCurrency(currency: string): boolean {
  return currency === TAKEOVER_CURRENCY;
}
