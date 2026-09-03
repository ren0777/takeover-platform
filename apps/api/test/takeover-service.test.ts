import { describe, expect, it, vi } from 'vitest';
import type { AttemptStatus } from '@takeover/shared';
import {
  CheckoutQuoteExpiredError,
  InvalidStatusTokenError,
  TakeoverService,
  TakeoverStaleTerritoryVersionError,
  type PaymentProvider,
  type TakeoverRepository,
} from '../src/modules/takeover/service.js';

const now = new Date('2026-09-03T10:00:00.000Z');
const later = new Date('2026-09-03T10:05:00.000Z');
const companyId = '11111111-1111-4111-8111-111111111111';
const territoryId = '22222222-2222-4222-8222-222222222222';
const quoteId = '33333333-3333-4333-8333-333333333333';
const checkoutId = '44444444-4444-4444-8444-444444444444';

function createRepository(): TakeoverRepository {
  return {
    completeCheckoutProviderResult: vi.fn(async (input) => ({
      companyId,
      createdAt: now,
      expiresAt: later,
      id: input.checkoutId,
      provider: 'TEST_PROVIDER',
      providerCheckoutId: input.providerCheckoutId,
      providerCheckoutUrl: input.providerCheckoutUrl,
      quoteId,
      status: 'PENDING' as const,
      updatedAt: now,
    })),
    confirmProviderPaymentAndCapture: vi.fn(async () => ({
      capture: {
        completedAt: later,
        failureCode: null,
        newOwnerCompanyId: companyId,
        status: 'COMPLETED' as const,
      },
      checkout: { id: checkoutId, status: 'COMPLETED' as const, updatedAt: later },
      payment: {
        amountMinor: 1500n,
        confirmedAt: now,
        currency: 'USD',
        failedAt: null,
        status: 'CONFIRMED' as const,
      },
      quote: { expiresAt: later, territoryVersion: 7n },
      reconciliation: null,
      territory: { ownerCompanyId: companyId, version: 8n },
      token: { expiresAt: later, revokedAt: null },
    })),
    reserveCheckout: vi.fn(async (input) => ({
      checkout: {
        companyId,
        createdAt: now,
        expiresAt: later,
        id: input.checkoutId,
        provider: input.provider,
        providerCheckoutId: input.providerCheckoutId,
        providerCheckoutUrl: null,
        quoteId,
      status: 'CREATED' as const,
        updatedAt: now,
      },
      created: true,
      statusTokenDigest: input.statusTokenDigest,
    })),
    createQuote: vi.fn(async () => ({
      companyId,
      consumedAt: null,
      createdAt: now,
      currency: 'USD',
      expiresAt: later,
      id: quoteId,
      minimumAmountMinor: 1500n,
      observedAt: now,
      status: 'ACTIVE' as const,
      territoryId,
      territorySlug: 'ai-coding',
      territoryVersion: 7n,
    })),
    findActiveQuote: vi.fn(async () => null),
    findCheckoutByQuote: vi.fn(async () => null),
    findQuoteForCheckout: vi.fn(async () => ({
      companyId,
      consumedAt: null,
      currency: 'USD',
      expiresAt: later,
      id: quoteId,
      minimumAmountMinor: 1500n,
      status: 'ACTIVE' as const,
      territory: {
        availabilityStatus: 'ACTIVE' as const,
        currency: 'USD',
        id: territoryId,
        minimumTakeoverAmountMinor: 1500n,
        slug: 'ai-coding',
        version: 7n,
      },
      territoryId,
      territoryVersion: 7n,
    })),
    findStatusAttemptByTokenDigest: vi.fn(async () => null),
    findTerritoryForQuote: vi.fn(async () => ({
      availabilityStatus: 'ACTIVE' as const,
      currency: 'USD',
      id: territoryId,
      minimumTakeoverAmountMinor: 1500n,
      slug: 'ai-coding',
      version: 7n,
    })),
  };
}

function createProvider(): PaymentProvider {
  return {
    name: 'TEST_PROVIDER',
    createCheckout: vi.fn(async () => ({
      providerCheckoutId: 'provider-checkout-1',
      providerCheckoutUrl: 'https://pay.example/checkout',
    })),
  };
}

function createService(repository = createRepository(), provider = createProvider()) {
  return new TakeoverService({
    clock: { now: () => now },
    provider,
    repository,
    statusTokenSecret: new Uint8Array(32).fill(9),
    statusTokenTtlSeconds: 86_400,
    trustedWebOrigin: 'https://app.example',
  });
}

