import { nextTakeoverPriceMinor, TAKEOVER_BASE_PRICE_MINOR } from '@takeover/shared';

/**
 * Proof of what the current holder of a territory actually paid.
 *
 * A claimed territory may only be quoted when this can be established from
 * settled server-side records. The chain is:
 *
 *   TerritoryOwnership (the open reign, version V)
 *     -> OwnershipCapture COMPLETED with expectedTerritoryVersion = V - 1
 *     -> Payment CONFIRMED, with the amount the provider settled
 *
 * Nothing else counts: not a quote, not an intended bid, not an abandoned or
 * pending checkout, not a failed payment, and not a refunded or reversed
 * capture (those rows carry REFUNDED/FAILED and are excluded by the query).
 * A seeded reign has no capture at all, so it is unprovable by construction.
 */

/** Minimal Prisma surface this resolver needs; a transaction client satisfies it. */
export type SettledCapturePriceClient = {
  territoryOwnership: {
    findFirst(args: unknown): Promise<{ territoryVersion: bigint } | null>;
  };
  ownershipCapture: {
    findMany(args: unknown): Promise<Array<{ id: string; paymentId: string }>>;
  };
  payment: {
    findMany(args: unknown): Promise<Array<{ amountMinor: bigint; currency: string }>>;
  };
};

export type SettledCapturePrice =
  | { kind: 'unclaimed' }
  | {
      kind: 'unprovable';
      reason: 'no_completed_capture' | 'ambiguous_history' | 'unsettled_payment';
    }
  | { kind: 'settled'; amountMinor: bigint; currency: string };

export async function findSettledCapturePrice(
  client: SettledCapturePriceClient,
  territoryId: string,
): Promise<SettledCapturePrice> {
  const reign = await client.territoryOwnership.findFirst({
    select: { territoryVersion: true },
    where: { endedAt: null, territoryId },
  });
  if (reign === null) return { kind: 'unclaimed' };

  // The capture that produced this reign observed the version before it.
  const captures = await client.ownershipCapture.findMany({
    select: { id: true, paymentId: true },
    take: 2,
    where: {
      expectedTerritoryVersion: reign.territoryVersion - 1n,
      status: 'COMPLETED',
      territoryId,
    },
  });
  if (captures.length === 0) return { kind: 'unprovable', reason: 'no_completed_capture' };
  // Two completed captures for one reign would make the price ambiguous.
  if (captures.length > 1) return { kind: 'unprovable', reason: 'ambiguous_history' };

  const payments = await client.payment.findMany({
    select: { amountMinor: true, currency: true },
    take: 2,
    where: { id: captures[0]!.paymentId, status: 'CONFIRMED' },
  });
  if (payments.length !== 1) return { kind: 'unprovable', reason: 'unsettled_payment' };
  const payment = payments[0]!;
  if (payment.amountMinor <= 0n) return { kind: 'unprovable', reason: 'unsettled_payment' };
  return { kind: 'settled', amountMinor: payment.amountMinor, currency: payment.currency };
}

/**
 * The price a claimed territory should be quoted at, or null when the previous
 * settled amount cannot be proven and the territory must fail closed.
 */
export function quotablePriceForSettledCapture(
  settled: SettledCapturePrice,
  baseMinor: bigint = TAKEOVER_BASE_PRICE_MINOR,
): { amountMinor: bigint; currency: string } | null {
  if (settled.kind !== 'settled') return null;
  try {
    return {
      amountMinor: nextTakeoverPriceMinor(settled.amountMinor, baseMinor),
      currency: settled.currency,
    };
  } catch {
    // A stored amount the policy refuses (zero, negative, out of range) is
    // treated exactly like missing proof rather than guessed at.
    return null;
  }
}
