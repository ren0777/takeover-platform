import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectDatabase, getDatabaseClient } from '../src/client.ts';

// Phase 3 uniqueness and check constraints proven against real PostgreSQL.
// Every row created here is removed in afterAll so later suites that assert
// on global counts (for example checkout_sessions) start from a clean table.
const prisma = getDatabaseClient();
const suffix = `phase3-${process.pid}-${Date.now()}`;

let companyId: string;
let categoryId: string;
let territoryId: string;

function fiveMinutesFromNow(): Date {
  return new Date(Date.now() + 5 * 60 * 1000);
}

async function firstCheckout() {
  return prisma.checkoutSession.findFirstOrThrow({ where: { companyId, provider: 'DODO' } });
}

beforeAll(async () => {
  const company = await prisma.company.create({
    data: {
      name: `TestCo ${suffix}`,
      normalizedName: `testco ${suffix}`,
      websiteUrl: `https://${suffix}.example.com`,
      normalizedWebsite: `${suffix}.example.com`,
      status: 'ACTIVE',
    },
  });
  companyId = company.id;
  const category = await prisma.territoryCategory.create({
    data: { slug: `test-cat-${suffix}`, name: 'Test Category', displayOrder: 1 },
  });
  categoryId = category.id;
  const territory = await prisma.territory.create({
    data: {
      slug: `test-territory-${suffix}`,
      name: 'Test Territory',
      categoryId,
      displayWeight: 10,
      availabilityStatus: 'ACTIVE',
      visualMetadata: {},
      version: 1,
      description: 'Test description',
      minimumTakeoverAmountMinor: 1000,
      currency: 'USD',
    },
  });
  territoryId = territory.id;
});

afterAll(async () => {
  const checkouts = await prisma.checkoutSession.findMany({
    select: { id: true },
    where: { companyId },
  });
  const checkoutIds = checkouts.map((checkout) => checkout.id);
  const payments = await prisma.payment.findMany({
    select: { id: true },
    where: { checkoutId: { in: checkoutIds } },
  });
  const paymentIds = payments.map((payment) => payment.id);
  await prisma.paymentReconciliationAction.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.ownershipCapture.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.paymentWebhookEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { checkoutId: { in: checkoutIds } } });
  await prisma.checkoutStatusToken.deleteMany({ where: { checkoutId: { in: checkoutIds } } });
  await prisma.checkoutSession.deleteMany({ where: { companyId } });
  await prisma.takeoverQuote.deleteMany({ where: { companyId } });
  await prisma.territory.deleteMany({ where: { id: territoryId } });
  await prisma.territoryCategory.deleteMany({ where: { id: categoryId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await disconnectDatabase();
});

describe('Phase3 constraints', () => {
  it('unique active quote', async () => {
    const data = {
      territoryId,
      territoryVersion: 1,
      companyId,
      currency: 'USD',
      minimumAmountMinor: 1000,
      status: 'ACTIVE' as const,
      expiresAt: fiveMinutesFromNow(),
      observedAt: new Date(),
    };
    await prisma.takeoverQuote.create({ data });
    await expect(prisma.takeoverQuote.create({ data })).rejects.toThrow();
  });

  it('unique checkout provider+id', async () => {
    const quote = await prisma.takeoverQuote.findFirstOrThrow({ where: { territoryId, companyId } });
    const data = {
      quoteId: quote.id,
      companyId,
      provider: 'DODO',
      providerCheckoutId: `chk-${suffix}`,
      status: 'CREATED' as const,
    };
    await prisma.checkoutSession.create({ data });
    await expect(prisma.checkoutSession.create({ data })).rejects.toThrow();
  });

  it('unique tokenDigest', async () => {
    const checkout = await firstCheckout();
    const data = {
      checkoutId: checkout.id,
      tokenDigest: Buffer.from(`dig-${suffix}`),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    await prisma.checkoutStatusToken.create({ data });
    await expect(prisma.checkoutStatusToken.create({ data })).rejects.toThrow();
  });

  it('positive amount', async () => {
    const checkout = await firstCheckout();
    await expect(
      prisma.payment.create({
        data: {
          checkoutId: checkout.id,
          provider: 'DODO',
          providerPaymentId: `pay1-${suffix}`,
          amountMinor: -5,
          currency: 'USD',
          status: 'PENDING',
        },
      }),
    ).rejects.toThrow();
  });

  it('unique webhook', async () => {
    const checkout = await firstCheckout();
    const payment = await prisma.payment.create({
      data: {
        checkoutId: checkout.id,
        provider: 'DODO',
        providerPaymentId: `pay2-${suffix}`,
        amountMinor: 1000,
        currency: 'USD',
        status: 'PENDING',
      },
    });
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: 'DODO',
        providerEventId: `evt1-${suffix}`,
        signatureDigest: Buffer.from('sig'),
        payload: {},
        paymentId: payment.id,
      },
    });
    await expect(
      prisma.paymentWebhookEvent.create({
        data: {
          provider: 'DODO',
          providerEventId: `evt1-${suffix}`,
          signatureDigest: Buffer.from('sig2'),
          payload: {},
          paymentId: payment.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('unique capture paymentId', async () => {
    const checkout = await firstCheckout();
    const payment = await prisma.payment.create({
      data: {
        checkoutId: checkout.id,
        provider: 'DODO',
        providerPaymentId: `pay3-${suffix}`,
        amountMinor: 1000,
        currency: 'USD',
        status: 'PENDING',
      },
    });
    const data = {
      paymentId: payment.id,
      territoryId,
      newOwnerCompanyId: companyId,
      expectedTerritoryVersion: 1,
      status: 'PENDING' as const,
    };
    await prisma.ownershipCapture.create({ data });
    await expect(prisma.ownershipCapture.create({ data })).rejects.toThrow();
  });

  it('unique reconciliation action', async () => {
    const checkout = await firstCheckout();
    const payment = await prisma.payment.create({
      data: {
        checkoutId: checkout.id,
        provider: 'DODO',
        providerPaymentId: `pay4-${suffix}`,
        amountMinor: 1000,
        currency: 'USD',
        status: 'PENDING',
      },
    });
    await prisma.paymentReconciliationAction.create({
      data: {
        paymentId: payment.id,
        action: 'REFUND',
        status: 'PENDING',
        requestedByActorType: 'SYSTEM',
        reason: 'test',
      },
    });
    await expect(
      prisma.paymentReconciliationAction.create({
        data: {
          paymentId: payment.id,
          action: 'REFUND',
          status: 'PENDING',
          requestedByActorType: 'SYSTEM',
          reason: 'dup',
        },
      }),
    ).rejects.toThrow();
  });
});
