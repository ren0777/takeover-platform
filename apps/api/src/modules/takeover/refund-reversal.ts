import { nextTakeoverPriceMinor, TAKEOVER_BASE_PRICE_MINOR } from '@takeover/shared';

/**
 * Deciding what a successful refund does to a territory's ownership.
 *
 * A refund only unwinds ownership when the capture it reverses is the one
 * holding the territory right now. That is true when the open reign sits one
 * version above the capture's observed version and belongs to the same company
 * — the same chain `settled-capture-price.ts` uses to prove a price.
 *
 * When it holds, the refunded buyer loses the territory and it falls to the
 * holder before them, if that holder's own money is still good. When it does
 * not hold, the refund is history: a later capture already replaced this one,
 * and nothing about the present owner may change.
 *
 * Nothing here writes. It reads the records and returns the plan the caller
 * carries out inside its own locked transaction.
 */

export type ReversalClient = {
  territoryOwnership: {
    findFirst(args: unknown): Promise<ReignRow | null>;
  };
  ownershipCapture: {
    findMany(args: unknown): Promise<Array<{ id: string; newOwnerCompanyId: string }>>;
  };
  payment: {
    findMany(args: unknown): Promise<Array<{ amountMinor: bigint; currency: string; id: string }>>;
  };
};

export type ReignRow = {
  companyId: string;
  id: string;
  source?: string;
  territoryVersion: bigint;
};

export type RefundedCapture = {
  expectedTerritoryVersion: bigint;
  newOwnerCompanyId: string;
  paymentId: string;
};

/** Why a predecessor's price could not be established. */
export type UnprovableReason =
  | 'no_predecessor_capture'
  | 'ambiguous_predecessor_history'
  | 'predecessor_payment_not_confirmed'
  | 'predecessor_price_refused_by_policy';

export type RefundReversalPlan =
  /** The refund reverses a capture some later capture already superseded. */
  | { kind: 'historical' }
  /** No holder before the refunded one: the territory goes back on the market. */
  | { kind: 'release'; openReign: ReignRow; priceMinor: bigint; currency: string }
  /** The previous holder returns, with a price proven from their own payment. */
  | {
      kind: 'restore';
      openReign: ReignRow;
      predecessor: ReignRow;
      priceMinor: bigint;
      currency: string;
    }
  /**
   * The previous holder returns but their price cannot be proven. Ownership is
   * still corrected — leaving a refunded buyer in place would be worse — but
   * the price is left untouched and flagged, because the only other number
   * available is the one the refunded payment bought.
   */
  | {
      kind: 'restore_unpriced';
      openReign: ReignRow;
      predecessor: ReignRow;
      reason: UnprovableReason;
    };

/**
 * Proves what the company holding `reign` actually paid for it.
 *
 * `excludePaymentId` is the payment being refunded. It can never serve as
 * proof of a price, even if some other row still points at it.
 */
async function proveReignPrice(
  client: ReversalClient,
  territoryId: string,
  reign: ReignRow,
  excludePaymentId: string,
): Promise<{ amountMinor: bigint; currency: string } | { reason: UnprovableReason }> {
  // A reign that was itself handed back was not bought at the version below
  // it, so it is matched the same way quoting matches one: by who holds it and
  // their most recent purchase. Anything else is anchored to the version it
  // was captured at, where two matches would make the price ambiguous.
  const restored = reign.source === 'REFUND_RESTORATION';
  const captures = restored
    ? await client.ownershipCapture.findMany({
        orderBy: { expectedTerritoryVersion: 'desc' },
        select: { id: true, newOwnerCompanyId: true, paymentId: true },
        take: 1,
        where: { newOwnerCompanyId: reign.companyId, status: 'COMPLETED', territoryId },
      })
    : await client.ownershipCapture.findMany({
        select: { id: true, newOwnerCompanyId: true, paymentId: true },
        take: 2,
        where: {
          expectedTerritoryVersion: reign.territoryVersion - 1n,
          newOwnerCompanyId: reign.companyId,
          status: 'COMPLETED',
          territoryId,
        },
      });
  if (captures.length === 0) return { reason: 'no_predecessor_capture' };
  if (!restored && captures.length > 1) return { reason: 'ambiguous_predecessor_history' };

  const capture = captures[0] as { id: string; newOwnerCompanyId: string; paymentId: string };
  if (capture.paymentId === excludePaymentId) {
    // The refunded money is never proof of anything.
    return { reason: 'predecessor_payment_not_confirmed' };
  }

  const payments = await client.payment.findMany({
    select: { amountMinor: true, currency: true, id: true },
    take: 2,
    where: { id: capture.paymentId, status: 'CONFIRMED' },
  });
  if (payments.length !== 1) return { reason: 'predecessor_payment_not_confirmed' };
  const payment = payments[0] as { amountMinor: bigint; currency: string; id: string };
  if (payment.id === excludePaymentId) return { reason: 'predecessor_payment_not_confirmed' };
  if (payment.amountMinor <= 0n) return { reason: 'predecessor_payment_not_confirmed' };
  return { amountMinor: payment.amountMinor, currency: payment.currency };
}

/**
 * Works out what a successful refund should do, given the capture it reverses.
 *
 * `openReign` is read by the caller under the territory row lock and passed in,
 * so the plan is decided against the same row the caller is about to change.
 */
export async function planRefundReversal(
  client: ReversalClient,
  input: {
    baseMinor?: bigint;
    capture: RefundedCapture;
    openReign: ReignRow | null;
    territoryCurrency: string;
    territoryId: string;
  },
): Promise<RefundReversalPlan> {
  const base = input.baseMinor ?? TAKEOVER_BASE_PRICE_MINOR;
  const { capture, openReign } = input;
  if (openReign === null) return { kind: 'historical' };

  const backsCurrentReign =
    openReign.companyId === capture.newOwnerCompanyId &&
    openReign.territoryVersion === capture.expectedTerritoryVersion + 1n;
  if (!backsCurrentReign) return { kind: 'historical' };

  // The reign this one directly replaced, which is the version immediately
  // below it. A lower reign with a gap above it was already ended by something
  // other than this capture — a refund that released the territory, say — and
  // restoring across that gap would hand it back to a holder who no longer has
  // any claim to it.
  const predecessor = await client.territoryOwnership.findFirst({
    select: { companyId: true, id: true, source: true, territoryVersion: true },
    where: {
      territoryId: input.territoryId,
      territoryVersion: openReign.territoryVersion - 1n,
    },
  });
  if (predecessor === null) {
    // Nobody held it before: back on the market at the configured base price.
    return {
      currency: input.territoryCurrency,
      kind: 'release',
      openReign,
      priceMinor: base,
    };
  }

  const proven = await proveReignPrice(client, input.territoryId, predecessor, capture.paymentId);
  if ('reason' in proven) {
    return { kind: 'restore_unpriced', openReign, predecessor, reason: proven.reason };
  }

  let priceMinor: bigint;
  try {
    priceMinor = nextTakeoverPriceMinor(proven.amountMinor, base);
  } catch {
    return {
      kind: 'restore_unpriced',
      openReign,
      predecessor,
      reason: 'predecessor_price_refused_by_policy',
    };
  }

  return {
    currency: proven.currency,
    kind: 'restore',
    openReign,
    predecessor,
    priceMinor,
  };
}
