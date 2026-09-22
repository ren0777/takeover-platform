import './setup.js';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseClient } from '@takeover/database';
import { UnavailablePaymentProvider } from '../../src/modules/takeover/payment-provider.js';
import { PrismaTakeoverRepository } from '../../src/modules/takeover/prisma-repository.js';
import { TakeoverReconciliationDriver } from '../../src/modules/takeover/reconciliation-driver.js';
import {
  PaymentProviderRefundError,
  TakeoverService,
  type PaymentProvider,
} from '../../src/modules/takeover/service.js';

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
    lookupRefund: vi.fn(async () => null),
  };
}

function createService(provider = createProvider()) {
  return {
    provider,
    service: new TakeoverService({
      checkout: { enabled: true },
      clock: { now: () => now },
      provider,
      repository: new PrismaTakeoverRepository(prisma),
      statusTokenSecret: new Uint8Array(32).fill(7),
      statusTokenTtlSeconds: 86_400,
      trustedWebOrigin: 'https://app.example',
    }),
  };
}

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

async function createCheckoutForFixture(service: TakeoverService, companyId = fixture.companyId) {
  const quote = await service.createQuote({
    companyId,
    territorySlug: fixture.territorySlug,
  });
  const checkout = await service.createCheckout({
    companyId,
    quoteId: quote.quoteId,
  });
  return { checkout, quote };
}