describe('TakeoverService quote and checkout orchestration', () => {
  it('creates a server-authoritative quote from territory price and version', async () => {
    const repository = createRepository();
    const service = createService(repository);

    const quote = await service.createQuote({ companyId, territorySlug: 'ai-coding' });

    expect(quote).toEqual({
      checkoutAvailable: true,
      expiresAt: later.toISOString(),
      minimumAmount: { amountMinor: 1500, currency: 'USD' },
      quoteId,
      status: 'ACTIVE',
      territoryId,
      territorySlug: 'ai-coding',
      territoryVersion: '7',
    });
    expect(repository.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        currency: 'USD',
        minimumAmountMinor: 1500n,
        territoryVersion: 7n,
      }),
    );
  });

  it('rejects checkout when the quote territory version is stale', async () => {
    const repository = createRepository();
    vi.mocked(repository.findQuoteForCheckout).mockResolvedValueOnce({
      companyId,
      consumedAt: null,
      currency: 'USD',
      expiresAt: later,
      id: quoteId,
      minimumAmountMinor: 1500n,
      status: 'ACTIVE',
      territory: {
        availabilityStatus: 'ACTIVE',
        currency: 'USD',
        id: territoryId,
        minimumTakeoverAmountMinor: 1500n,
        slug: 'ai-coding',
        version: 8n,
      },
      territoryId,
      territoryVersion: 7n,
    });
    const service = createService(repository);

    await expect(service.createCheckout({ companyId, quoteId })).rejects.toBeInstanceOf(
      TakeoverStaleTerritoryVersionError,
    );
  });

  it('creates checkout through the provider and returns a raw status token once', async () => {
    const repository = createRepository();
    const provider = createProvider();
    const service = createService(repository, provider);

    const checkout = await service.createCheckout({ companyId, quoteId });

    expect(checkout.checkoutId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(checkout.providerCheckoutUrl).toBe('https://pay.example/checkout');
    expect(checkout.statusToken).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: { amountMinor: 1500, currency: 'USD' },
        quoteId,
        returnUrl: expect.stringMatching(/^https:\/\/app\.example\/takeover\//),
      }),
    );
    expect(repository.reserveCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        statusTokenDigest: expect.any(Uint8Array),
      }),
    );
    expect(JSON.stringify(vi.mocked(repository.reserveCheckout).mock.calls[0])).not.toContain(
      checkout.statusToken,
    );
  });

  it('reuses an existing checkout without calling the provider again', async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(repository.reserveCheckout).mockResolvedValueOnce({
      checkout: {
        companyId,
        createdAt: now,
        expiresAt: later,
        id: checkoutId,
        provider: 'TEST_PROVIDER',
        providerCheckoutId: 'provider-checkout-1',
        providerCheckoutUrl: 'https://pay.example/checkout',
        quoteId,
        status: 'PENDING',
        updatedAt: now,
      },
      created: false,
      statusTokenDigest: new Uint8Array(32).fill(1),
    });
    const service = createService(repository, provider);

    await expect(service.createCheckout({ companyId, quoteId })).resolves.toMatchObject({
      checkoutId,
      providerCheckoutUrl: 'https://pay.example/checkout',
    });
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it('returns not found for unknown, expired, or revoked status tokens', async () => {
    const service = createService();

    await expect(service.getStatus('not-a-token')).rejects.toBeInstanceOf(InvalidStatusTokenError);
  });

  it('maps completed ownership capture into a single terminal attempt state', async () => {
    const repository = createRepository();
    vi.mocked(repository.findStatusAttemptByTokenDigest).mockResolvedValueOnce({
      capture: {
        completedAt: later,
        failureCode: null,
        newOwnerCompanyId: companyId,
        status: 'COMPLETED',
      },
      checkout: {
        id: checkoutId,
        status: 'COMPLETED',
        updatedAt: later,
      },
      payment: {
        amountMinor: 1500n,
        confirmedAt: now,
        currency: 'USD',
        failedAt: null,
        status: 'CONFIRMED',
      },
      quote: {
        expiresAt: later,
        territoryVersion: 7n,
      },
      reconciliation: null,
      territory: {
        ownerCompanyId: companyId,
        version: 8n,
      },
      token: {
        expiresAt: later,
        revokedAt: null,
      },
    });
    const service = createService(repository);

    const status: AttemptStatus = await service.getStatus('A'.repeat(43));

    expect(status).toMatchObject({
      amountCharged: { amountMinor: 1500, currency: 'USD' },
      capturedAt: later.toISOString(),
      checkoutId,
      newOwnerCompanyId: companyId,
      state: 'CAPTURED',
      terminal: true,
    });
  });

  it('marks an expired no-payment checkout as terminal quote expiry', async () => {
    const repository = createRepository();
    vi.mocked(repository.findStatusAttemptByTokenDigest).mockResolvedValueOnce({
      capture: null,
      checkout: { id: checkoutId, status: 'CREATED', updatedAt: now },
      payment: null,
      quote: { expiresAt: new Date('2026-09-03T09:59:59.000Z'), territoryVersion: 7n },
      reconciliation: null,
      territory: { ownerCompanyId: null, version: 7n },
      token: { expiresAt: later, revokedAt: null },
    });
    const service = createService(repository);

    await expect(service.getStatus('A'.repeat(43))).resolves.toMatchObject({
      checkoutId,
      state: 'QUOTE_EXPIRED',
      terminal: true,
    });
  });

  it('rejects expired quotes before provider checkout creation', async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(repository.findQuoteForCheckout).mockResolvedValueOnce({
      companyId,
      consumedAt: null,
      currency: 'USD',
      expiresAt: new Date('2026-09-03T09:59:59.000Z'),
      id: quoteId,
      minimumAmountMinor: 1500n,
      status: 'ACTIVE',
      territory: {
        availabilityStatus: 'ACTIVE',
        currency: 'USD',
        id: territoryId,
        minimumTakeoverAmountMinor: 1500n,
        slug: 'ai-coding',
        version: 7n,
      },
      territoryId,
      territoryVersion: 7n,
    });
    const service = createService(repository, provider);

    await expect(service.createCheckout({ companyId, quoteId })).rejects.toBeInstanceOf(
      CheckoutQuoteExpiredError,
    );
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
});
