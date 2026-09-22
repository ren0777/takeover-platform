import { randomUUID } from 'node:crypto';
import { getDatabaseClient, type Prisma } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaCompanyIdentityRepository } from '../../src/modules/company-identity/prisma-repository.js';
import { PrismaTakeoverRepository } from '../../src/modules/takeover/prisma-repository.js';
import {
  CheckoutNotFoundError,
  CheckoutQuoteExpiredError,
  TakeoverService,
  type PaymentProvider,
} from '../../src/modules/takeover/service.js';

/**
 * Immutable, server-priced preparation quotes against real PostgreSQL: one
 * quote per intent under concurrency, exact reuse while nothing changed,
 * expired and stale quotes replaced rather than reused, quotes closed with
 * their intent, no cross-company reach, and checkout refusing a quote whose
 * intent is no longer live.
 */

const prisma = getDatabaseClient();
const repository = new PrismaCompanyIdentityRepository(prisma);

const CATEGORY_ID = '20000000-0000-4000-8000-000000000098';
const inFiveMinutes = () => new Date(Date.now() + 300_000);
const soon = () => new Date(Date.now() + 3_600_000);
const now = () => new Date();

async function resetTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "ownership_captures", "payments", "checkout_status_tokens",
    "checkout_sessions", "payment_reconciliation_actions", "payment_webhook_events",
    "takeover_quotes", "takeover_intents", "company_contacts",
    "companies", "territory_ownerships"
    RESTART IDENTITY CASCADE`);
  await prisma.territory.deleteMany({ where: { categoryId: CATEGORY_ID } });
  await prisma.territoryCategory.deleteMany({ where: { id: CATEGORY_ID } });
  await prisma.territoryCategory.create({
    data: { displayOrder: 998, id: CATEGORY_ID, name: 'Quote Fixtures', slug: 'quote-fixtures' },
  });
}

async function createTerritory(
  slug: string,
  minimumMinor: bigint,
  availability: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
) {
  return prisma.territory.create({
    data: {
      availabilityStatus: availability,
      categoryId: CATEGORY_ID,
      currency: 'USD',
      description: `${slug} fixture`,
      displayWeight: 50,
      minimumTakeoverAmountMinor: minimumMinor,
      name: slug,
      slug,
    },
  });
}

async function createManagedCompany(label: string) {
  const company = await prisma.company.create({
    data: {
      expiresAt: soon(),
      name: label,
      normalizedName: label,
      normalizedWebsite: `https://${label}.example/`,
      status: 'DRAFT',
      websiteUrl: `https://${label}.example/`,
    },
  });
  const contact = await prisma.companyContact.create({
    data: { email: `${label}@gmail.com`, normalizedEmail: `${label}@gmail.com` },
  });
  const grant = await prisma.companyManagementGrant.create({
    data: { companyId: company.id, contactId: contact.id, source: 'INITIAL_CONTACT' },
  });
  const session = await prisma.companyManagementSession.create({
    data: {
      companyId: company.id,
      csrfDigest: Buffer.alloc(32, 1),
      expiresAt: soon(),
      grantId: grant.id,
      tokenDigest: Buffer.from(randomUUID().replaceAll('-', '').padEnd(64, '0'), 'hex'),
    },
  });
  return { company, contact, grant, session };
}

type Managed = Awaited<ReturnType<typeof createManagedCompany>>;

async function prepare(managed: Managed, slug: string) {
  const started = await repository.startTakeoverPreparation({
    companyId: managed.company.id,
    contactId: managed.contact.id,
    expiresAt: soon(),
    now: now(),
    sessionId: managed.session.id,
    territoryExternalRef: slug,
  });
  if (started.kind !== 'ready') throw new Error(`expected ready preparation, got ${started.kind}`);
  return started.intent;
}

function quoteInput(managed: Managed, overrides: { expiresAt?: Date; now?: Date } = {}) {
  return {
    companyId: managed.company.id,
    contactId: managed.contact.id,
    expiresAt: overrides.expiresAt ?? inFiveMinutes(),
    now: overrides.now ?? now(),
    requestId: 'req-quote',
    sessionId: managed.session.id,
  };
}

async function generate(managed: Managed, overrides: { expiresAt?: Date; now?: Date } = {}) {
  const result = await repository.generatePreparationQuote(quoteInput(managed, overrides));
  if (result.kind !== 'quoted') throw new Error(`expected a quote, got ${result.kind}`);
  return result;
}

