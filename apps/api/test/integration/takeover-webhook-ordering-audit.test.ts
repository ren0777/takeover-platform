import './setup.js';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseClient } from '@takeover/database';
import { PrismaTakeoverRepository } from '../../src/modules/takeover/prisma-repository.js';
import { TakeoverService, type PaymentProvider } from '../../src/modules/takeover/service.js';

/**
 * Regression coverage for intermediate, unsupported and out-of-order events.
 * Only explicit terminal payment events may change payment truth.
 */

const prisma = getDatabaseClient();
const now = new Date('2026-09-05T10:00:00.000Z');

type Fixture = {
  categoryId: string;
  companyId: string;
  suffix: string;
  territoryId: string;
  territorySlug: string;
};

let fixture: Fixture;

function createProvider(): PaymentProvider {
  return {
    name: 'DODO',
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

function createService() {
  return new TakeoverService({
    checkout: { enabled: true },
    clock: { now: () => now },
    provider: createProvider(),
    repository: new PrismaTakeoverRepository(prisma),
    statusTokenSecret: new Uint8Array(32).fill(7),
    statusTokenTtlSeconds: 86_400,
    trustedWebOrigin: 'https://app.example',
  });
}

async function createCheckoutForFixture(service: TakeoverService) {
  const quote = await service.createQuote({
    companyId: fixture.companyId,
    territorySlug: fixture.territorySlug,
  });
  const checkout = await service.createCheckout({
    companyId: fixture.companyId,
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
    signatureDigest: new Uint8Array(32).fill(12),
  });
}

beforeEach(async () => {
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.territoryCategory.create({
    data: { displayOrder: 701, name: `Webhook Audit ${suffix}`, slug: `webhook-audit-${suffix}` },
  });
  const company = await prisma.company.create({
    data: {
      name: `Webhook Audit Co ${suffix}`,
      normalizedName: `webhook audit co ${suffix}`,
      normalizedWebsite: `webhook-audit-${suffix}.example`,
      slug: `webhook-audit-co-${suffix}`,
      status: 'ACTIVE',
      websiteUrl: `https://webhook-audit-${suffix}.example/`,
    },
  });
  const territory = await prisma.territory.create({
    data: {
      availabilityStatus: 'ACTIVE',
      categoryId: category.id,
      currency: 'USD',
      description: 'Webhook ordering audit fixture',
      displayWeight: 42,
      minimumTakeoverAmountMinor: 1500n,
      name: `Webhook Audit Territory ${suffix}`,
      slug: `webhook-audit-territory-${suffix}`,
      version: 9n,
      visualMetadata: {},
    },
  });
  fixture = {
    categoryId: category.id,
    companyId: company.id,
    suffix,
    territoryId: territory.id,
    territorySlug: territory.slug,
  };
});

afterEach(async () => {
  const checkouts = await prisma.checkoutSession.findMany({
    select: { id: true },
    where: { companyId: fixture.companyId },
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
  await prisma.checkoutSession.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.takeoverQuote.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.territoryOwnership.deleteMany({ where: { territoryId: fixture.territoryId } });
  await prisma.territory.deleteMany({ where: { id: fixture.territoryId } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
  await prisma.territoryCategory.deleteMany({ where: { id: fixture.categoryId } });
});

describe('webhook event-type and ordering safety', () => {
  it('preserves pending payment on payment.processing without inventing a failed charge', async () => {
    const service = createService();
    const { checkout, quote } = await createCheckoutForFixture(service);
    const providerPaymentId = `pay-processing-${fixture.suffix}`;

    const status = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-processing-${fixture.suffix}`,
      eventType: 'payment.processing',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    expect(status).toBeUndefined();
    expect(await prisma.payment.count({ where: { checkoutId: checkout.checkoutId } })).toBe(0);
    expect(await service.getStatus(checkout.statusToken)).toMatchObject({ state: 'PENDING_PAYMENT' });
  });

  it('recovers to CAPTURED when payment.succeeded follows a payment.processing event', async () => {
    const service = createService();
    const { checkout, quote } = await createCheckoutForFixture(service);
    const providerPaymentId = `pay-proc-then-succeed-${fixture.suffix}`;

    await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-proc-${fixture.suffix}`,
      eventType: 'payment.processing',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    const afterSucceeded = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-succeed-after-proc-${fixture.suffix}`,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    // A signed intermediate event must not prevent a later matching success.
    expect(afterSucceeded).toMatchObject({ state: 'CAPTURED', terminal: true });
    await expect(
      prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('recovers to CAPTURED when payment.succeeded follows an explicit payment.failed event', async () => {
    const service = createService();
    const { checkout, quote } = await createCheckoutForFixture(service);
    const providerPaymentId = `pay-fail-then-succeed-${fixture.suffix}`;

    const failedFirst = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-fail-${fixture.suffix}`,
      eventType: 'payment.failed',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });
    expect(failedFirst).toMatchObject({ state: 'PAYMENT_FAILED' });

    const succeededSecond = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-succeed-after-fail-${fixture.suffix}`,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    expect(succeededSecond).toMatchObject({ state: 'CAPTURED', terminal: true });
  });

  it('ignores a same-event-id redelivery even when the reported amount differs', async () => {
    const service = createService();
    const { checkout, quote } = await createCheckoutForFixture(service);
    const providerPaymentId = `pay-same-id-diff-body-${fixture.suffix}`;
    const eventId = `msg-same-id-${fixture.suffix}`;

    const first = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });
    expect(first).toMatchObject({ state: 'CAPTURED' });

    // Second delivery reuses the identical provider event id but reports a
    // different amount. The unique (provider, providerEventId) constraint on
    // PaymentWebhookEvent rejects the insert outright (P2002), so this body is
    // never read for domain purposes at all.
    const second = await ingestDodoWebhook(service, {
      amountMinor: 999n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId,
      eventType: 'payment.succeeded',
      paymentId: providerPaymentId,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });
    expect(second).toBeUndefined();

    await expect(
      prisma.paymentWebhookEvent.count({ where: { provider: 'DODO', providerEventId: eventId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.payment.findFirstOrThrow({ where: { checkoutId: checkout.checkoutId } }),
    ).resolves.toMatchObject({ amountMinor: 1500n, status: 'CONFIRMED' });
  });

  it('records an unrecognized event without changing money or ownership', async () => {
    const service = createService();
    const { checkout, quote } = await createCheckoutForFixture(service);

    const status = await ingestDodoWebhook(service, {
      amountMinor: 1500n,
      checkoutId: checkout.checkoutId,
      currency: 'USD',
      eventId: `msg-unrecognized-${fixture.suffix}`,
      eventType: 'dispute.created',
      paymentId: `pay-unrecognized-${fixture.suffix}`,
      providerCheckoutId: `provider-${checkout.checkoutId}`,
      quoteId: quote.quoteId,
    });

    expect(status).toBeUndefined();
    expect(await prisma.payment.count({ where: { checkoutId: checkout.checkoutId } })).toBe(0);
    expect(await service.getStatus(checkout.statusToken)).toMatchObject({ state: 'PENDING_PAYMENT' });
  });
});
