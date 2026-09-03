import './setup.js';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseClient } from '@takeover/database';
import { UnavailablePaymentProvider } from '../../src/modules/takeover/payment-provider.js';
import { PrismaTakeoverRepository } from '../../src/modules/takeover/prisma-repository.js';
import { TakeoverService, type PaymentProvider } from '../../src/modules/takeover/service.js';

const prisma = getDatabaseClient();
const now = new Date('2026-09-03T10:00:00.000Z');

type Fixture = {
  categoryId: string;
  companyId: string;
  secondCompanyId: string;
  suffix: string;
  territoryId: string;
  territorySlug: string;
};

let fixture: Fixture;

function createProvider(name = 'TEST_PROVIDER'): PaymentProvider {
  return {
    name,
    createCheckout: vi.fn(async (input) => ({
      providerCheckoutId: `provider-${input.checkoutId}`,
      providerCheckoutUrl: `https://pay.example/${input.checkoutId}`,
    })),
    refundPayment: vi.fn(async () => ({
      providerRefundId: `refund-${fixture.suffix}`,
      status: 'pending' as const,
    })),
  };
}

function createService(provider = createProvider()) {
  return {
    provider,
    service: new TakeoverService({
      clock: { now: () => now },
      provider,
      repository: new PrismaTakeoverRepository(prisma),
      statusTokenSecret: new Uint8Array(32).fill(7),
      statusTokenTtlSeconds: 86_400,
      trustedWebOrigin: 'https://app.example',
    }),
  };
}

beforeEach(async () => {
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.territoryCategory.create({
    data: { displayOrder: 700, name: `Takeover API ${suffix}`, slug: `takeover-api-${suffix}` },
  });
  const company = await prisma.company.create({
    data: {
      name: `Takeover Company ${suffix}`,
      normalizedName: `takeover company ${suffix}`,
      normalizedWebsite: `takeover-${suffix}.example`,
      slug: `takeover-company-${suffix}`,
      status: 'ACTIVE',
      websiteUrl: `https://takeover-${suffix}.example/`,
    },
  });
  const secondCompany = await prisma.company.create({
    data: {
      name: `Takeover Company B ${suffix}`,
      normalizedName: `takeover company b ${suffix}`,
      normalizedWebsite: `takeover-b-${suffix}.example`,
      slug: `takeover-company-b-${suffix}`,
      status: 'ACTIVE',
      websiteUrl: `https://takeover-b-${suffix}.example/`,
    },
  });
  const territory = await prisma.territory.create({
    data: {
      availabilityStatus: 'ACTIVE',
      categoryId: category.id,
      currency: 'USD',
      description: 'Real PostgreSQL takeover service fixture',
      displayWeight: 42,
      minimumTakeoverAmountMinor: 1500n,
      name: `Takeover Territory ${suffix}`,
      slug: `takeover-territory-${suffix}`,
      version: 9n,
      visualMetadata: {},
    },
  });
  fixture = {
    categoryId: category.id,
    companyId: company.id,
    secondCompanyId: secondCompany.id,
    suffix,
    territoryId: territory.id,
    territorySlug: territory.slug,
  };
});

