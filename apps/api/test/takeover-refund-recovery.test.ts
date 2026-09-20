import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentProviderRefundError,
  TakeoverService,
  type PaymentProvider,
  type StatusAttemptRecord,
  type TakeoverRepository,
} from '../src/modules/takeover/service.js';

const now = new Date('2026-09-03T10:00:00.000Z');
const later = new Date('2026-09-03T10:05:00.000Z');
const companyId = '11111111-1111-4111-8111-111111111111';
const checkoutId = '44444444-4444-4444-8444-444444444444';
const paymentId = '55555555-5555-4555-8555-555555555555';

function attempt(providerRefundReference: string | null, status = 'PENDING'): StatusAttemptRecord {
  return {
    capture: {
      completedAt: null,
      failureCode: 'STALE_TERRITORY_VERSION',
      newOwnerCompanyId: companyId,
      status: 'FAILED',
    },
    checkout: { id: checkoutId, status: 'PENDING', updatedAt: later },
    payment: {
      amountMinor: 1500n,
      confirmedAt: now,
      currency: 'USD',
      failedAt: null,
      status: 'CONFIRMED',
    },
    quote: { expiresAt: later, territoryVersion: 7n },
    reconciliation: { action: 'REFUND', providerRefundReference, status },
    territory: { ownerCompanyId: null, version: 8n },
    token: { expiresAt: later, revokedAt: null },
  };
}

function createRepository() {
  const repository = {
    beginRefundForReconciliation: vi.fn<TakeoverRepository['beginRefundForReconciliation']>(
      async () => ({
        payment: {
          amountMinor: 1500n,
          checkoutId,
          currency: 'USD',
          id: paymentId,
          provider: 'TEST_PROVIDER',
          providerPaymentId: 'provider-pay-1',
        },
        status: null,
      }),
    ),
    claimRefund: vi.fn(async () => true),
    clearRefundClaim: vi.fn(async () => undefined),
    completeCheckoutProviderResult: vi.fn(),
    confirmProviderPaymentAndCapture: vi.fn(),
    createQuote: vi.fn(),
    findActiveQuote: vi.fn(),
    findCheckoutByQuote: vi.fn(),
    findQuoteForCheckout: vi.fn(),
    findStatusAttemptByTokenDigest: vi.fn(),
    findTerritoryForQuote: vi.fn(),
    ingestVerifiedProviderWebhook: vi.fn(),
    recordRefundRequestFailure: vi.fn(async () => attempt(null)),
    recordRefundRequestResult: vi.fn(async (input: { providerRefundId?: string }) =>
      attempt(input.providerRefundId ?? null),
    ),
    reserveCheckout: vi.fn(),
  };
  return repository as unknown as TakeoverRepository & typeof repository;
}

function createProvider() {
  const provider = {
    createCheckout: vi.fn(),
    lookupRefund: vi.fn<PaymentProvider['lookupRefund']>(async () => null),
    name: 'TEST_PROVIDER',
    refundPayment: vi.fn(async () => ({ providerRefundId: 'ref_123', status: 'pending' as const })),
  };
  return provider as PaymentProvider & typeof provider;
}

function createService(repository: TakeoverRepository, provider: PaymentProvider) {
  return new TakeoverService({
    clock: { now: () => now },
    provider,
    repository,
    statusTokenSecret: randomBytes(32),
    statusTokenTtlSeconds: 86_400,
    trustedWebOrigin: 'https://app.example',
  });
}

describe('refund recovery', () => {
  it('looks up provider refund state before posting a refund', async () => {
    const repository = createRepository();
    const provider = createProvider();
    provider.lookupRefund.mockResolvedValueOnce({
      providerRefundId: 'ref_existing',
      status: 'pending',
    });
    const service = createService(repository, provider);

    const status = await service.requestRefundForReconciliation(paymentId);

    expect(provider.lookupRefund).toHaveBeenCalledTimes(1);
    expect(provider.refundPayment).not.toHaveBeenCalled();
    expect(repository.recordRefundRequestResult).toHaveBeenCalledWith({
      paymentId,
      providerRefundId: 'ref_existing',
      status: 'pending',
    });
    expect(status).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
  });

  it('does not post when an unclaimed worker cannot prove provider state', async () => {
    const repository = createRepository();
    const provider = createProvider();
    repository.claimRefund.mockResolvedValueOnce(false);
    provider.lookupRefund.mockRejectedValueOnce(
      new PaymentProviderRefundError('lookup timed out', { retryable: true }),
    );
    repository.beginRefundForReconciliation
      .mockResolvedValueOnce({
        payment: {
          amountMinor: 1500n,
          checkoutId,
          currency: 'USD',
          id: paymentId,
          provider: 'TEST_PROVIDER',
          providerPaymentId: 'provider-pay-1',
        },
        status: null,
      })
      .mockResolvedValueOnce({ payment: null, status: attempt('CLAIMED_1788439200000_holder') });
    const service = createService(repository, provider);

    const status = await service.requestRefundForReconciliation(paymentId);

    expect(provider.lookupRefund).toHaveBeenCalledTimes(1);
    expect(provider.refundPayment).not.toHaveBeenCalled();
    expect(status).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
  });

  it('keeps a retryable unknown-outcome claim leased so immediate retry cannot double post', async () => {
    const repository = createRepository();
    const provider = createProvider();
    let claimLeased = false;

    repository.claimRefund.mockImplementation(async () => {
      if (claimLeased) return false;
      claimLeased = true;
      return true;
    });
    repository.clearRefundClaim.mockImplementation(async () => {
      claimLeased = false;
    });
    repository.recordRefundRequestFailure.mockResolvedValue(
      attempt('CLAIMED_1788439200000_holder'),
    );
    repository.beginRefundForReconciliation
      .mockResolvedValueOnce({
        payment: {
          amountMinor: 1500n,
          checkoutId,
          currency: 'USD',
          id: paymentId,
          provider: 'TEST_PROVIDER',
          providerPaymentId: 'provider-pay-1',
        },
        status: null,
      })
      .mockResolvedValueOnce({
        payment: {
          amountMinor: 1500n,
          checkoutId,
          currency: 'USD',
          id: paymentId,
          provider: 'TEST_PROVIDER',
          providerPaymentId: 'provider-pay-1',
        },
        status: null,
      })
      .mockResolvedValueOnce({ payment: null, status: attempt('CLAIMED_1788439200000_holder') });
    provider.lookupRefund.mockResolvedValue(null);
    provider.refundPayment.mockRejectedValueOnce(
      new PaymentProviderRefundError('refund request timed out', { retryable: true }),
    );
    const serviceA = createService(repository, provider);
    const serviceB = createService(repository, provider);

    const first = await serviceA.requestRefundForReconciliation(paymentId);
    const second = await serviceB.requestRefundForReconciliation(paymentId);

    expect(first).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
    expect(second).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
    expect(repository.clearRefundClaim).not.toHaveBeenCalled();
    expect(provider.lookupRefund).toHaveBeenCalledTimes(2);
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
  });

  it('clears the claim only for definite provider rejection', async () => {
    const repository = createRepository();
    const provider = createProvider();
    provider.refundPayment.mockRejectedValueOnce(
      new PaymentProviderRefundError('provider rejected refund', { retryable: false }),
    );
    const service = createService(repository, provider);

    await service.requestRefundForReconciliation(paymentId);

    expect(repository.clearRefundClaim).toHaveBeenCalledTimes(1);
    expect(repository.recordRefundRequestFailure).toHaveBeenCalledWith({
      paymentId,
      reason: 'provider rejected refund',
      status: 'FAILED',
    });
  });
});
