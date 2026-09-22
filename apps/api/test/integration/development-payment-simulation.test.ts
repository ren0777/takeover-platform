import './setup.js';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDatabaseClient } from '@takeover/database';
import {
  TAKEOVER_BASE_PRICE_MINOR,
  nextTakeoverPriceMinor,
  type AttemptStatus,
} from '@takeover/shared';
import { buildApp } from '../../src/app.js';
import { parseApiConfig } from '../../src/config/env.js';

/**
 * The full development-only flow against real PostgreSQL: a simulated
 * checkout, signed provider events through the normal webhook route, and the
 * capture, ownership and next-price consequences the real services produce.
 *
 * Nothing here writes payment, capture or ownership rows directly, and no
 * request leaves the process: every outcome is driven by the simulator's own
 * signed webhook, dispatched in-process through the app's routes.
 */

const prisma = getDatabaseClient();
const BASE_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DEV_PAYMENT_SIMULATION_ENABLED: 'true',
  EMAIL_PROVIDER: 'development',
  NODE_ENV: 'development',
  PAYMENT_PROVIDER: 'development',
  PAYMENTS_ENABLED: 'true',
  WEB_APP_ORIGIN: 'http://localhost:3100',
} as const;

type Fixture = {
  buyerId: string;
  categoryId: string;
  contactId: string;
  grantId: string;
  sessionToken: string;
  csrfToken: string;
  territoryId: string;
  territorySlug: string;
};

let fixture: Fixture;
let app: Awaited<ReturnType<typeof buildApp>>;

async function resetTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "audit_logs", "payment_reconciliation_actions", "ownership_captures", "payments",
    "payment_webhook_events", "checkout_status_tokens", "checkout_sessions",
    "takeover_quotes", "takeover_intents", "company_management_sessions",
    "company_management_grants", "company_verifications", "company_access_requests",
    "email_verification_challenges", "company_contacts", "territory_ownerships",
    "companies", "capture_activity"
    RESTART IDENTITY CASCADE`);
  await prisma.territory.deleteMany({ where: { slug: { startsWith: 'sim-' } } });
  await prisma.territoryCategory.deleteMany({ where: { slug: { startsWith: 'sim-' } } });
}

/** A verified buyer with a live management session, plus a priced territory. */
async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.territoryCategory.create({
    data: { displayOrder: 900, name: `Sim ${suffix}`, slug: `sim-category-${suffix}` },
  });
  const territory = await prisma.territory.create({
    data: {
      categoryId: category.id,
      currency: 'USD',
      description: 'Simulation fixture',
      displayWeight: 50,
      minimumTakeoverAmountMinor: TAKEOVER_BASE_PRICE_MINOR,
      name: `Sim Territory ${suffix}`,
      slug: `sim-territory-${suffix}`,
    },
  });
  const buyer = await prisma.company.create({
    data: {
      activatedAt: new Date(),
      name: `Sim Buyer ${suffix}`,
      normalizedName: `sim buyer ${suffix}`,
      normalizedWebsite: `https://sim-buyer-${suffix}.example/`,
      slug: `sim-buyer-${suffix}`,
      status: 'ACTIVE',
      websiteUrl: `https://sim-buyer-${suffix}.example/`,
    },
  });
  const contact = await prisma.companyContact.create({
    data: {
      email: `buyer-${suffix}@example.com`,
      emailVerifiedAt: new Date(),
      normalizedEmail: `buyer-${suffix}@example.com`,
    },
  });
  const grant = await prisma.companyManagementGrant.create({
    data: { companyId: buyer.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
  });
  // Session and CSRF secrets are hashed exactly as the identity service does.
  const config = parseApiConfig(BASE_ENV);
  const { createOpaqueTokenService } = await import('../../src/security/opaque-token.js');
  const tokens = createOpaqueTokenService(config.identity.tokenHmacSecret);
  const session = tokens.issueSessionToken();
  const csrf = tokens.issueSessionToken();
  await prisma.companyManagementSession.create({
    data: {
      companyId: buyer.id,
      csrfDigest: Buffer.from(tokens.digestCsrfToken(csrf.rawToken)),
      expiresAt: new Date(Date.now() + 3_600_000),
      grantId: grant.id,
      tokenDigest: Buffer.from(tokens.digestSessionToken(session.rawToken)),
    },
  });
  return {
    buyerId: buyer.id,
    categoryId: category.id,
    contactId: contact.id,
    csrfToken: csrf.rawToken,
    grantId: grant.id,
    sessionToken: session.rawToken,
    territoryId: territory.id,
    territorySlug: territory.slug,
  };
}