async function activeQuotes(intentId: string) {
  return prisma.takeoverQuote.findMany({ where: { status: 'ACTIVE', takeoverIntentId: intentId } });
}

beforeEach(resetTables);

describe('takeover preparation quotes in PostgreSQL', () => {
  it('creates exactly one immutable quote when many generates race, priced from the territory', async () => {
    const managed = await createManagedCompany('race');
    const territory = await createTerritory('race-priced', 2_500n);
    const intent = await prepare(managed, territory.slug);

    const results = await Promise.all(Array.from({ length: 6 }, () => generate(managed)));

    const ids = new Set(results.map((result) => result.quote.id));
    expect(ids.size).toBe(1);
    expect(results.filter((result) => !result.reused)).toHaveLength(1);
    const rows = await prisma.takeoverQuote.findMany({ where: { takeoverIntentId: intent.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId: managed.company.id,
      currency: 'USD',
      minimumAmountMinor: 2_500n,
      status: 'ACTIVE',
      territoryId: territory.id,
      territoryVersion: territory.version,
    });
    expect(await prisma.auditLog.count({ where: { action: 'takeover_quote.created' } })).toBe(1);
  });

  it('refuses zero-priced, disabled and missing territories without writing a quote', async () => {
    const managed = await createManagedCompany('refuse');
    await createTerritory('refuse-zero', 0n);
    await prepare(managed, 'refuse-zero');
    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'pricing_not_configured',
    });

    await createTerritory('refuse-disabled', 1_000n, 'DISABLED');
    await prisma.takeoverIntent.updateMany({
      where: { companyId: managed.company.id },
      data: { territoryExternalRef: 'refuse-disabled' },
    });
    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'territory_disabled',
    });

    await prisma.takeoverIntent.updateMany({
      where: { companyId: managed.company.id },
      data: { territoryExternalRef: 'gone-territory' },
    });
    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'territory_missing',
    });
    expect(await prisma.takeoverQuote.count()).toBe(0);
  });

  it('reports no intent, and refuses revoked or foreign sessions', async () => {
    const managed = await createManagedCompany('no-intent');
    const other = await createManagedCompany('other');
    await createTerritory('no-intent-priced', 1_000n);

    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'no_intent',
    });
    await prepare(managed, 'no-intent-priced');
    await expect(
      repository.generatePreparationQuote({ ...quoteInput(managed), sessionId: other.session.id }),
    ).resolves.toEqual({ kind: 'unauthorized' });
    await prisma.companyManagementSession.update({
      where: { id: managed.session.id },
      data: { revokedAt: now() },
    });
    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'unauthorized',
    });
    expect(await prisma.takeoverQuote.count()).toBe(0);
  });

  it('replaces an expired quote with a fresh one instead of reusing it', async () => {
    const managed = await createManagedCompany('expire');
    await createTerritory('expire-priced', 1_000n);
    const intent = await prepare(managed, 'expire-priced');

    const first = await generate(managed, { expiresAt: new Date(Date.now() + 1_000) });
    const second = await generate(managed, { now: new Date(Date.now() + 2_000) });

    expect(second.reused).toBe(false);
    expect(second.quote.id).not.toBe(first.quote.id);
    await expect(
      prisma.takeoverQuote.findUniqueOrThrow({ where: { id: first.quote.id } }),
    ).resolves.toMatchObject({ minimumAmountMinor: 1_000n, status: 'EXPIRED' });
    expect(await activeQuotes(intent.id)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'takeover_quote.expired' } })).toBe(1);
  });

  it.each([
    ['the price changes', { minimumTakeoverAmountMinor: 3_000n }],
    ['the territory version moves', { version: { increment: 1 } }],
  ])('leaves the old quote immutable and issues a new one when %s', async (_label, change) => {
    const managed = await createManagedCompany('stale');
    const territory = await createTerritory('stale-priced', 1_000n);
    const intent = await prepare(managed, territory.slug);
    const first = await generate(managed);

    await prisma.territory.update({ where: { id: territory.id }, data: change });
    const view = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: now(),
    });
    // The read model still shows the original row, untouched.
    expect(view.quote).toMatchObject({
      id: first.quote.id,
      minimumAmountMinor: 1_000n,
      status: 'ACTIVE',
      territoryVersion: territory.version,
    });

    const second = await generate(managed);
    expect(second.reused).toBe(false);
    expect(second.quote.id).not.toBe(first.quote.id);
    await expect(
      prisma.takeoverQuote.findUniqueOrThrow({ where: { id: first.quote.id } }),
    ).resolves.toMatchObject({ minimumAmountMinor: 1_000n, status: 'CANCELLED' });
    expect(await activeQuotes(intent.id)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'takeover_quote.replaced' } })).toBe(1);
  });

  it('refuses to quote a claimed territory until a takeover pricing policy exists', async () => {
    const managed = await createManagedCompany('claimed');
    const rival = await prisma.company.create({
      data: {
        activatedAt: now(),
        name: 'Rival',
        normalizedName: 'rival',
        normalizedWebsite: 'https://rival.example/',
        slug: 'rival',
        status: 'ACTIVE',
        websiteUrl: 'https://rival.example/',
      },
    });
    const territory = await createTerritory('claimed-priced', 4_000n);
    await prisma.territoryOwnership.create({
      data: {
        capturedAt: now(),
        companyId: rival.id,
        source: 'INITIAL_SEED',
        territoryId: territory.id,
        territoryVersion: 1n,
      },
    });
    await prepare(managed, territory.slug);

    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'claimed_pricing_not_configured',
    });
    // The read model still names the owner and the stored minimum, but says
    // it is not quotable; ownership itself is untouched.
    const view = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: now(),
    });
    expect(view.territory).toMatchObject({
      currentOwner: { name: 'Rival', slug: 'rival' },
      hasActiveOwner: true,
      minimumTakeoverAmountMinor: 4_000n,
    });
    expect(await prisma.takeoverQuote.count()).toBe(0);
    expect(await prisma.territoryOwnership.count({ where: { companyId: rival.id } })).toBe(1);
  });

  it('marks an active quote stale, never reissuing it, once the territory is claimed', async () => {
    const managed = await createManagedCompany('claim-after');
    const territory = await createTerritory('claim-after-priced', 1_000n);
    const intent = await prepare(managed, territory.slug);
    const quoted = await generate(managed);
    const rival = await prisma.company.create({
      data: {
        activatedAt: now(),
        name: 'Rival Two',
        normalizedName: 'rival-two',
        normalizedWebsite: 'https://rival-two.example/',
        slug: 'rival-two',
        status: 'ACTIVE',
        websiteUrl: 'https://rival-two.example/',
      },
    });
    await prisma.territoryOwnership.create({
      data: {
        capturedAt: now(),
        companyId: rival.id,
        source: 'INITIAL_SEED',
        territoryId: territory.id,
        territoryVersion: 1n,
      },
    });

    const view = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: now(),
    });
    expect(view.quote).toMatchObject({ id: quoted.quote.id, status: 'ACTIVE' });
    expect(view.territory?.hasActiveOwner).toBe(true);
    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'claimed_pricing_not_configured',
    });
    // The stored quote row is left exactly as issued.
    await expect(
      prisma.takeoverQuote.findUniqueOrThrow({ where: { id: quoted.quote.id } }),
    ).resolves.toMatchObject({
      minimumAmountMinor: 1_000n,
      status: 'ACTIVE',
      takeoverIntentId: intent.id,
    });
  });

  it('lets two managers of one company hold their own quotes without disrupting each other', async () => {
    const first = await createManagedCompany('manager-one');
    // Second manager: another contact with a grant and session on the same company.
    const secondContact = await prisma.companyContact.create({
      data: { email: 'manager-two@gmail.com', normalizedEmail: 'manager-two@gmail.com' },
    });
    const secondGrant = await prisma.companyManagementGrant.create({
      data: { companyId: first.company.id, contactId: secondContact.id, source: 'INITIAL_CONTACT' },
    });
    const secondSession = await prisma.companyManagementSession.create({
      data: {
        companyId: first.company.id,
        csrfDigest: Buffer.alloc(32, 2),
        expiresAt: soon(),
        grantId: secondGrant.id,
        tokenDigest: Buffer.from(randomUUID().replaceAll('-', '').padEnd(64, '0'), 'hex'),
      },
    });
    const second: Managed = {
      company: first.company,
      contact: secondContact,
      grant: secondGrant,
      session: secondSession,
    };
    const territory = await createTerritory('shared-priced', 1_000n);
    const [firstIntent, secondIntent] = await Promise.all([
      prepare(first, territory.slug),
      prepare(second, territory.slug),
    ]);

    const results = await Promise.all([
      ...Array.from({ length: 3 }, () => generate(first)),
      ...Array.from({ length: 3 }, () => generate(second)),
    ]);

    const firstIds = new Set(results.slice(0, 3).map((result) => result.quote.id));
    const secondIds = new Set(results.slice(3).map((result) => result.quote.id));
    expect(firstIds.size).toBe(1);
    expect(secondIds.size).toBe(1);
    expect([...firstIds][0]).not.toBe([...secondIds][0]);
    const active = await prisma.takeoverQuote.findMany({
      where: { companyId: first.company.id, status: 'ACTIVE' },
    });
    expect(active.map((quote) => quote.takeoverIntentId).sort()).toEqual(
      [firstIntent.id, secondIntent.id].sort(),
    );
    expect(await prisma.takeoverQuote.count({ where: { status: { not: 'ACTIVE' } } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['takeover_quote.replaced', 'takeover_quote.cancelled'] } },
      }),
    ).toBe(0);

    // Cancelling one manager's preparation closes only that manager's quote.
    await repository.cancelTakeoverIntent({
      companyId: first.company.id,
      contactId: first.contact.id,
      intentId: firstIntent.id,
      now: now(),
      sessionId: first.session.id,
    });
    await expect(
      prisma.takeoverQuote.findFirstOrThrow({ where: { takeoverIntentId: secondIntent.id } }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(
      prisma.takeoverQuote.findFirstOrThrow({ where: { takeoverIntentId: firstIntent.id } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('creates no checkout, payment, refund, capture, ownership or webhook rows while quoting', async () => {
    const managed = await createManagedCompany('no-money');
    await createTerritory('no-money-priced', 1_000n);
    await prepare(managed, 'no-money-priced');
    await Promise.all(Array.from({ length: 3 }, () => generate(managed)));

    expect(await prisma.takeoverQuote.count()).toBe(1);
    expect(await prisma.checkoutSession.count()).toBe(0);
    expect(await prisma.checkoutStatusToken.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentReconciliationAction.count()).toBe(0);
    expect(await prisma.ownershipCapture.count()).toBe(0);
    expect(await prisma.territoryOwnership.count()).toBe(0);
    expect(await prisma.paymentWebhookEvent.count()).toBe(0);
  });

  it('cancels active quotes with their intent and forbids another company from reaching them', async () => {
    const owner = await createManagedCompany('owner');
    const stranger = await createManagedCompany('stranger');
    await createTerritory('owned-priced', 1_000n);
    const intent = await prepare(owner, 'owned-priced');
    const quoted = await generate(owner);

    const strangerView = await repository.getTakeoverPreparation({
      companyId: stranger.company.id,
      contactId: stranger.contact.id,
      now: now(),
    });
    expect(strangerView).toEqual({ intent: null, quote: null, territory: null });

    const cancelled = await repository.cancelTakeoverIntent({
      companyId: owner.company.id,
      contactId: owner.contact.id,
      intentId: intent.id,
      now: now(),
      sessionId: owner.session.id,
    });
    expect(cancelled?.intent?.status).toBe('CANCELLED');
    expect(cancelled?.quote).toMatchObject({ id: quoted.quote.id, status: 'CANCELLED' });
    expect(await prisma.auditLog.count({ where: { action: 'takeover_quote.cancelled' } })).toBe(1);

    // Restarting the same territory yields a new intent and a new quote; the
    // old quote stays cancelled and bound to the old intent.
    const restarted = await prepare(owner, 'owned-priced');
    const fresh = await generate(owner);
    expect(restarted.id).not.toBe(intent.id);
    expect(fresh.quote.takeoverIntentId).toBe(restarted.id);
    expect(fresh.quote.id).not.toBe(quoted.quote.id);
  });

  it('returns the live quote from a repeated start and keeps the view valid once the territory is gone', async () => {
    const managed = await createManagedCompany('repeat');
    const territory = await createTerritory('repeat-priced', 1_000n);
    await prepare(managed, territory.slug);
    const quoted = await generate(managed);

    // Repeating the same territory reuses the intent and carries its quote.
    const repeated = await repository.startTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      expiresAt: soon(),
      now: now(),
      sessionId: managed.session.id,
      territoryExternalRef: territory.slug,
    });
    expect(repeated.kind === 'ready' && repeated.created).toBe(false);
    expect(repeated.kind === 'ready' ? repeated.quote?.id : undefined).toBe(quoted.quote.id);

    // Deleting the territory row leaves the quote readable and classified as stale.
    await prisma.takeoverQuote.updateMany({
      where: { territoryId: territory.id },
      data: { status: 'CANCELLED' },
    });
    await prisma.takeoverIntent.updateMany({
      where: { companyId: managed.company.id },
      data: { territoryId: null },
    });
    await prisma.takeoverQuote.deleteMany({ where: { territoryId: territory.id } });
    await prisma.territory.delete({ where: { id: territory.id } });
    const view = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: now(),
    });
    expect(view.territory).toBeNull();
    expect(view.intent?.territoryExternalRef).toBe('repeat-priced');
  });

  it('is backed by a partial unique index per intent, keeping public quotes unique too', async () => {
    const managed = await createManagedCompany('index');
    const territory = await createTerritory('index-priced', 1_000n);
    const intent = await prepare(managed, territory.slug);
    await generate(managed);

    await expect(
      prisma.takeoverQuote.create({
        data: {
          companyId: managed.company.id,
          currency: 'USD',
          expiresAt: inFiveMinutes(),
          minimumAmountMinor: 1_000n,
          observedAt: now(),
          status: 'ACTIVE',
          takeoverIntentId: intent.id,
          territoryId: territory.id,
          territoryVersion: territory.version,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
    // Public quotes carry no intent; NULLS NOT DISTINCT keeps them unique per
    // territory, company and version exactly as before.
    const publicQuote = {
      companyId: managed.company.id,
      currency: 'USD',
      expiresAt: inFiveMinutes(),
      minimumAmountMinor: 1_000n,
      observedAt: now(),
      status: 'ACTIVE' as const,
      territoryId: territory.id,
      territoryVersion: territory.version,
    };
    await prisma.takeoverQuote.create({ data: publicQuote });
    await expect(prisma.takeoverQuote.create({ data: publicQuote })).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
    // The CHECK constraint keeps a zero amount out even if application code regressed.
    await expect(
      prisma.takeoverQuote.create({
        data: {
          companyId: managed.company.id,
          currency: 'USD',
          expiresAt: inFiveMinutes(),
          minimumAmountMinor: 0n,
          observedAt: now(),
          status: 'CANCELLED',
          territoryId: territory.id,
          territoryVersion: territory.version,
        },
      }),
    ).rejects.toThrow();
  });

  it('cannot start checkout from a preparation quote once its intent is cancelled', async () => {
    const managed = await createManagedCompany('checkout');
    await createTerritory('checkout-priced', 1_000n);
    const intent = await prepare(managed, 'checkout-priced');
    const quoted = await generate(managed);
    const provider: PaymentProvider = {
      createCheckoutSession: async () => {
        throw new Error('provider must never be called');
      },
      name: 'NEVER',
      refundPayment: async () => {
        throw new Error('provider must never be called');
      },
    } as unknown as PaymentProvider;
    const service = new TakeoverService({
      checkout: { enabled: true },
      clock: { now },
      provider,
      repository: new PrismaTakeoverRepository(prisma),
      statusTokenSecret: new Uint8Array(32).fill(9),
      statusTokenTtlSeconds: 60,
      trustedWebOrigin: 'http://localhost:3000',
    });

    // The quote row is still ACTIVE, but its intent has lapsed: refused as
    // if the quote did not exist, disclosing nothing about why.
    await prisma.takeoverIntent.update({
      where: { id: intent.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      service.createCheckout({ companyId: managed.company.id, quoteId: quoted.quote.id }),
    ).rejects.toBeInstanceOf(CheckoutNotFoundError);

    // Cancelling the intent closes the quote itself, so checkout then fails
    // on the quote before the intent is even consulted.
    await prisma.takeoverIntent.update({ where: { id: intent.id }, data: { expiresAt: soon() } });
    await repository.cancelTakeoverIntent({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      intentId: intent.id,
      now: now(),
      sessionId: managed.session.id,
    });
    await expect(
      service.createCheckout({ companyId: managed.company.id, quoteId: quoted.quote.id }),
    ).rejects.toBeInstanceOf(CheckoutQuoteExpiredError);
    expect(await prisma.checkoutSession.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.territoryOwnership.count()).toBe(0);
  });
});

describe('pricing a held territory from its settled capture', () => {
  /** A completed capture backed by a confirmed payment, as the capture transaction writes it. */
  async function recordSettledCapture(input: {
    amountMinor: bigint;
    currency?: string;
    ownerId: string;
    paymentStatus?: 'CONFIRMED' | 'REFUNDED' | 'PENDING' | 'FAILED';
    captureStatus?: 'COMPLETED' | 'FAILED' | 'REFUNDED';
    territoryId: string;
    territoryVersion: bigint;
  }) {
    const quoteRow = await prisma.takeoverQuote.create({
      data: {
        companyId: input.ownerId,
        currency: input.currency ?? 'USD',
        expiresAt: soon(),
        minimumAmountMinor: input.amountMinor,
        observedAt: now(),
        status: 'CANCELLED',
        territoryId: input.territoryId,
        territoryVersion: input.territoryVersion - 1n,
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        companyId: input.ownerId,
        provider: 'TEST',
        providerCheckoutId: randomUUID(),
        providerCheckoutUrl: 'https://provider.example/checkout',
        quoteId: quoteRow.id,
        status: 'COMPLETED',
      },
    });
    const payment = await prisma.payment.create({
      data: {
        amountMinor: input.amountMinor,
        checkoutId: checkout.id,
        confirmedAt: now(),
        currency: input.currency ?? 'USD',
        provider: 'TEST',
        providerPaymentId: randomUUID(),
        status: input.paymentStatus ?? 'CONFIRMED',
      },
    });
    const capture = await prisma.ownershipCapture.create({
      data: {
        completedAt: now(),
        expectedTerritoryVersion: input.territoryVersion - 1n,
        newOwnerCompanyId: input.ownerId,
        paymentId: payment.id,
        status: input.captureStatus ?? 'COMPLETED',
        territoryId: input.territoryId,
      },
    });
    return { capture, checkout, payment };
  }

  async function createOwner(label: string) {
    return prisma.company.create({
      data: {
        activatedAt: now(),
        name: label,
        normalizedName: label,
        normalizedWebsite: `https://${label}.example/`,
        slug: label,
        status: 'ACTIVE',
        websiteUrl: `https://${label}.example/`,
      },
    });
  }

  /** Puts the territory under an open reign at the given version. */
  async function claim(territoryId: string, ownerId: string, territoryVersion: bigint) {
    await prisma.territoryOwnership.create({
      data: {
        capturedAt: now(),
        companyId: ownerId,
        source: 'PAID_CAPTURE',
        territoryId,
        territoryVersion,
      },
    });
    await prisma.territory.update({
      data: { version: territoryVersion },
      where: { id: territoryId },
    });
  }

  it('quotes 20% above the settled amount, rounded up, and never the stored minimum', async () => {
    const managed = await createManagedCompany('settled');
    const owner = await createOwner('settled-owner');
    const territory = await createTerritory('settled-priced', 1_000n);
    await claim(territory.id, owner.id, 2n);
    // The stored minimum is deliberately wrong; the settled amount decides.
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 9_999n },
      where: { id: territory.id },
    });
    await recordSettledCapture({
      amountMinor: 1_201n,
      ownerId: owner.id,
      territoryId: territory.id,
      territoryVersion: 2n,
    });
    await prepare(managed, territory.slug);

    const quoted = await generate(managed);

    // ceil(1201 * 6 / 5) = 1442
    expect(quoted.quote.minimumAmountMinor).toBe(1_442n);
    expect(quoted.quote.currency).toBe('USD');
    expect(quoted.territory.currentOwner).toEqual({ name: 'settled-owner', slug: 'settled-owner' });
  });

  it.each([
    ['a seeded reign with no capture', { skipCapture: true }],
    ['a refunded capture', { captureStatus: 'REFUNDED' as const }],
    ['a failed capture', { captureStatus: 'FAILED' as const }],
    ['a refunded payment', { paymentStatus: 'REFUNDED' as const }],
    ['a pending payment', { paymentStatus: 'PENDING' as const }],
    ['a failed payment', { paymentStatus: 'FAILED' as const }],
  ])('fails closed for %s', async (label, options) => {
    const slug = `unprovable-${label.replace(/[^a-z]+/g, '-')}`;
    const managed = await createManagedCompany(slug);
    const owner = await createOwner(`${slug}-owner`);
    const territory = await createTerritory(slug, 1_000n);
    await claim(territory.id, owner.id, 2n);
    if (!('skipCapture' in options)) {
      await recordSettledCapture({
        amountMinor: 1_200n,
        ownerId: owner.id,
        territoryId: territory.id,
        territoryVersion: 2n,
        ...options,
      });
    }
    await prepare(managed, territory.slug);

    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'claimed_pricing_not_configured',
    });
    expect(await prisma.takeoverQuote.count({ where: { takeoverIntentId: { not: null } } })).toBe(
      0,
    );
  });

  it('fails closed when two completed captures make the price ambiguous', async () => {
    const managed = await createManagedCompany('ambiguous');
    const owner = await createOwner('ambiguous-owner');
    const territory = await createTerritory('ambiguous-priced', 1_000n);
    await claim(territory.id, owner.id, 2n);
    await recordSettledCapture({
      amountMinor: 1_200n,
      ownerId: owner.id,
      territoryId: territory.id,
      territoryVersion: 2n,
    });
    await recordSettledCapture({
      amountMinor: 3_000n,
      ownerId: owner.id,
      territoryId: territory.id,
      territoryVersion: 2n,
    });
    await prepare(managed, territory.slug);

    await expect(repository.generatePreparationQuote(quoteInput(managed))).resolves.toEqual({
      kind: 'claimed_pricing_not_configured',
    });
  });

  it('makes an existing quote stale once the canonical price changes', async () => {
    const managed = await createManagedCompany('repriced');
    const territory = await createTerritory('repriced-territory', 1_000n);
    await prepare(managed, territory.slug);
    const first = await generate(managed);
    expect(first.quote.minimumAmountMinor).toBe(1_000n);

    // A capture would raise the stored minimum exactly this way.
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 1_200n },
      where: { id: territory.id },
    });

    const view = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: now(),
    });
    expect(view.quote).toMatchObject({ id: first.quote.id, minimumAmountMinor: 1_000n });
    const second = await generate(managed);
    expect(second.reused).toBe(false);
    expect(second.quote.minimumAmountMinor).toBe(1_200n);
  });

  it('prices concurrent generations on a held territory identically, creating one quote', async () => {
    const managed = await createManagedCompany('concurrent-priced');
    const owner = await createOwner('concurrent-owner');
    const territory = await createTerritory('concurrent-territory', 1_000n);
    await claim(territory.id, owner.id, 2n);
    await recordSettledCapture({
      amountMinor: 1_200n,
      ownerId: owner.id,
      territoryId: territory.id,
      territoryVersion: 2n,
    });
    await prepare(managed, territory.slug);

    const results = await Promise.all(Array.from({ length: 5 }, () => generate(managed)));

    expect(new Set(results.map((result) => result.quote.id)).size).toBe(1);
    for (const result of results) {
      expect(result.quote.minimumAmountMinor).toBe(1_440n);
    }
    expect(await prisma.takeoverQuote.count({ where: { takeoverIntentId: { not: null } } })).toBe(
      1,
    );
  });

  it('records no payout, credit, reconciliation or ownership change while pricing', async () => {
    const managed = await createManagedCompany('no-payout');
    const owner = await createOwner('no-payout-owner');
    const territory = await createTerritory('no-payout-territory', 1_000n);
    await claim(territory.id, owner.id, 2n);
    const settled = await recordSettledCapture({
      amountMinor: 1_200n,
      ownerId: owner.id,
      territoryId: territory.id,
      territoryVersion: 2n,
    });
    await prepare(managed, territory.slug);

    await generate(managed);

    // Exactly the rows the fixture created: quoting adds no money movement,
    // and the previous owner receives nothing.
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.payment.count({ where: { id: settled.payment.id } })).toBe(1);
    expect(await prisma.checkoutSession.count()).toBe(1);
    expect(await prisma.ownershipCapture.count()).toBe(1);
    expect(await prisma.paymentReconciliationAction.count()).toBe(0);
    expect(await prisma.paymentWebhookEvent.count()).toBe(0);
    // The reign is untouched: same owner, same version, still open.
    await expect(
      prisma.territoryOwnership.findFirstOrThrow({ where: { territoryId: territory.id } }),
    ).resolves.toMatchObject({ companyId: owner.id, endedAt: null, territoryVersion: 2n });
  });
});
