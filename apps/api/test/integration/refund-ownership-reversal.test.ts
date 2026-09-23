import './setup.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseClient } from '@takeover/database';
import { TAKEOVER_BASE_PRICE_MINOR, territoryDetailSchema } from '@takeover/shared';
import { PrismaTakeoverRepository } from '../../src/modules/takeover/prisma-repository.js';
import { PrismaTerritoryRepository } from '../../src/modules/territories/prisma-repository.js';
import { TakeoverService } from '../../src/modules/takeover/service.js';
import { TerritoryService } from '../../src/modules/territories/service.js';
import { CompetitionService } from '../../src/modules/competition/service.js';

/**
 * Refund-driven ownership reversal against real PostgreSQL.
 *
 * A refund that gives back the money behind the current reign takes the
 * territory with it. These tests pin what that does to ownership, to the next
 * price, to quotes and checkouts already in flight, and to the public record —
 * including the cases where it must do nothing at all.
 */

const prisma = getDatabaseClient();
const now = new Date('2026-09-23T12:00:00.000Z');

function createService() {
  const provider = {
    name: 'DODO',
    createCheckout: vi.fn(async (input: { checkoutId: string }) => ({
      providerCheckoutId: `provider-${input.checkoutId}`,
      providerCheckoutUrl: `https://pay.example/${input.checkoutId}`,
    })),
    refundPayment: vi.fn(async () => ({ providerRefundId: 'r', status: 'succeeded' as const })),
    lookupRefund: vi.fn(async () => null),
  };
  return new TakeoverService({
    checkout: { enabled: true },
    clock: { now: () => now },
    provider,
    repository: new PrismaTakeoverRepository(prisma),
    statusTokenSecret: new Uint8Array(32).fill(7),
    statusTokenTtlSeconds: 86_400,
    trustedWebOrigin: 'https://app.example',
  });
}

let territoryId = '';
let territorySlug = '';
let suffix = '';

async function makeCompany(label: string, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE') {
  return prisma.company.create({
    data: {
      ...(status === 'ACTIVE'
        ? { activatedAt: new Date() }
        : { expiresAt: new Date(Date.now() + 86_400_000) }),
      name: `${label} ${suffix}`,
      normalizedName: `${label} ${suffix}`.toLowerCase(),
      normalizedWebsite: `https://${label}-${suffix}.example/`,
      slug: `${label}-${suffix}`,
      status,
      websiteUrl: `https://${label}-${suffix}.example/`,
    },
  });
}

/**
 * Suites here share one database and run in file order, and some of the others
 * assert global counts, so this one has to leave nothing behind.
 */