function managementHeaders(current = fixture) {
  return {
    'content-type': 'application/json',
    cookie: `takeover_management=${current.sessionToken}; takeover_management_csrf=${current.csrfToken}`,
    origin: 'http://localhost:3100',
    'x-csrf-token': current.csrfToken,
  };
}

async function createQuoteAndCheckout(): Promise<{ checkoutId: string; statusToken: string }> {
  const quote = await app.inject({
    headers: managementHeaders(),
    method: 'POST',
    payload: { territorySlug: fixture.territorySlug },
    url: '/api/takeover-quotes',
  });
  expect(quote.statusCode).toBe(200);
  const quoteBody = quote.json().data as { checkoutAvailable: boolean; quoteId: string };
  expect(quoteBody.checkoutAvailable).toBe(true);

  const checkout = await app.inject({
    headers: managementHeaders(),
    method: 'POST',
    payload: { quoteId: quoteBody.quoteId },
    url: '/api/takeover-checkouts',
  });
  expect(checkout.statusCode).toBe(200);
  const body = checkout.json().data as {
    checkoutId: string;
    providerCheckoutUrl: string;
    simulated: boolean;
    statusToken: string;
  };
  // Marked simulated, and pointed at an unreachable host so nothing can be
  // mistaken for a real provider page.
  expect(body.simulated).toBe(true);
  expect(body.providerCheckoutUrl).toContain('dev-payment-simulator.invalid');
  return { checkoutId: body.checkoutId, statusToken: body.statusToken };
}

async function simulate(statusToken: string, outcome: string, current = fixture) {
  return app.inject({
    headers: managementHeaders(current),
    method: 'POST',
    payload: { outcome, statusToken },
    url: '/api/dev/payment-simulations',
  });
}

async function readStatus(statusToken: string): Promise<AttemptStatus> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/takeover-status/${statusToken}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as AttemptStatus;
}

async function territoryPrice(): Promise<bigint> {
  const territory = await prisma.territory.findUniqueOrThrow({
    where: { id: fixture.territoryId },
  });
  return territory.minimumTakeoverAmountMinor;
}

beforeEach(async () => {
  await resetTables();
  fixture = await seedFixture();
  app = buildApp({ config: parseApiConfig(BASE_ENV), logger: false });
  await app.ready();
});