afterEach(async () => {
  const checkouts = await prisma.checkoutSession.findMany({
    select: { id: true },
    where: { companyId: { in: [fixture.companyId, fixture.secondCompanyId] } },
  });
  const checkoutIds = checkouts.map((checkout) => checkout.id);
  const payments =
    checkoutIds.length === 0
      ? []
      : await prisma.payment.findMany({
          select: { id: true },
          where: { checkoutId: { in: checkoutIds } },
        });
  const paymentIds = payments.map((payment) => payment.id);
  await prisma.paymentReconciliationAction.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.ownershipCapture.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.paymentWebhookEvent.deleteMany({
    where: {
      OR: [{ paymentId: { in: paymentIds } }, { providerEventId: { contains: fixture.suffix } }],
    },
  });
  await prisma.payment.deleteMany({ where: { checkoutId: { in: checkoutIds } } });
  await prisma.checkoutStatusToken.deleteMany({ where: { checkoutId: { in: checkoutIds } } });
  await prisma.checkoutSession.deleteMany({
    where: { companyId: { in: [fixture.companyId, fixture.secondCompanyId] } },
  });
  await prisma.takeoverQuote.deleteMany({
    where: { companyId: { in: [fixture.companyId, fixture.secondCompanyId] } },
  });
  await prisma.territoryOwnership.deleteMany({ where: { territoryId: fixture.territoryId } });
  await prisma.territory.deleteMany({ where: { id: fixture.territoryId } });
  await prisma.company.deleteMany({
    where: { id: { in: [fixture.companyId, fixture.secondCompanyId] } },
  });
  await prisma.territoryCategory.deleteMany({ where: { id: fixture.categoryId } });
});