async function resetTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "audit_logs", "payment_reconciliation_actions", "ownership_captures", "payments",
    "payment_webhook_events", "checkout_status_tokens", "checkout_sessions",
    "takeover_quotes", "takeover_intents", "company_management_sessions",
    "company_management_grants", "company_verifications", "company_access_requests",
    "email_verification_challenges", "company_contacts", "territory_ownerships",
    "companies", "capture_activity" RESTART IDENTITY CASCADE`);
  await prisma.territory.deleteMany({ where: { slug: { startsWith: 'rev-' } } });
  await prisma.territoryCategory.deleteMany({ where: { slug: { startsWith: 'rev-' } } });
}

afterAll(resetTables);

beforeEach(async () => {
  await resetTables();

  suffix = randomUUID().slice(0, 8);
  const category = await prisma.territoryCategory.create({
    data: { displayOrder: 900, name: `Rev ${suffix}`, slug: `rev-c-${suffix}` },
  });
  const territory = await prisma.territory.create({
    data: {
      categoryId: category.id,
      currency: 'USD',
      description: 'reversal fixture',
      displayWeight: 50,
      minimumTakeoverAmountMinor: TAKEOVER_BASE_PRICE_MINOR,
      name: `Rev ${suffix}`,
      slug: `rev-t-${suffix}`,
    },
  });
  territoryId = territory.id;
  territorySlug = territory.slug;
});

/** Buys the territory for `companyId` at whatever it currently costs. */
async function capture(service: TakeoverService, companyId: string, tag: string) {
  const quote = await service.createQuote({ companyId, territorySlug });
  const checkout = await service.createCheckout({ companyId, quoteId: quote.quoteId });
  await service.confirmProviderPayment({
    amountMinor: BigInt(quote.minimumAmount.amountMinor),
    checkoutId: checkout.checkoutId,
    currency: 'USD',
    provider: 'DODO',
    providerPaymentId: `pay-${tag}-${suffix}`,
  });
  return {
    amountMinor: BigInt(quote.minimumAmount.amountMinor),
    checkoutId: checkout.checkoutId,
    quoteId: quote.quoteId,
    statusToken: checkout.statusToken,
    tag,
  };
}

type Captured = Awaited<ReturnType<typeof capture>>;

async function refundEvent(
  service: TakeoverService,
  captured: Captured,
  options: { eventId?: string; eventType?: string } = {},
) {
  return service.processVerifiedProviderWebhook({
    amountMinor: captured.amountMinor,
    currency: 'USD',
    eventType: options.eventType ?? 'refund.succeeded',
    metadata: {
      amount_minor: Number(captured.amountMinor),
      checkout_id: captured.checkoutId,
      currency: 'USD',
      quote_id: captured.quoteId,
    },
    payload: {
      data: { payment_id: `pay-${captured.tag}-${suffix}` },
      type: options.eventType ?? 'refund.succeeded',
    },
    provider: 'DODO',
    providerCheckoutId: `provider-${captured.checkoutId}`,
    providerEventId: options.eventId ?? `evt-${captured.tag}-${randomUUID()}`,
    providerPaymentId: `pay-${captured.tag}-${suffix}`,
    providerRefundId: `ref-${captured.tag}-${suffix}`,
    signatureDigest: new Uint8Array(32).fill(12),
  });
}

const openReigns = () =>
  prisma.territoryOwnership.findMany({ where: { endedAt: null, territoryId } });
const territoryRow = () => prisma.territory.findUniqueOrThrow({ where: { id: territoryId } });
const activity = () =>
  prisma.captureActivity.findMany({ orderBy: { id: 'asc' }, where: { territorySlug } });

/** Nothing in this phase may ever pay the previous holder. */
async function expectNoPayouts() {
  const actions = await prisma.paymentReconciliationAction.findMany({ select: { action: true } });
  expect(actions.map((row) => row.action)).not.toContain('PAYOUT');
  expect(actions.map((row) => row.action)).not.toContain('CREDIT');
  expect(actions.map((row) => row.action)).not.toContain('REVENUE_SHARE');
}

describe('refund reversal: the territory goes back', () => {
  it('leaves the first captured territory unclaimed at the base price', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const captured = await capture(service, alpha.id, 'a');
    expect((await territoryRow()).minimumTakeoverAmountMinor).toBe(1_200n);

    await refundEvent(service, captured);

    expect(await openReigns()).toHaveLength(0);
    const territory = await territoryRow();
    // Back on the market at the configured base, never the refunded price.
    expect(territory.minimumTakeoverAmountMinor).toBe(TAKEOVER_BASE_PRICE_MINOR);
    expect(territory.version).toBe(3n);
    await expectNoPayouts();
  });

  it('restores the previous holder in a new reign, priced from their own payment', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a'); // pays 1000 -> next 1200
    const second = await capture(service, beta.id, 'b'); // pays 1200 -> next 1440
    expect((await territoryRow()).minimumTakeoverAmountMinor).toBe(1_440n);

    await refundEvent(service, second);

    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
    // A brand new reign, not the old one reopened.
    expect(open[0]!.source).toBe('REFUND_RESTORATION');
    expect(open[0]!.territoryVersion).toBe(4n);

    const territory = await territoryRow();
    // 120% of what alpha actually paid (1000), never of beta's refunded 1200.
    expect(territory.minimumTakeoverAmountMinor).toBe(1_200n);
    expect(territory.version).toBe(4n);
    await expectNoPayouts();
  });

  it('never rewrites or reopens a closed reign', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    const before = await prisma.territoryOwnership.findMany({
      orderBy: { territoryVersion: 'asc' },
      where: { territoryId },
    });

    await refundEvent(service, second);

    const after = await prisma.territoryOwnership.findMany({
      orderBy: { territoryVersion: 'asc' },
      where: { territoryId },
    });
    expect(after).toHaveLength(before.length + 1);
    // Alpha's original reign keeps its identity, version and end time.
    expect(after[0]).toMatchObject({
      capturedAt: before[0]!.capturedAt,
      companyId: before[0]!.companyId,
      endedAt: before[0]!.endedAt,
      id: before[0]!.id,
      territoryVersion: before[0]!.territoryVersion,
    });
    // Versions only ever move forward.
    const versions = after.map((row) => row.territoryVersion);
    expect(versions).toEqual([...versions].sort((a, b) => Number(a - b)));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('fails closed when the predecessor can no longer prove what they paid', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const first = await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    // Alpha's own money goes back first. That refund is history by then, so it
    // leaves beta in place, but it does strip alpha of any provable price.
    await refundEvent(service, first);
    expect((await openReigns())[0]!.companyId).toBe(beta.id);
    const pricedBefore = (await territoryRow()).minimumTakeoverAmountMinor;

    await refundEvent(service, second);

    const open = await openReigns();
    // Ownership is still corrected: leaving refunded money in charge is worse.
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
    expect(open[0]!.source).toBe('REFUND_RESTORATION');
    // The price is left alone rather than copied from the refunded payment,
    // and an operator is asked to settle it.
    expect((await territoryRow()).minimumTakeoverAmountMinor).toBe(pricedBefore);
    const flagged = await prisma.paymentReconciliationAction.findFirst({
      where: { action: 'OWNERSHIP_REVERSAL', reason: { contains: 'UNPROVABLE' } },
    });
    expect(flagged?.reason).toContain('REFUND_RESTORATION_PRICE_UNPROVABLE');
    await expectNoPayouts();
  });

  it('refuses to quote a restored territory whose price could not be proven', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const gamma = await makeCompany('gamma');
    const first = await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, first);
    await refundEvent(service, second);

    // Alpha holds it again, but nothing proves a price any more, so the
    // territory refuses to be quoted rather than inventing one.
    await expect(service.createQuote({ companyId: gamma.id, territorySlug })).rejects.toThrow(
      /pricing/i,
    );
  });
});

describe('refund reversal: refunds that must change nothing', () => {
  it('leaves a later owner untouched and records why', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const first = await capture(service, alpha.id, 'a');
    await capture(service, beta.id, 'b');
    const before = await territoryRow();

    await refundEvent(service, first);

    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(beta.id);
    const after = await territoryRow();
    expect(after.minimumTakeoverAmountMinor).toBe(before.minimumTakeoverAmountMinor);
    expect(after.version).toBe(before.version);

    const action = await prisma.paymentReconciliationAction.findFirst({
      where: { action: 'OWNERSHIP_REVERSAL' },
    });
    expect(action?.reason).toBe('HISTORICAL_REFUND_NO_OWNERSHIP_CHANGE');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'takeover.refund.historical_no_ownership_change' },
    });
    expect(audit).not.toBeNull();
    await expectNoPayouts();
  });

  it('is idempotent across a redelivered refund event', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    const eventId = `evt-once-${suffix}`;
    await refundEvent(service, second, { eventId });
    const afterFirst = await territoryRow();
    const reignsAfterFirst = await prisma.territoryOwnership.count({ where: { territoryId } });

    await refundEvent(service, second, { eventId });

    expect(await prisma.territoryOwnership.count({ where: { territoryId } })).toBe(
      reignsAfterFirst,
    );
    const afterSecond = await territoryRow();
    expect(afterSecond.version).toBe(afterFirst.version);
    expect(afterSecond.minimumTakeoverAmountMinor).toBe(afterFirst.minimumTakeoverAmountMinor);
    expect(await openReigns()).toHaveLength(1);
  });

  it('does not reverse twice when a distinct second refund event arrives', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    await refundEvent(service, second, { eventId: `evt-one-${suffix}` });
    const afterFirst = await territoryRow();

    // A different event id for the same already-refunded payment.
    await refundEvent(service, second, { eventId: `evt-two-${suffix}` });

    const after = await territoryRow();
    expect(after.version).toBe(afterFirst.version);
    expect(after.minimumTakeoverAmountMinor).toBe(afterFirst.minimumTakeoverAmountMinor);
    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
  });

  it('keeps refund truth terminal when a later refund.failed arrives', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);
    const afterRefund = await territoryRow();

    await refundEvent(service, second, {
      eventId: `evt-failed-${suffix}`,
      eventType: 'refund.failed',
    });

    const payment = await prisma.payment.findFirstOrThrow({
      where: { providerPaymentId: `pay-b-${suffix}` },
    });
    expect(payment.status).toBe('REFUNDED');
    const after = await territoryRow();
    expect(after.version).toBe(afterRefund.version);
    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
  });

  it('cannot be undone by a late payment success for the refunded checkout', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);
    const afterRefund = await territoryRow();

    await service.processVerifiedProviderWebhook({
      amountMinor: second.amountMinor,
      currency: 'USD',
      eventType: 'payment.succeeded',
      metadata: {
        amount_minor: Number(second.amountMinor),
        checkout_id: second.checkoutId,
        currency: 'USD',
        quote_id: second.quoteId,
      },
      payload: { data: { payment_id: `pay-b-${suffix}` }, type: 'payment.succeeded' },
      provider: 'DODO',
      providerCheckoutId: `provider-${second.checkoutId}`,
      providerEventId: `evt-late-success-${suffix}`,
      providerPaymentId: `pay-b-${suffix}`,
      signatureDigest: new Uint8Array(32).fill(12),
    });

    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
    expect((await territoryRow()).version).toBe(afterRefund.version);
  });
});

describe('refund reversal: concurrency', () => {
  it('keeps exactly one open reign when a refund races a new capture', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const gamma = await makeCompany('gamma');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    // Gamma's checkout is prepared against the current version, then a refund
    // of beta's payment and gamma's settlement race each other.
    const quote = await service.createQuote({ companyId: gamma.id, territorySlug });
    const checkout = await service.createCheckout({
      companyId: gamma.id,
      quoteId: quote.quoteId,
    });

    const results = await Promise.allSettled([
      refundEvent(service, second),
      service.confirmProviderPayment({
        amountMinor: BigInt(quote.minimumAmount.amountMinor),
        checkoutId: checkout.checkoutId,
        currency: 'USD',
        provider: 'DODO',
        providerPaymentId: `pay-race-${suffix}`,
      }),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

    // Whoever won, the invariant holds.
    expect(await openReigns()).toHaveLength(1);
    const versions = (
      await prisma.territoryOwnership.findMany({
        orderBy: { territoryVersion: 'asc' },
        where: { territoryId },
      })
    ).map((row) => row.territoryVersion);
    expect(new Set(versions).size).toBe(versions.length);
    await expectNoPayouts();
  });

  it('applies only one reversal when duplicate refunds arrive together', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    await Promise.allSettled([
      refundEvent(service, second, { eventId: `evt-par-1-${suffix}` }),
      refundEvent(service, second, { eventId: `evt-par-2-${suffix}` }),
    ]);

    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
    // One restoration reign, not two.
    expect(
      await prisma.territoryOwnership.count({
        where: { source: 'REFUND_RESTORATION', territoryId },
      }),
    ).toBe(1);
    expect((await territoryRow()).minimumTakeoverAmountMinor).toBe(1_200n);
  });
});

describe('refund reversal: what the public sees', () => {
  it('records capture, removal and restoration without deleting anything', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);

    const rows = await activity();
    expect(rows.map((row) => row.eventType)).toEqual([
      'CAPTURE',
      'CAPTURE',
      'REFUND_REMOVAL',
      'REFUND_RESTORATION',
    ]);
    // The removal names the company that lost it; the restoration names the
    // company that got it back.
    expect(rows[2]!.companyName).toContain('beta');
    expect(rows[3]!.companyName).toContain('alpha');
    // Both original capture rows survive untouched.
    expect(rows[0]!.companyName).toContain('alpha');
    expect(rows[1]!.companyName).toContain('beta');
  });

  it('shows the restored owner on the public territory history', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);

    const territories = new PrismaTerritoryRepository(prisma);
    const record = await territories.findTerritoryBySlug(territorySlug, 10);
    expect(record?.currentOwnership?.company.id).toBe(alpha.id);
    expect(record?.currentOwnership?.source).toBe('REFUND_RESTORATION');
  });

  it('changes no company status and publishes nothing new when a reign moves', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    // An unrelated draft company must stay invisible throughout.
    await makeCompany('draftco', 'DRAFT');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    await refundEvent(service, second);

    // Restoration returns the reign but invents no publication rule: a
    // company's own status still decides whether it is publicly visible.
    const territories = new PrismaTerritoryRepository(prisma);
    expect(await territories.findPublicCompanyBySlug(`draftco-${suffix}`)).toBeNull();
    expect((await prisma.company.findUniqueOrThrow({ where: { id: alpha.id } })).status).toBe(
      'ACTIVE',
    );
    expect((await prisma.company.findUniqueOrThrow({ where: { id: beta.id } })).status).toBe(
      'ACTIVE',
    );
    // Beta keeps its account; it simply no longer holds the territory.
    expect(await territories.countCompanyTerritories(beta.id)).toBe(0);
    expect(await territories.countCompanyTerritories(alpha.id)).toBe(1);
  });
});

describe('refund reversal: reservations in flight', () => {
  it('cancels quotes and revokes status tokens for the rolled-back territory', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const gamma = await makeCompany('gamma');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');

    // Gamma is mid-flight: a live quote and an unpaid checkout.
    const quote = await service.createQuote({ companyId: gamma.id, territorySlug });
    const checkout = await service.createCheckout({
      companyId: gamma.id,
      quoteId: quote.quoteId,
    });

    await refundEvent(service, second);

    expect(
      (await prisma.takeoverQuote.findUniqueOrThrow({ where: { id: quote.quoteId } })).status,
    ).toBe('CANCELLED');
    expect(
      (await prisma.checkoutSession.findUniqueOrThrow({ where: { id: checkout.checkoutId } }))
        .status,
    ).toBe('CANCELLED');
    const tokens = await prisma.checkoutStatusToken.findMany({
      where: { checkoutId: checkout.checkoutId },
    });
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('quotes the restored price to the next buyer', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const gamma = await makeCompany('gamma');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);

    const fresh = await service.createQuote({ companyId: gamma.id, territorySlug });
    // Alpha holds it again having paid 1000, so the next takeover costs 1200.
    expect(fresh.minimumAmount.amountMinor).toBe(1_200);
    expect(fresh.territoryVersion).toBe('4');
  });
});

describe('refund reversal: regressions', () => {
  it('never restores a holder across a gap left by an earlier release', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    const first = await capture(service, alpha.id, 'a');
    // Alpha's refund releases the territory: it is unclaimed and alpha has
    // already had its money back.
    await refundEvent(service, first);
    expect(await openReigns()).toHaveLength(0);

    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);

    // Beta's refund must leave it unclaimed too, not hand it back to alpha,
    // who paid nothing in the end.
    expect(await openReigns()).toHaveLength(0);
    expect((await territoryRow()).minimumTakeoverAmountMinor).toBe(TAKEOVER_BASE_PRICE_MINOR);
  });

  it('records the refund even when the territory has since been disabled', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await prisma.territory.update({
      data: { availabilityStatus: 'DISABLED' },
      where: { id: territoryId },
    });

    await refundEvent(service, second);

    // The refund is terminal truth; an operator disabling the territory cannot
    // roll it back.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { providerPaymentId: `pay-b-${suffix}` },
    });
    expect(payment.status).toBe('REFUNDED');
    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
  });

  it('keeps removal and restoration out of the recent-captures feed', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);

    // Four rows exist in the table...
    expect(await activity()).toHaveLength(4);
    // ...but the public ticker means "just captured" and shows only those two.
    const competition = new CompetitionService(prisma);
    const feed = await competition.activity('0', 50);
    const mine = feed.items.filter((item) => item.territorySlug === territorySlug);
    expect(mine).toHaveLength(2);
    expect(mine.every((item) => /alpha|beta/.test(item.companyName))).toBe(true);
  });

  it('serves a restored territory over the public contract', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    const second = await capture(service, beta.id, 'b');
    await refundEvent(service, second);

    const territories = new TerritoryService(new PrismaTerritoryRepository(prisma));
    const detail = await territories.getTerritory(territorySlug);
    // The public schema has to accept a restored reign, or the territory route
    // throws and the page fails to render at all.
    const parsed = territoryDetailSchema.parse(detail);
    expect(parsed.currentOwnership?.source).toBe('refund_restoration');
  });
});

describe('refund reversal: operator recovery', () => {
  it('detects and repairs a reign left standing on refunded money, idempotently', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    const beta = await makeCompany('beta');
    await capture(service, alpha.id, 'a');
    await capture(service, beta.id, 'b');

    // The shape this phase prevents, written directly to stand in for a row
    // created before the reversal existed.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { providerPaymentId: `pay-b-${suffix}` },
    });
    await prisma.payment.update({ data: { status: 'REFUNDED' }, where: { id: payment.id } });
    await prisma.ownershipCapture.updateMany({
      data: { status: 'REFUNDED' },
      where: { paymentId: payment.id },
    });

    const repository = new PrismaTakeoverRepository(prisma);
    const found = await repository.listRefundOwnershipInconsistencies();
    expect(found).toHaveLength(1);
    expect(found[0]!.territorySlug).toBe(territorySlug);

    const capture2 = await prisma.ownershipCapture.findFirstOrThrow({
      where: { paymentId: payment.id },
    });
    const first = await repository.repairRefundOwnershipInconsistency(capture2.id);
    expect(first.repaired).toBe(true);

    const open = await openReigns();
    expect(open).toHaveLength(1);
    expect(open[0]!.companyId).toBe(alpha.id);
    expect(await repository.listRefundOwnershipInconsistencies()).toHaveLength(0);

    // Running it again changes nothing.
    const versionAfterRepair = (await territoryRow()).version;
    const second2 = await repository.repairRefundOwnershipInconsistency(capture2.id);
    expect(second2.repaired).toBe(false);
    expect((await territoryRow()).version).toBe(versionAfterRepair);
    expect(await openReigns()).toHaveLength(1);
  });

  it('reports nothing when every reign is backed by money that stayed put', async () => {
    const service = createService();
    const alpha = await makeCompany('alpha');
    await capture(service, alpha.id, 'a');

    const repository = new PrismaTakeoverRepository(prisma);
    expect(await repository.listRefundOwnershipInconsistencies()).toHaveLength(0);
  });
});