async function ingestDodoWebhook(
  service: TakeoverService,
  input: {
    amountMinor?: bigint;
    checkoutId: string;
    currency?: string;
    eventId: string;
    eventType: string;
    paymentId: string;
    providerCheckoutId: string;
    quoteId: string;
    refundId?: string;
  },
) {
  return service.processVerifiedProviderWebhook({
    ...(input.amountMinor === undefined ? {} : { amountMinor: input.amountMinor }),
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    eventType: input.eventType,
    metadata: {
      ...(input.amountMinor === undefined ? {} : { amount_minor: Number(input.amountMinor) }),
      checkout_id: input.checkoutId,
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      quote_id: input.quoteId,
    },
    payload: { data: { payment_id: input.paymentId }, type: input.eventType },
    provider: 'DODO',
    providerCheckoutId: input.providerCheckoutId,
    providerEventId: input.eventId,
    providerPaymentId: input.paymentId,
    ...(input.refundId === undefined ? {} : { providerRefundId: input.refundId }),
    signatureDigest: new Uint8Array(32).fill(12),
  });
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
  it('keeps a completed refund terminal when a later refund.failed webhook arrives', async () => {
    const { service } = createService(createProvider('DODO'));
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
      providerPaymentId: `pay-refund-ordering-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-succeeded-${fixture.suffix}`,
      eventType: 'refund.succeeded',
      paymentId: `pay-refund-ordering-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-succeeded-${fixture.suffix}`,
    });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-succeeded-${fixture.suffix}`,
      status: 'COMPLETED',
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-failed-${fixture.suffix}`,
      eventType: 'refund.failed',
      paymentId: `pay-refund-ordering-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-failed-${fixture.suffix}`,
    });

    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-succeeded-${fixture.suffix}`,
      status: 'COMPLETED',
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
    await expect(
      prisma.ownershipCapture.findUniqueOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
    await expect(service.getStatus(checkout.statusToken)).resolves.toMatchObject({
      state: 'REFUNDED',
      terminal: true,
    });
  });

  it('completes the refund obligation when provider success follows a recorded failure', async () => {
    const { service } = createService(createProvider('DODO'));
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
      providerPaymentId: `pay-refund-forward-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-forward-failed-${fixture.suffix}`,
      eventType: 'refund.failed',
      paymentId: `pay-refund-forward-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-failed-first-${fixture.suffix}`,
    });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-failed-first-${fixture.suffix}`,
      status: 'FAILED',
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-forward-succeeded-${fixture.suffix}`,
      eventType: 'refund.succeeded',
      paymentId: `pay-refund-forward-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-late-success-${fixture.suffix}`,
    });

    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-late-success-${fixture.suffix}`,
      status: 'COMPLETED',
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
  });

  it('uses one provider refund across two concurrent service instances', async () => {
    const provider = createProvider('DODO');
    let releaseRefund!: () => void;
    const refundGate = new Promise<void>((resolve) => {
      releaseRefund = resolve;
    });
    vi.mocked(provider.refundPayment).mockImplementationOnce(() =>
      refundGate.then(() => ({
        providerRefundId: `refund-${fixture.suffix}`,
        status: 'pending' as const,
      })),
    );
    const { service: setupService } = createService(provider);
    const { service: serviceA } = createService(provider);
    const { service: serviceB } = createService(provider);
    const quote = await setupService.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await setupService.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    // Increment territory version to simulate capture race
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await setupService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-refund-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    const firstPromise = serviceA.requestRefundForReconciliation(payment.id);
    // Barrier 1: the claim holder has reached the provider.
    while (vi.mocked(provider.refundPayment).mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // Barrier 2: the racer runs to completion while the holder is still in
    // flight, so it deterministically observes the holder's fresh claim,
    // fails to steal it, and records a pending outcome instead of posting.
    const second = await serviceB.requestRefundForReconciliation(payment.id);
    expect(second).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
    releaseRefund();
    const first = await firstPromise;

    expect(first).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
    expect(provider.lookupRefund).toHaveBeenCalledTimes(2);
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-${fixture.suffix}`,
      status: 'PENDING',
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('keeps a completed refund terminal when a later refund.failed webhook arrives', async () => {
    const { service } = createService(createProvider('DODO'));
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
      providerPaymentId: `pay-refund-ordering-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-succeeded-${fixture.suffix}`,
      eventType: 'refund.succeeded',
      paymentId: `pay-refund-ordering-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-succeeded-${fixture.suffix}`,
    });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-succeeded-${fixture.suffix}`,
      status: 'COMPLETED',
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-failed-${fixture.suffix}`,
      eventType: 'refund.failed',
      paymentId: `pay-refund-ordering-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-failed-${fixture.suffix}`,
    });

    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-succeeded-${fixture.suffix}`,
      status: 'COMPLETED',
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
    await expect(
      prisma.ownershipCapture.findUniqueOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
    await expect(service.getStatus(checkout.statusToken)).resolves.toMatchObject({
      state: 'REFUNDED',
      terminal: true,
    });
  });

  it('completes the refund obligation when provider success follows a recorded failure', async () => {
    const { service } = createService(createProvider('DODO'));
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
      providerPaymentId: `pay-refund-forward-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-forward-failed-${fixture.suffix}`,
      eventType: 'refund.failed',
      paymentId: `pay-refund-forward-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-failed-first-${fixture.suffix}`,
    });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-failed-first-${fixture.suffix}`,
      status: 'FAILED',
    });

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-forward-succeeded-${fixture.suffix}`,
      eventType: 'refund.succeeded',
      paymentId: `pay-refund-forward-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-late-success-${fixture.suffix}`,
    });

    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-late-success-${fixture.suffix}`,
      status: 'COMPLETED',
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
  });

  it('retries the refund obligation after a definite provider rejection', async () => {
    const provider = createProvider('DODO');
    vi.mocked(provider.refundPayment).mockImplementationOnce(async () => {
      throw new PaymentProviderRefundError('Dodo refund request timed out', { retryable: true });
    });
    const { service: firstService } = createService(provider);
    const { service: retryService } = createService(provider);
    const quote = await firstService.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await firstService.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await firstService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-refund-retry-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    // Holder claims, posts, and loses the response; the provider processes
    // the refund attempt and definitively rejects it.
    await expect(firstService.requestRefundForReconciliation(payment.id)).resolves.toMatchObject({
      state: 'RECONCILIATION_REQUIRED',
      terminal: false,
    });
    await ingestDodoWebhook(firstService, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-refund-rejected-${fixture.suffix}`,
      eventType: 'refund.failed',
      paymentId: `pay-refund-retry-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
      refundId: `ref-rejected-${fixture.suffix}`,
    });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-rejected-${fixture.suffix}`,
      status: 'FAILED',
    });

    // A rejected refund moved no money: the obligation must be claimable and
    // retryable, not permanently blocked by the rejected attempt's reference.
    await expect(retryService.requestRefundForReconciliation(payment.id)).resolves.toMatchObject({
      state: 'REFUND_PENDING',
      terminal: false,
    });
    expect(provider.refundPayment).toHaveBeenCalledTimes(2);
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-${fixture.suffix}`,
      status: 'PENDING',
    });
  });

  it('recovers a stale refund claim left before the provider call', async () => {
    const provider = createProvider('DODO');
    const { service: setupService } = createService(provider);
    const { service: recoveryService } = createService(provider);
    const quote = await setupService.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await setupService.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await setupService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-crash-a-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await new PrismaTakeoverRepository(prisma).beginRefundForReconciliation(payment.id);
    const staleClaim = `CLAIMED_${String(now.getTime() - 600_000).padStart(13, '0')}_dead`;
    await prisma.paymentReconciliationAction.update({
      data: { providerRefundReference: staleClaim },
      where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
    });

    const status = await recoveryService.requestRefundForReconciliation(payment.id);

    expect(status).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
    expect(provider.lookupRefund).toHaveBeenCalledTimes(1);
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
    expect(vi.mocked(provider.lookupRefund).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(provider.refundPayment).mock.invocationCallOrder[0] ?? 0,
    );
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-${fixture.suffix}`,
      status: 'PENDING',
    });
  });

  it('does not double post when an accepted refund is temporarily invisible to lookup', async () => {
    const provider = createProvider('DODO');
    vi.mocked(provider.lookupRefund).mockResolvedValue(null);
    vi.mocked(provider.refundPayment).mockImplementationOnce(async () => {
      throw new PaymentProviderRefundError('refund request timed out', { retryable: true });
    });
    const { service: firstService } = createService(provider);
    const { service: secondService } = createService(provider);
    const quote = await firstService.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await firstService.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await firstService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-invisible-refund-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    const first = await firstService.requestRefundForReconciliation(payment.id);
    const second = await secondService.requestRefundForReconciliation(payment.id);

    expect(first).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
    expect(second).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
    expect(provider.lookupRefund).toHaveBeenCalledTimes(2);
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
    const action = await prisma.paymentReconciliationAction.findUniqueOrThrow({
      where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
    });
    expect(action.providerRefundReference).toMatch(/^CLAIMED_\d{13}_/);
    expect(action.status).toBe('PENDING');
  });

  it('recovers an accepted provider refund after local reference persistence was lost', async () => {
    const provider = createProvider('DODO');
    vi.mocked(provider.lookupRefund).mockResolvedValue({
      providerRefundId: `refund-existing-${fixture.suffix}`,
      status: 'pending',
    });
    const { service: setupService } = createService(provider);
    const { service: recoveryService } = createService(provider);
    const quote = await setupService.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await setupService.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await setupService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-crash-b-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await new PrismaTakeoverRepository(prisma).beginRefundForReconciliation(payment.id);
    const staleClaim = `CLAIMED_${String(now.getTime() - 600_000).padStart(13, '0')}_dead`;
    await prisma.paymentReconciliationAction.update({
      data: { providerRefundReference: staleClaim },
      where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
    });

    const status = await recoveryService.requestRefundForReconciliation(payment.id);

    expect(status).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
    expect(provider.lookupRefund).toHaveBeenCalledTimes(1);
    expect(provider.refundPayment).not.toHaveBeenCalled();
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-existing-${fixture.suffix}`,
      status: 'PENDING',
    });
  });

  it('resolves an unknown refund POST outcome by lookup before retrying', async () => {
    const provider = createProvider('DODO');
    let accepted = false;
    vi.mocked(provider.lookupRefund).mockImplementation(async () =>
      accepted ? { providerRefundId: `refund-timeout-${fixture.suffix}`, status: 'pending' } : null,
    );
    vi.mocked(provider.refundPayment).mockImplementationOnce(async () => {
      accepted = true;
      throw new Error('network timeout after provider accepted refund');
    });
    const { service: firstService } = createService(provider);
    const { service: secondService } = createService(provider);
    const quote = await firstService.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    const checkout = await firstService.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await firstService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `pay-unknown-outcome-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    const first = await firstService.requestRefundForReconciliation(payment.id);
    const second = await secondService.requestRefundForReconciliation(payment.id);

    expect(first).toMatchObject({ state: 'RECONCILIATION_REQUIRED', terminal: false });
    expect(second).toMatchObject({ state: 'REFUND_PENDING', terminal: false });
    expect(provider.lookupRefund).toHaveBeenCalledTimes(2);
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-timeout-${fixture.suffix}`,
      status: 'PENDING',
    });
  });

  it('does not project refund pending from a placeholder-only claim', async () => {
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
      providerPaymentId: `pay-placeholder-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await new PrismaTakeoverRepository(prisma).beginRefundForReconciliation(payment.id);
    const placeholder = `CLAIMED_${String(now.getTime()).padStart(13, '0')}_holder`;
    await prisma.paymentReconciliationAction.update({
      data: { providerRefundReference: placeholder },
      where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
    });

    await expect(service.getStatus(checkout.statusToken)).resolves.toMatchObject({
      state: 'RECONCILIATION_REQUIRED',
      terminal: false,
    });

    await prisma.paymentReconciliationAction.update({
      data: { providerRefundReference: `refund-${fixture.suffix}` },
      where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
    });
    await expect(service.getStatus(checkout.statusToken)).resolves.toMatchObject({
      state: 'REFUND_PENDING',
      terminal: false,
    });
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

  it('preserves out-of-order refund webhook truth over later local result persistence', async () => {
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
      providerPaymentId: `pay-refund-order-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await new PrismaTakeoverRepository(prisma).beginRefundForReconciliation(payment.id);
    await prisma.paymentReconciliationAction.update({
      data: {
        providerRefundReference: `CLAIMED_${String(now.getTime()).padStart(13, '0')}_holder`,
      },
      where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
    });

    const webhookStatus = await service.processVerifiedProviderWebhook({
      amountMinor: 1500n,
      currency: 'USD',
      eventType: 'refund.succeeded',
      metadata: {
        amount_minor: 1500,
        currency: 'USD',
        payment_id: payment.id,
      },
      payload: { data: { refund_id: `ref-webhook-${fixture.suffix}` }, type: 'refund.succeeded' },
      provider: 'DODO',
      providerEventId: `msg-refund-order-${fixture.suffix}`,
      providerPaymentId: `pay-refund-order-${fixture.suffix}`,
      providerRefundId: `ref-webhook-${fixture.suffix}`,
      signatureDigest: new Uint8Array(32).fill(14),
    });
    const lateLocalStatus = await new PrismaTakeoverRepository(prisma).recordRefundRequestResult({
      paymentId: payment.id,
      providerRefundId: `ref-local-late-${fixture.suffix}`,
      status: 'pending',
    });

    expect(webhookStatus).toMatchObject({ state: 'REFUNDED', terminal: true });
    expect(lateLocalStatus.payment).toMatchObject({ status: 'REFUNDED' });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-webhook-${fixture.suffix}`,
      status: 'COMPLETED',
    });
  });

  it('preserves completed refund truth over a later local failure handler', async () => {
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
      providerPaymentId: `pay-refund-failure-race-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await new PrismaTakeoverRepository(prisma).beginRefundForReconciliation(payment.id);

    await service.processVerifiedProviderWebhook({
      amountMinor: 1500n,
      currency: 'USD',
      eventType: 'refund.succeeded',
      metadata: {
        amount_minor: 1500,
        currency: 'USD',
        payment_id: payment.id,
      },
      payload: {
        data: { refund_id: `ref-completed-${fixture.suffix}` },
        type: 'refund.succeeded',
      },
      provider: 'DODO',
      providerEventId: `msg-refund-failure-race-${fixture.suffix}`,
      providerPaymentId: `pay-refund-failure-race-${fixture.suffix}`,
      providerRefundId: `ref-completed-${fixture.suffix}`,
      signatureDigest: new Uint8Array(32).fill(16),
    });
    const lateFailureStatus = await new PrismaTakeoverRepository(prisma).recordRefundRequestFailure(
      {
        paymentId: payment.id,
        reason: 'late local timeout handler',
        status: 'PENDING',
      },
    );

    expect(lateFailureStatus.payment).toMatchObject({ status: 'REFUNDED' });
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-completed-${fixture.suffix}`,
      reason: 'REFUND_SUCCEEDED',
      status: 'COMPLETED',
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
  });

  it('preserves out-of-order refund failure over later pending local result persistence', async () => {
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
      providerPaymentId: `pay-refund-failed-order-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await new PrismaTakeoverRepository(prisma).beginRefundForReconciliation(payment.id);

    await service.processVerifiedProviderWebhook({
      amountMinor: 1500n,
      currency: 'USD',
      eventType: 'refund.failed',
      metadata: {
        amount_minor: 1500,
        currency: 'USD',
        payment_id: payment.id,
      },
      payload: { data: { refund_id: `ref-failed-${fixture.suffix}` }, type: 'refund.failed' },
      provider: 'DODO',
      providerEventId: `msg-refund-failed-order-${fixture.suffix}`,
      providerPaymentId: `pay-refund-failed-order-${fixture.suffix}`,
      providerRefundId: `ref-failed-${fixture.suffix}`,
      signatureDigest: new Uint8Array(32).fill(15),
    });
    await new PrismaTakeoverRepository(prisma).recordRefundRequestResult({
      paymentId: payment.id,
      providerRefundId: `ref-local-late-${fixture.suffix}`,
      status: 'pending',
    });

    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `ref-failed-${fixture.suffix}`,
      status: 'FAILED',
    });
  });

  it('keeps refunded payment terminal when late payment webhooks arrive out of order', async () => {
    const provider = createProvider('DODO');
    const { service } = createService(provider);
    const { checkout, quote } = await createCheckoutForFixture(service);
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    const providerPaymentId = `pay-late-refunded-${fixture.suffix}`;
    await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    await service.requestRefundForReconciliation(payment.id);
    await service.processVerifiedProviderWebhook({
      amountMinor: 1500n,
      currency: 'USD',
      eventType: 'refund.succeeded',
      metadata: { amount_minor: 1500, currency: 'USD', payment_id: payment.id },
      payload: { data: { refund_id: `ref-late-${fixture.suffix}` }, type: 'refund.succeeded' },
      provider: 'DODO',
      providerEventId: `msg-late-refund-${fixture.suffix}`,
      providerPaymentId,
      providerRefundId: `ref-late-${fixture.suffix}`,
      signatureDigest: new Uint8Array(32).fill(13),
    });

    const lateSucceeded = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-late-payment-success-${fixture.suffix}`,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });
    const lateFailed = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-late-payment-failed-${fixture.suffix}`,
      eventType: 'payment.failed',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });
    const lateProcessing = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-late-payment-processing-${fixture.suffix}`,
      eventType: 'payment.processing',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    expect(lateSucceeded).toMatchObject({ state: 'REFUNDED', terminal: true });
    expect(lateFailed).toMatchObject({ state: 'REFUNDED', terminal: true });
    expect(lateProcessing).toMatchObject({ state: 'REFUNDED', terminal: true });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({
      status: 'REFUNDED',
    });
    await expect(prisma.ownershipCapture.count({ where: { paymentId: payment.id } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.ownershipCapture.findUniqueOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({ status: 'REFUNDED' });
    await expect(
      prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).resolves.toBe(0);
  });

  it('does not downgrade confirmed money when late failed payment webhooks arrive', async () => {
    const { service } = createService(createProvider('DODO'));
    const { checkout, quote } = await createCheckoutForFixture(service);
    const providerPaymentId = `pay-late-failed-${fixture.suffix}`;
    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-payment-success-${fixture.suffix}`,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    const lateFailed = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-payment-failed-after-success-${fixture.suffix}`,
      eventType: 'payment.failed',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    expect(lateFailed).toMatchObject({ state: 'CAPTURED', terminal: true });
    await expect(
      prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
    const payment = await prisma.payment.findFirstOrThrow({
      select: { id: true },
      where: { checkoutId: checkout.checkoutId },
    });
    await expect(prisma.ownershipCapture.count({ where: { paymentId: payment.id } })).resolves.toBe(
      1,
    );
  });

  it('reconciles provider payment id reuse with a different checkout', async () => {
    const { service } = createService(createProvider('DODO'));
    const { checkout, quote } = await createCheckoutForFixture(service);
    const providerPaymentId = `pay-reused-checkout-${fixture.suffix}`;
    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-reused-payment-original-${fixture.suffix}`,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });
    // A claimed territory is never quoted (no takeover pricing policy exists),
    // so the first reign ends before the same company is quoted again. The
    // scenario under test is provider payment-id reuse, not re-capture.
    const reign = await prisma.territoryOwnership.findFirstOrThrow({
      where: { endedAt: null, territoryId: fixture.territoryId },
    });
    await prisma.territoryOwnership.update({
      data: { endedAt: new Date(reign.capturedAt.getTime() + 1_000) },
      where: { id: reign.id },
    });
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 2000n },
      where: { id: fixture.territoryId },
    });
    const second = await createCheckoutForFixture(service);

    const status = await ingestDodoWebhook(service, {
      amountMinor: 2000n,
      checkoutId: second.checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-reused-payment-second-${fixture.suffix}`,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${second.checkout.checkoutId}`,
      quoteId: second.quote.quoteId,
    });

    expect(status).toMatchObject({ state: 'CAPTURED', terminal: true });
    await expect(
      prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toMatchObject({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      status: 'CONFIRMED',
    });
    await expect(
      prisma.paymentReconciliationAction.count({ where: { reason: 'PROVIDER_PAYMENT_MISMATCH' } }),
    ).resolves.toBe(1);
  });

  it.each([
    ['amount', 1600n, 'USD'],
    ['currency', 1500n, 'EUR'],
  ])(
    'reconciles provider payment id reuse with a different %s',
    async (_field, amountMinor, currency) => {
      const { service } = createService(createProvider('DODO'));
      const { checkout, quote } = await createCheckoutForFixture(service);
      const providerPaymentId = `pay-reused-${_field}-${fixture.suffix}`;
      await ingestDodoWebhook(service, {
        amountMinor: 1500n,
        checkoutId: checkout.checkoutId,
        currency: 'USD',
        eventId: `msg-reused-${_field}-original-${fixture.suffix}`,
        eventType: 'payment.succeeded',
        paymentId: providerPaymentId,
        providerCheckoutId: `provider-${checkout.checkoutId}`,
        quoteId: quote.quoteId,
      });

      const status = await ingestDodoWebhook(service, {
        amountMinor,
        checkoutId: checkout.checkoutId,
        currency,
        eventId: `msg-reused-${_field}-mismatch-${fixture.suffix}`,
        eventType: 'payment.succeeded',
        paymentId: providerPaymentId,
        providerCheckoutId: `provider-${checkout.checkoutId}`,
        quoteId: quote.quoteId,
      });

      expect(status).toMatchObject({ state: 'CAPTURED', terminal: true });
      await expect(
        prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
      ).resolves.toMatchObject({ amountMinor: 1500n, currency: 'USD', status: 'CONFIRMED' });
      await expect(
        prisma.paymentReconciliationAction.count({
          where: { reason: 'PROVIDER_PAYMENT_MISMATCH' },
        }),
      ).resolves.toBe(1);
    },
  );

  it('rejects checkout of another company quote without provider side effects', async () => {
    const { provider, service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    await expect(
      service.createCheckout({
        companyId: fixture.secondCompanyId,
        quoteId: quote.quoteId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });

    expect(provider.createCheckout).not.toHaveBeenCalled();
    await expect(prisma.checkoutSession.count()).resolves.toBe(0);
    const storedQuote = await prisma.takeoverQuote.findUniqueOrThrow({
      select: { consumedAt: true },
      where: { id: quote.quoteId },
    });
    expect(storedQuote.consumedAt).toBeNull();
  });

  it('rejects checkout when the territory price changed after the quote was issued', async () => {
    const { provider, service } = createService();
    const quote = await service.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 2000n },
      where: { id: fixture.territoryId },
    });

    await expect(
      service.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
    ).rejects.toMatchObject({ code: 'TAKEOVER_PRICE_CHANGED', statusCode: 409 });

    expect(provider.createCheckout).not.toHaveBeenCalled();
    await expect(prisma.checkoutSession.count()).resolves.toBe(0);
  });

  it('polls the browser status endpoint without mutating money or ownership state', async () => {
    const { service } = createService(createProvider('DODO'));
    const { checkout } = await createCheckoutForFixture(service);
    await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `payment-poll-${fixture.suffix}`,
    });

    const snapshot = async () => {
      const payments = await prisma.payment.findMany({
        select: { id: true, status: true },
        where: { checkoutId: checkout.checkoutId },
      });
      const captures = await prisma.ownershipCapture.findMany({
        select: { id: true, status: true },
        where: { paymentId: { in: payments.map((payment) => payment.id) } },
      });
      const ownership = await prisma.territoryOwnership.findMany({
        select: { companyId: true, endedAt: true },
        where: { territoryId: fixture.territoryId },
      });
      return { captures, ownership, payments };
    };
    const before = await snapshot();
    for (let poll = 0; poll < 3; poll += 1) {
      await expect(service.getStatus(checkout.statusToken)).resolves.toMatchObject({
        state: 'CAPTURED',
        terminal: true,
      });
    }
    expect(await snapshot()).toEqual(before);
    expect(before.payments).toHaveLength(1);
    expect(before.captures).toHaveLength(1);
    expect(before.ownership).toHaveLength(1);
  });

  it('invokes the payment provider at most once when two instances race one quote', async () => {
    const providerCalls: Array<Promise<{
      providerCheckoutId: string;
      providerCheckoutUrl: string;
    }>> = [];
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const gatedProvider: PaymentProvider = {
      name: 'GATED_PROVIDER',
      createCheckout: vi.fn(() => {
        const result = gate.then(() => ({
          providerCheckoutId: `provider-race-${providerCalls.length + 1}`,
          providerCheckoutUrl: `https://pay.example/race-${providerCalls.length + 1}`,
        }));
        providerCalls.push(result);
        return result;
      }),
      refundPayment: vi.fn(async () => ({
        providerRefundId: `refund-${fixture.suffix}`,
        status: 'pending' as const,
      })),
      lookupRefund: vi.fn(async () => null),
    };
    const serviceOptions = {
      clock: { now: () => now },
      provider: gatedProvider,
      statusTokenSecret: new Uint8Array(32).fill(7),
      statusTokenTtlSeconds: 86_400,
      trustedWebOrigin: 'https://app.example',
    } as const;
    // Two fully independent service/repository pairs over one shared Postgres,
    // mirroring two API replicas racing the same quote.
    const first = new TakeoverService({
      checkout: { enabled: true },
      ...serviceOptions,
      repository: new PrismaTakeoverRepository(prisma),
    });
    const second = new TakeoverService({
      checkout: { enabled: true },
      ...serviceOptions,
      repository: new PrismaTakeoverRepository(prisma),
    });
    const quote = await first.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    const settled = Promise.all([
      first.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
      second.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
    ]);
    // Release the provider gate once both racing calls have arrived, or after a
    // bounded wait when the fixed implementation only ever makes one call.
    const deadline = Date.now() + 400;
    while (providerCalls.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseGate();
    const [checkoutA, checkoutB] = await settled;

    expect(gatedProvider.createCheckout).toHaveBeenCalledTimes(1);
    expect(checkoutB.checkoutId).toBe(checkoutA.checkoutId);
    expect(checkoutB.providerCheckoutUrl).toBe(checkoutA.providerCheckoutUrl);
    await expect(
      prisma.checkoutSession.count({ where: { quoteId: quote.quoteId } }),
    ).resolves.toBe(1);
  });

  it('rejects a racing checkout with a conflict while the first creation is still in flight', async () => {
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const gatedProvider: PaymentProvider = {
      name: 'GATED_PROVIDER',
      createCheckout: vi.fn(
        async (input: { checkoutId: string }) =>
          gate.then(() => ({
            providerCheckoutId: `provider-stuck-${input.checkoutId.slice(0, 8)}`,
            providerCheckoutUrl: `https://pay.example/stuck-${input.checkoutId.slice(0, 8)}`,
          })),
      ),
      refundPayment: vi.fn(async () => ({
        providerRefundId: `refund-${fixture.suffix}`,
        status: 'pending' as const,
      })),
      lookupRefund: vi.fn(async () => null),
    };
    const first = new TakeoverService({
      checkout: { enabled: true },
      clock: { now: () => now },
      provider: gatedProvider,
      repository: new PrismaTakeoverRepository(prisma),
      statusTokenSecret: new Uint8Array(32).fill(7),
      statusTokenTtlSeconds: 86_400,
      trustedWebOrigin: 'https://app.example',
    });
    const second = new TakeoverService({
      checkout: { enabled: true },
      clock: { now: () => now },
      checkoutReusePollAttempts: 4,
      checkoutReusePollIntervalMs: 5,
      provider: gatedProvider,
      repository: new PrismaTakeoverRepository(prisma),
      statusTokenSecret: new Uint8Array(32).fill(7),
      statusTokenTtlSeconds: 86_400,
      trustedWebOrigin: 'https://app.example',
    });
    const quote = await first.createQuote({
      companyId: fixture.companyId,
      territorySlug: fixture.territorySlug,
    });

    const firstCheckout = first.createCheckout({
      companyId: fixture.companyId,
      quoteId: quote.quoteId,
    });
    // Wait until the creator has actually reached the provider before racing.
    const creatorReachedProvider = vi.mocked(gatedProvider.createCheckout).mock.calls.length;
    const deadline = Date.now() + 5_000;
    while (
      vi.mocked(gatedProvider.createCheckout).mock.calls.length === creatorReachedProvider &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // The creator never resolves within the racer's bounded poll window; a
    // safety release keeps the test fast even while the bug is present.
    const safetyRelease = setTimeout(releaseGate, 500);

    await expect(
      second.createCheckout({ companyId: fixture.companyId, quoteId: quote.quoteId }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });

    releaseGate();
    clearTimeout(safetyRelease);
    const checkout = await firstCheckout;
    expect(gatedProvider.createCheckout).toHaveBeenCalledTimes(1);
    expect(checkout.providerCheckoutUrl).toMatch(/^https:\/\/pay\.example\/stuck-/);
    await expect(
      prisma.checkoutSession.count({ where: { quoteId: quote.quoteId } }),
    ).resolves.toBe(1);
  });

  it('keeps a completed checkout terminal when a late provider result arrives', async () => {
    const { service } = createService(createProvider('DODO'));
    const { checkout } = await createCheckoutForFixture(service);
    await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `payment-late-complete-${fixture.suffix}`,
    });

    const repository = new PrismaTakeoverRepository(prisma);
    await repository.completeCheckoutProviderResult({
      checkoutId: checkout.checkoutId,
      providerCheckoutId: 'late-provider-session',
      providerCheckoutUrl: 'https://pay.example/late',
    });

    await expect(
      prisma.checkoutSession.findUniqueOrThrow({
        select: { providerCheckoutId: true, status: true },
        where: { id: checkout.checkoutId },
      }),
    ).resolves.toMatchObject({ providerCheckoutId: `provider-${checkout.checkoutId}`, status: 'COMPLETED' });
  });

  it('discovers unresolved refund reconciliation obligations and ignores terminal refunds', async () => {
    const provider = createProvider('DODO');
    const { service } = createService(provider);
    const repository = new PrismaTakeoverRepository(prisma);
    const { checkout } = await createCheckoutForFixture(service);
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await service.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `payment-driver-discovery-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });

    await expect(
      repository.findRefundReconciliationCandidates({ limit: 10, now }),
    ).resolves.toContain(payment.id);

    await service.requestRefundForReconciliation(payment.id);

    await expect(
      repository.findRefundReconciliationCandidates({ limit: 10, now }),
    ).resolves.not.toContain(payment.id);
  });

  it('lets two reconciliation drivers race without double-posting a provider refund', async () => {
    const provider = createProvider('DODO');
    const { service: setupService } = createService(provider);
    const repository = new PrismaTakeoverRepository(prisma);
    const { checkout } = await createCheckoutForFixture(setupService);
    await prisma.territory.update({
      data: { version: { increment: 1 } },
      where: { id: fixture.territoryId },
    });
    await setupService.confirmProviderPayment({
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      provider: 'DODO',
      providerPaymentId: `payment-driver-race-${fixture.suffix}`,
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { checkoutId: checkout.checkoutId },
    });
    let discovered = 0;
    let releaseDiscovery: () => void = () => undefined;
    const bothDiscovered = new Promise<void>((resolve) => {
      releaseDiscovery = resolve;
    });
    const racingRepository = {
      findRefundReconciliationCandidates: vi.fn(async (input: { limit: number; now: Date }) => {
        const candidates = await repository.findRefundReconciliationCandidates(input);
        discovered += 1;
        if (discovered === 2) releaseDiscovery();
        await bothDiscovered;
        return candidates;
      }),
    };
    const firstDriver = new TakeoverReconciliationDriver({
      batchSize: 10,
      clock: { now: () => now },
      logger: silentLogger,
      repository: racingRepository,
      service: createService(provider).service,
    });
    const secondDriver = new TakeoverReconciliationDriver({
      batchSize: 10,
      clock: { now: () => now },
      logger: silentLogger,
      repository: racingRepository,
      service: createService(provider).service,
    });

    const [first, second] = await Promise.all([firstDriver.runOnce(), secondDriver.runOnce()]);

    expect(first.discovered + second.discovered).toBe(2);
    expect(racingRepository.findRefundReconciliationCandidates).toHaveBeenCalledTimes(2);
    expect(provider.refundPayment).toHaveBeenCalledTimes(1);
    await expect(
      prisma.paymentReconciliationAction.findUniqueOrThrow({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      }),
    ).resolves.toMatchObject({
      providerRefundReference: `refund-${fixture.suffix}`,
      status: 'PENDING',
    });
  });
});
