import { describe, expect, it, vi } from 'vitest';
import {
  findSettledCapturePrice,
  quotablePriceForSettledCapture,
  type SettledCapturePriceClient,
} from '../src/modules/takeover/settled-capture-price.js';

const TERRITORY_ID = '21000000-0000-4000-8000-000000000001';

function createClient(options: {
  captures?: Array<{ id: string; paymentId: string }>;
  payments?: Array<{ amountMinor: bigint; currency: string }>;
  reign?: { companyId?: string; source?: string; territoryVersion: bigint } | null;
}): SettledCapturePriceClient {
  const reign =
    options.reign === undefined || options.reign === null
      ? null
      : {
          companyId: options.reign.companyId ?? 'company-1',
          source: options.reign.source ?? 'PAID_CAPTURE',
          territoryVersion: options.reign.territoryVersion,
        };
  return {
    ownershipCapture: { findMany: vi.fn(async () => options.captures ?? []) },
    payment: { findMany: vi.fn(async () => options.payments ?? []) },
    territoryOwnership: { findFirst: vi.fn(async () => reign) },
  };
}

describe('findSettledCapturePrice', () => {
  it('reports an unclaimed territory without consulting payments', async () => {
    const client = createClient({ reign: null });

    await expect(findSettledCapturePrice(client, TERRITORY_ID)).resolves.toEqual({
      kind: 'unclaimed',
    });
    expect(client.payment.findMany).not.toHaveBeenCalled();
  });

  it('proves the settled amount from the capture that produced the open reign', async () => {
    const client = createClient({
      captures: [{ id: 'capture-1', paymentId: 'payment-1' }],
      payments: [{ amountMinor: 1_200n, currency: 'USD' }],
      reign: { territoryVersion: 4n },
    });

    await expect(findSettledCapturePrice(client, TERRITORY_ID)).resolves.toEqual({
      amountMinor: 1_200n,
      currency: 'USD',
      kind: 'settled',
    });
    // The capture is matched on the version observed before this reign.
    expect(client.ownershipCapture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expectedTerritoryVersion: 3n, status: 'COMPLETED' }),
      }),
    );
    // Only a CONFIRMED payment counts; refunded and failed rows never match.
    expect(client.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CONFIRMED' }) }),
    );
  });

  it.each([
    ['a seeded reign with no completed capture', { captures: [] }, 'no_completed_capture'],
    [
      'two completed captures for one reign',
      {
        captures: [
          { id: 'capture-1', paymentId: 'payment-1' },
          { id: 'capture-2', paymentId: 'payment-2' },
        ],
      },
      'ambiguous_history',
    ],
    [
      'a capture whose payment is not confirmed',
      { captures: [{ id: 'capture-1', paymentId: 'payment-1' }], payments: [] },
      'unsettled_payment',
    ],
    [
      'a confirmed payment recorded as zero',
      {
        captures: [{ id: 'capture-1', paymentId: 'payment-1' }],
        payments: [{ amountMinor: 0n, currency: 'USD' }],
      },
      'unsettled_payment',
    ],
  ])('fails closed on %s', async (_label, overrides, reason) => {
    const client = createClient({ reign: { territoryVersion: 2n }, ...overrides });

    await expect(findSettledCapturePrice(client, TERRITORY_ID)).resolves.toEqual({
      kind: 'unprovable',
      reason,
    });
  });
});

describe('a restored holder', () => {
  it('is priced from their own most recent purchase, not the version below them', async () => {
    const client = createClient({
      captures: [{ id: 'capture-1', paymentId: 'payment-1' }],
      payments: [{ amountMinor: 1_000n, currency: 'USD' }],
      // Handed back at version 4; their own capture happened far below that.
      reign: { companyId: 'company-restored', source: 'REFUND_RESTORATION', territoryVersion: 4n },
    });

    await expect(findSettledCapturePrice(client, TERRITORY_ID)).resolves.toEqual({
      amountMinor: 1_000n,
      currency: 'USD',
      kind: 'settled',
    });
    // Looked up by who holds it, not by an assumed version below the reign.
    expect(client.ownershipCapture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          newOwnerCompanyId: 'company-restored',
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('still fails closed when their capture no longer proves anything', async () => {
    const client = createClient({
      captures: [],
      reign: { companyId: 'company-restored', source: 'REFUND_RESTORATION', territoryVersion: 4n },
    });

    await expect(findSettledCapturePrice(client, TERRITORY_ID)).resolves.toEqual({
      kind: 'unprovable',
      reason: 'no_completed_capture',
    });
  });
});

describe('quotablePriceForSettledCapture', () => {
  it('raises the settled amount by 20%, rounded up', () => {
    expect(
      quotablePriceForSettledCapture({ amountMinor: 1_200n, currency: 'USD', kind: 'settled' }),
    ).toEqual({ amountMinor: 1_440n, currency: 'USD' });
    expect(
      quotablePriceForSettledCapture({ amountMinor: 1_201n, currency: 'USD', kind: 'settled' }),
    ).toEqual({ amountMinor: 1_442n, currency: 'USD' });
  });

  it.each([
    ['unclaimed', { kind: 'unclaimed' as const }],
    ['unprovable', { kind: 'unprovable' as const, reason: 'no_completed_capture' as const }],
  ])('returns no price for %s history', (_label, settled) => {
    expect(quotablePriceForSettledCapture(settled)).toBeNull();
  });

  it('treats a stored amount the policy refuses as missing proof', () => {
    expect(
      quotablePriceForSettledCapture({
        amountMinor: BigInt(Number.MAX_SAFE_INTEGER),
        currency: 'USD',
        kind: 'settled',
      }),
    ).toBeNull();
    expect(
      quotablePriceForSettledCapture({ amountMinor: -5n, currency: 'USD', kind: 'settled' }),
    ).toBeNull();
  });
});

describe('currency of the proof', () => {
  it('reports the settled currency so callers can refuse a mismatch', async () => {
    const client = createClient({
      captures: [{ id: 'capture-1', paymentId: 'payment-1' }],
      payments: [{ amountMinor: 1_200n, currency: 'EUR' }],
      reign: { territoryVersion: 2n },
    });

    const settled = await findSettledCapturePrice(client, TERRITORY_ID);
    expect(settled).toMatchObject({ currency: 'EUR' });
    expect(quotablePriceForSettledCapture(settled)).toEqual({
      amountMinor: 1_440n,
      currency: 'EUR',
    });
  });
});