describe('development payment simulation end to end', () => {
  it('captures the territory once and raises the next price from 1000 to 1200', async () => {
    const { statusToken } = await createQuoteAndCheckout();

    const simulation = await simulate(statusToken, 'success');
    expect(simulation.statusCode).toBe(202);
    expect(simulation.json().data.warning).toContain('DEV ONLY');

    const status = await readStatus(statusToken);
    expect(status).toMatchObject({
      amountCharged: { amountMinor: 1_000, currency: 'USD' },
      newOwnerCompanyId: fixture.buyerId,
      simulated: true,
      state: 'CAPTURED',
      terminal: true,
    });

    // Exactly one settled payment, one completed capture, one open reign.
    const payments = await prisma.payment.findMany();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      amountMinor: 1_000n,
      currency: 'USD',
      provider: 'DEVELOPMENT',
      status: 'CONFIRMED',
    });
    const captures = await prisma.ownershipCapture.findMany();
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ newOwnerCompanyId: fixture.buyerId, status: 'COMPLETED' });
    const reigns = await prisma.territoryOwnership.findMany({
      where: { territoryId: fixture.territoryId },
    });
    expect(reigns).toHaveLength(1);
    expect(reigns[0]).toMatchObject({
      companyId: fixture.buyerId,
      endedAt: null,
      source: 'PAID_CAPTURE',
    });

    // The quote is spent, and the next price is the shared policy's answer.
    const quotes = await prisma.takeoverQuote.findMany();
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.consumedAt).not.toBeNull();
    expect(await territoryPrice()).toBe(nextTakeoverPriceMinor(1_000n));
    expect(await territoryPrice()).toBe(1_200n);

    // No payout, credit or revenue share exists for the previous holder.
    expect(await prisma.paymentReconciliationAction.count()).toBe(0);
  });

  it.each([
    ['failure', 'PAYMENT_FAILED'],
    ['pending', 'PENDING_PAYMENT'],
    ['unknown', 'PENDING_PAYMENT'],
  ])('leaves ownership and price untouched for a %s outcome', async (outcome, expectedState) => {
    const { statusToken } = await createQuoteAndCheckout();

    expect((await simulate(statusToken, outcome)).statusCode).toBe(202);

    const status = await readStatus(statusToken);
    expect(status.state).toBe(expectedState);
    expect(await prisma.ownershipCapture.count()).toBe(0);
    expect(await prisma.territoryOwnership.count()).toBe(0);
    expect(await territoryPrice()).toBe(TAKEOVER_BASE_PRICE_MINOR);
    const confirmed = await prisma.payment.count({ where: { status: 'CONFIRMED' } });
    expect(confirmed).toBe(0);
  });

  it('captures once for a duplicated success notification', async () => {
    const { statusToken } = await createQuoteAndCheckout();

    expect((await simulate(statusToken, 'duplicate_success')).statusCode).toBe(202);

    expect((await readStatus(statusToken)).state).toBe('CAPTURED');
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.ownershipCapture.count()).toBe(1);
    expect(
      await prisma.territoryOwnership.count({ where: { territoryId: fixture.territoryId } }),
    ).toBe(1);
    expect(await territoryPrice()).toBe(1_200n);
    // Both deliveries were recorded; only one produced a capture.
    expect(await prisma.paymentWebhookEvent.count()).toBe(2);
  });

  it('keeps a settled capture when a failure arrives late', async () => {
    const { statusToken } = await createQuoteAndCheckout();

    expect((await simulate(statusToken, 'late_failure')).statusCode).toBe(202);

    const status = await readStatus(statusToken);
    expect(status.state).toBe('CAPTURED');
    expect(status.terminal).toBe(true);
    await expect(prisma.payment.findFirstOrThrow()).resolves.toMatchObject({
      status: 'CONFIRMED',
    });
    expect(await prisma.ownershipCapture.count()).toBe(1);
    expect(await territoryPrice()).toBe(1_200n);
  });

  it('raises the price exactly once when the same success is replayed', async () => {
    const { statusToken } = await createQuoteAndCheckout();
    expect((await simulate(statusToken, 'success')).statusCode).toBe(202);
    expect(await territoryPrice()).toBe(1_200n);

    // A second, independent success delivery for a spent quote must change
    // nothing: no second capture, no second increase.
    expect((await simulate(statusToken, 'success')).statusCode).toBe(202);

    // A second settled payment for a spent quote cannot capture again: it is
    // recorded and sent to reconciliation, never turned into ownership.
    expect(await prisma.ownershipCapture.count({ where: { status: 'COMPLETED' } })).toBe(1);
    expect(await prisma.ownershipCapture.count({ where: { status: { not: 'COMPLETED' } } })).toBe(
      1,
    );
    expect(
      await prisma.territoryOwnership.count({
        where: { endedAt: null, territoryId: fixture.territoryId },
      }),
    ).toBe(1);
    expect(await prisma.paymentReconciliationAction.count()).toBeGreaterThan(0);
    expect(await territoryPrice()).toBe(1_200n);
  });

  it('captures once when two successes race the same checkout', async () => {
    const { statusToken } = await createQuoteAndCheckout();

    const [first, second] = await Promise.all([
      simulate(statusToken, 'success'),
      simulate(statusToken, 'success'),
    ]);

    expect([first.statusCode, second.statusCode]).toEqual([202, 202]);
    // Two concurrent deliveries are two distinct settled payments for one
    // checkout, so whichever arrives second is reconciled rather than
    // captured; which one wins is not deterministic, but the invariants are.
    expect(await prisma.ownershipCapture.count({ where: { status: 'COMPLETED' } })).toBe(1);
    expect(
      await prisma.territoryOwnership.count({
        where: { endedAt: null, territoryId: fixture.territoryId },
      }),
    ).toBe(1);
    expect(await territoryPrice()).toBe(1_200n);
  });

  it('takes over an existing reign, closing exactly one and opening exactly one', async () => {
    const previousOwner = await prisma.company.create({
      data: {
        activatedAt: new Date(),
        name: 'Sim Previous Owner',
        normalizedName: 'sim previous owner',
        normalizedWebsite: 'https://sim-previous.example/',
        slug: 'sim-previous-owner',
        status: 'ACTIVE',
        websiteUrl: 'https://sim-previous.example/',
      },
    });
    await prisma.territoryOwnership.create({
      data: {
        capturedAt: new Date(Date.now() - 60_000),
        companyId: previousOwner.id,
        source: 'PAID_CAPTURE',
        territoryId: fixture.territoryId,
        territoryVersion: 2n,
      },
    });
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 1_200n, version: 2n },
      where: { id: fixture.territoryId },
    });
    // The held territory is priced from its settled capture, so give it one.
    const seedQuote = await prisma.takeoverQuote.create({
      data: {
        companyId: previousOwner.id,
        currency: 'USD',
        expiresAt: new Date(Date.now() - 1_000),
        minimumAmountMinor: 1_000n,
        observedAt: new Date(Date.now() - 60_000),
        status: 'CANCELLED',
        territoryId: fixture.territoryId,
        territoryVersion: 1n,
      },
    });
    const seedCheckout = await prisma.checkoutSession.create({
      data: {
        companyId: previousOwner.id,
        provider: 'DEVELOPMENT',
        providerCheckoutId: randomUUID(),
        providerCheckoutUrl: 'https://dev-payment-simulator.invalid/checkout/seed',
        quoteId: seedQuote.id,
        status: 'COMPLETED',
      },
    });
    const seedPayment = await prisma.payment.create({
      data: {
        amountMinor: 1_000n,
        checkoutId: seedCheckout.id,
        confirmedAt: new Date(Date.now() - 60_000),
        currency: 'USD',
        provider: 'DEVELOPMENT',
        providerPaymentId: randomUUID(),
        status: 'CONFIRMED',
      },
    });
    await prisma.ownershipCapture.create({
      data: {
        completedAt: new Date(Date.now() - 60_000),
        expectedTerritoryVersion: 1n,
        newOwnerCompanyId: previousOwner.id,
        paymentId: seedPayment.id,
        status: 'COMPLETED',
        territoryId: fixture.territoryId,
      },
    });

    const { statusToken } = await createQuoteAndCheckout();
    expect((await simulate(statusToken, 'success')).statusCode).toBe(202);

    const reigns = await prisma.territoryOwnership.findMany({
      orderBy: { capturedAt: 'asc' },
      where: { territoryId: fixture.territoryId },
    });
    expect(reigns).toHaveLength(2);
    expect(reigns[0]).toMatchObject({ companyId: previousOwner.id });
    expect(reigns[0]?.endedAt).not.toBeNull();
    expect(reigns[1]).toMatchObject({ companyId: fixture.buyerId, endedAt: null });
    // Priced from the previous settled capture: 1200 paid -> 1440 next.
    expect(await territoryPrice()).toBe(nextTakeoverPriceMinor(1_200n));
    expect(await territoryPrice()).toBe(1_440n);
    // The previous holder receives nothing at all.
    expect(await prisma.paymentReconciliationAction.count()).toBe(0);
  });

  it('refuses simulation without the management session, CSRF or trusted origin', async () => {
    const { statusToken } = await createQuoteAndCheckout();
    const body = { outcome: 'success', statusToken };

    const anonymous = await app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: body,
      url: '/api/dev/payment-simulations',
    });
    expect(anonymous.statusCode).toBe(403);
    const foreignOrigin = await app.inject({
      headers: { ...managementHeaders(), origin: 'https://evil.example' },
      method: 'POST',
      payload: body,
      url: '/api/dev/payment-simulations',
    });
    expect(foreignOrigin.statusCode).toBe(403);
    const badCsrf = await app.inject({
      headers: { ...managementHeaders(), 'x-csrf-token': 'wrong' },
      method: 'POST',
      payload: body,
      url: '/api/dev/payment-simulations',
    });
    expect(badCsrf.statusCode).toBe(401);
    const unknownToken = await simulate('A'.repeat(43), 'success');
    expect(unknownToken.statusCode).toBe(404);

    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.ownershipCapture.count()).toBe(0);
    expect(await territoryPrice()).toBe(TAKEOVER_BASE_PRICE_MINOR);
  });

  it('refuses a status token belonging to another company', async () => {
    const { statusToken } = await createQuoteAndCheckout();
    // A second company with its own perfectly valid management session.
    const other = await seedFixture();

    const response = await simulate(statusToken, 'success', other);

    // Indistinguishable from an unknown token: no existence oracle.
    expect(response.statusCode).toBe(404);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.ownershipCapture.count()).toBe(0);
    expect(await prisma.territoryOwnership.count()).toBe(0);
    expect(await territoryPrice()).toBe(TAKEOVER_BASE_PRICE_MINOR);
  });

  it('rejects an unsigned or wrongly signed event on the development webhook route', async () => {
    const payload = JSON.stringify({
      data: { checkout_session_id: 'x', payment_id: 'y', total_amount: 1_000 },
      type: 'payment.succeeded',
    });

    const unsigned = await app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload,
      url: '/api/payment/webhooks/development',
    });
    expect(unsigned.statusCode).toBe(401);
    const badSignature = await app.inject({
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'evt-forged',
        'webhook-signature': 'v1,Zm9yZ2Vk',
        'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      },
      method: 'POST',
      payload,
      url: '/api/payment/webhooks/development',
    });
    expect(badSignature.statusCode).toBe(401);
    expect(await prisma.paymentWebhookEvent.count()).toBe(0);
  });

  it('never exposes the simulator to a payments-enabled Dodo configuration', async () => {
    // The nearest thing to production that still runs locally: payments on, a
    // real provider selected and fully configured. Neither simulator route may
    // exist, and the config must not quietly fall back to the simulator.
    const config = parseApiConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DODO_API_KEY: 'test-key',
      DODO_PRODUCT_IDS: '{"USD":"prod_usd"}',
      DODO_WEBHOOK_SECRET: 'whsec_dGVzdC1zZWNyZXQtdmFsdWUtZm9yLXVuaXQtdGVzdHM=',
      EMAIL_PROVIDER: 'development',
      NODE_ENV: 'development',
      PAYMENT_PROVIDER: 'dodo',
      PAYMENTS_ENABLED: 'true',
      WEB_APP_ORIGIN: 'http://localhost:3100',
    });
    expect(config.developmentPayments).toBe(false);

    const dodoApp = buildApp({ config, logger: false });
    await dodoApp.ready();
    try {
      for (const url of ['/api/dev/payment-simulations', '/api/payment/webhooks/development']) {
        const response = await dodoApp.inject({
          headers: managementHeaders(),
          method: 'POST',
          payload: { outcome: 'success', statusToken: 'A'.repeat(43) },
          url,
        });
        expect(response.statusCode).toBe(404);
      }
      // The real provider's own webhook route is still mounted.
      const real = await dodoApp.inject({
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        payload: '{}',
        url: '/api/payment/webhooks/dodo',
      });
      expect(real.statusCode).not.toBe(404);
    } finally {
      await dodoApp.close();
    }
  });

  it('never exposes the simulator when the provider is not the simulator', async () => {
    const plainApp = buildApp({
      config: parseApiConfig({
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        EMAIL_PROVIDER: 'development',
        NODE_ENV: 'development',
        WEB_APP_ORIGIN: 'http://localhost:3100',
      }),
      logger: false,
    });
    await plainApp.ready();
    try {
      const simulation = await plainApp.inject({
        headers: managementHeaders(),
        method: 'POST',
        payload: { outcome: 'success', statusToken: 'A'.repeat(43) },
        url: '/api/dev/payment-simulations',
      });
      expect(simulation.statusCode).toBe(404);
      const webhook = await plainApp.inject({
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        payload: '{}',
        url: '/api/payment/webhooks/development',
      });
      expect(webhook.statusCode).toBe(404);
    } finally {
      await plainApp.close();
    }
  });
});