describe('TakeoverService with real PostgreSQL repository', () => {
  it('creates an authoritative quote and reuses the active quote for duplicates', async () => {
    const { service } = createService();

    const first = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const second = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    expect(second.quoteId).toBe(first.quoteId);
    expect(first).toMatchObject({
      minimumAmount: { amountMinor: 1500, currency: 'USD' },
      territoryVersion: '9',
    });
    await expect(
      prisma.takeoverQuote.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(1);
  });

  it('stores only status token digests and returns status through the raw capability', async () => {
    const { provider, service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    const repeated = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });

    expect(repeated.checkoutId).toBe(checkout.checkoutId);
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);
    expect(await prisma.checkoutSession.count({ where: { quoteId: quote.quoteId } })).toBe(1);
    expect(
      await prisma.checkoutStatusToken.count({ where: { checkoutId: checkout.checkoutId } }),
    ).toBe(2);
    const rawJson = JSON.stringify(
      await prisma.checkoutStatusToken.findMany({ where: { checkoutId: checkout.checkoutId } }),
    );
    expect(rawJson).not.toContain(checkout.statusToken);
    await expect(service.getStatus(checkout.statusToken)).resolves.toMatchObject({
      checkoutId: checkout.checkoutId,
      state: 'PENDING_PAYMENT',
      terminal: false,
    });
  });

  it('does not create two checkout rows for concurrent duplicate checkout requests', async () => {
    const { service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    const [first, second] = await Promise.all([
      service.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
      service.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
    ]);

    expect(second.checkoutId).toBe(first.checkoutId);
    await expect(prisma.checkoutSession.count({ where: { quoteId: quote.quoteId } })).resolves.toBe(
      1,
    );
  });

  it('keeps checkout creation unavailable when no payment provider is configured', async () => {
    const { service } = createService(new UnavailablePaymentProvider());
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    await expect(
      service.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('confirms provider-neutral money and captures ownership through the CAS primitive', async () => {
    const { service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });

    const status = await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'TEST_PROVIDER',
      providerPaymentId: `payment-${fixture.suffix}`,
    });

    expect(status).toMatchObject({
      checkoutId: checkout.checkoutId,
      newOwnerCompanyId: fixture.companyId,
      state: 'CAPTURED',
      terminal: true,
    });
    await expect(
      prisma.territoryOwnership.findFirst({
        where: { endedAt: null, territoryId: fixture.territoryId },
      }),
    ).resolves.toMatchObject({
      companyId: fixture.companyId,
      source: 'PAID_CAPTURE',
      territoryVersion: 10n,
    });
    await expect(
      prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toMatchObject({
      amountMinor: 1500n,
      currency: 'USD',
      status: 'CONFIRMED',
    });
  });

  it('makes duplicate payment confirmation idempotent without duplicate capture', async () => {
    const { service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    const input = {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'TEST_PROVIDER',
      providerPaymentId: `payment-${fixture.suffix}`,
    };

    const [first, second] = await Promise.all([
      service.confirmProviderPayment(input),
      service.confirmProviderPayment(input),
    ]);

    expect(first.state).toBe('CAPTURED');
    expect(second.state).toBe('CAPTURED');
    await expect(
      prisma.payment.count({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toBe(1);
    const payments = await prisma.payment.findMany({
      select: { id: true },
      where: { checkoutId: checkout.checkoutId },
    });
    await expect(
      prisma.ownershipCapture.count({
        where: { paymentId: { in: payments.map((payment) => payment.id) } },
      }),
    ).resolves.toBe(1);
  });

  it('sends confirmed money to reconciliation when the territory version changed before capture', async () => {
    const { service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });

    const status = await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'TEST_PROVIDER',
      providerPaymentId: `payment-${fixture.suffix}`,
    });

    expect(status).toMatchObject({
      checkoutId: checkout.checkoutId,
      state: 'RECONCILIATION_REQUIRED',
      terminal: false,
    });
    await expect(
      prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toMatchObject({
      status: 'CONFIRMED',
    });
    const payment = await prisma.payment.findFirstOrThrow({
      select: { id: true },
      where: { checkoutId: checkout.checkoutId },
    });
    await expect(
      prisma.paymentReconciliationAction.count({ where: { paymentId: payment.id } }),
    ).resolves.toBe(1);
  });

  it('ingests a verified Dodo payment webhook once and captures ownership', async () => {
    const { service } = createService(createProvider('DODO'));
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    const providerCheckoutId = `provider-${checkout.checkoutId}`;

    const [first, second] = await Promise.all([
      service.processVerifiedProviderWebhook({
        amountMinor: 1500n,
        currency: 'USD',
        eventType: 'payment.succeeded',
        metadata: {
          amount_minor: 1500,
          checkout_id: checkout.checkoutId,
          currency: 'USD',
          quote_id: quote.quoteId,
        },
        payload: { data: { payment_id: `pay-${fixture.suffix}` }, type: 'payment.succeeded' },
        provider: 'DODO',
        providerCheckoutId,
        providerEventId: `msg-${fixture.suffix}`,
        providerPaymentId: `pay-${fixture.suffix}`,
        signatureDigest: new Uint8Array(32).fill(8),
      }),
      service.processVerifiedProviderWebhook({
        amountMinor: 1500n,
        currency: 'USD',
        eventType: 'payment.succeeded',
        metadata: {
          amount_minor: 1500,
          checkout_id: checkout.checkoutId,
          currency: 'USD',
          quote_id: quote.quoteId,
        },
        payload: { data: { payment_id: `pay-${fixture.suffix}` }, type: 'payment.succeeded' },
        provider: 'DODO',
        providerCheckoutId,
        providerEventId: `msg-${fixture.suffix}`,
        providerPaymentId: `pay-${fixture.suffix}`,
        signatureDigest: new Uint8Array(32).fill(8),
      }),
    ]);

    expect(first?.state ?? second?.state).toBe('CAPTURED');
    await expect(
      prisma.paymentWebhookEvent.count({
        where: { provider: 'DODO', providerEventId: `msg-${fixture.suffix}` },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.payment.count({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toBe(1);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await expect(prisma.ownershipCapture.count({ where: { paymentId: payment.id } })).resolves.toBe(
      1,
    );
  });

  it('records Dodo money mismatch for reconciliation without capture', async () => {
    const { service } = createService(createProvider('DODO'));
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });

    const status = await service.processVerifiedProviderWebhook({
      amountMinor: 1499n,
      currency: 'USD',
      eventType: 'payment.succeeded',
      metadata: {
        amount_minor: 1499,
        checkout_id: checkout.checkoutId,
        currency: 'USD',
        quote_id: quote.quoteId,
      },
      payload: {
        data: { payment_id: `pay-mismatch-${fixture.suffix}` },
        type: 'payment.succeeded',
      },
      provider: 'DODO',
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      providerEventId: `msg-mismatch-${fixture.suffix}`,
      providerPaymentId: `pay-mismatch-${fixture.suffix}`,
      signatureDigest: new Uint8Array(32).fill(9),
    });

    expect(status).toMatchObject({
      checkoutId: checkout.checkoutId,
      state: 'RECONCILIATION_REQUIRED',
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    expect(payment).toMatchObject({
      amountMinor: 1499n,
      currency: 'USD',
      status: 'RECONCILED',
    });
    await expect(prisma.ownershipCapture.count({ where: { paymentId: payment.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.paymentReconciliationAction.count({ where: { paymentId: payment.id } }),
    ).resolves.toBe(1);
  });

  it('records unknown Dodo checkout events without payment side effects', async () => {
    const { service } = createService();

    await expect(
      service.processVerifiedProviderWebhook({
        amountMinor: 1500n,
        currency: 'USD',
        eventType: 'payment.succeeded',
        metadata: {},
        payload: {
          data: { payment_id: `pay-unknown-${fixture.suffix}` },
          type: 'payment.succeeded',
        },
        provider: 'DODO',
        providerCheckoutId: `unknown-${fixture.suffix}`,
        providerEventId: `msg-unknown-${fixture.suffix}`,
        providerPaymentId: `pay-unknown-${fixture.suffix}`,
        signatureDigest: new Uint8Array(32).fill(10),
      }),
    ).resolves.toBeUndefined();

    await expect(
      prisma.paymentWebhookEvent.count({
        where: { provider: 'DODO', providerEventId: `msg-unknown-${fixture.suffix}` },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.payment.count({ where: { providerPaymentId: `pay-unknown-${fixture.suffix}` } }),
    ).resolves.toBe(0);
  });

  it('requests one refund for a confirmed payment that lost the capture race', async () => {
    const provider = createProvider('DODO');
    const { service } = createService(provider);
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-refund-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    const first = await service.requestRefundForReconciliation(payment.id);
    const second = await service.requestRefundForReconciliation(payment.id);

    expect(first).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
    expect(second).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-${fixture.suffix}`,
      status: 'PENDING',
    });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('marks a refund completed only after a verified provider refund webhook', async () => {
    const provider = createProvider('DODO');
    const { service } = createService(provider);
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await service.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-refunded-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await service.requestRefundForReconciliation(payment.id);

    const [first, second] = await Promise.all([
      service.processVerifiedProviderWebhook({
        amountMinor: 1500n,
        currency: 'USD',
        eventType: 'refund.succeeded',
        metadata: {
          amount_minor: 1500,
          currency: 'USD',
          payment_id: payment.id,
        },
        payload: { data: { refund_id: `ref-${fixture.suffix}` }, type: 'refund.succeeded' },
        provider: 'DODO',
        providerEventId: `msg-refund-${fixture.suffix}`,
        providerPaymentId: `pay-refunded-${fixture.suffix}`,
        providerRefundId: `ref-${fixture.suffix}`,
        signatureDigest: new Uint8Array(32).fill(11),
      }),
      service.processVerifiedProviderWebhook({
        amountMinor: 1500n,
        currency: 'USD',
        eventType: 'refund.succeeded',
        metadata: {
          amount_minor: 1500,
          currency: 'USD',
          payment_id: payment.id,
        },
        payload: { data: { refund_id: `ref-${fixture.suffix}` }, type: 'refund.succeeded' },
        provider: 'DODO',
        providerEventId: `msg-refund-${fixture.suffix}`,
        providerPaymentId: `pay-refunded-${fixture.suffix}`,
        providerRefundId: `ref-${fixture.suffix}`,
        signatureDigest: new Uint8Array(32).fill(11),
      }),
    ]);

    expect(first?.state ?? second?.state).toBe('REFUNDED');
    await expect(
      prisma.paymentWebhookEvent.count({
        where: { provider: 'DODO', providerEventId: `msg-refund-${fixture.suffix}` },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({
      status: 'REFUNDED',
    });
    await expect(
      prisma.ownershipCapture.findUniqueOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });
});
