import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDatabase, getDatabaseClient } from '../src/index.js';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import {
  createPhase3Fixture,
  deletePhase3Fixture,
  expectCheckViolation,
  expectForeignKeyViolation,
  expectRawPostgresError,
  expectUniqueViolation,
  type Phase3Fixture,
} from './helpers/phase3.js';

/**
 * Phase 3 `CheckoutSession`, `CheckoutStatusToken`, and `Payment` database
 * invariants against real PostgreSQL.
 *
 * The committed schema enforces composite provider-reference uniqueness
 * (`uq_checkout_provider`, `uq_payment_provider`), the non-negative payment
 * check (`Payment_amount_minor_check`), the `PaymentStatus` enum with
 * `CONFIRMED` in place of `CAPTURED`, and token digest uniqueness. Two
 * idempotency invariants are deliberately absent from the committed schema
 * (one active checkout per quote, one confirmed payment per checkout); the
 * tests below prove their absence from the catalog so the gap is pinned in a
 * failing test the day one of them is added.
 */

const prisma = getDatabaseClient() as PrismaClient;

const fixtures: Phase3Fixture[] = [];

beforeEach(async () => {
  fixtures.push(await createPhase3Fixture(prisma));
});

afterAll(async () => {
  for (const fixture of fixtures.reverse()) {
    await deletePhase3Fixture(prisma, fixture);
  }
  await disconnectDatabase();
});

function currentFixture(): Phase3Fixture {
  const fixture = fixtures.at(-1);
  if (fixture === undefined) throw new Error('fixture was not created');
  return fixture;
}

function quoteData(
  fixture: Phase3Fixture,
  overrides: { territoryVersion?: bigint; companyId?: string } = {},
): {
  territoryId: string;
  companyId: string;
  territoryVersion: bigint;
  currency: string;
  minimumAmountMinor: bigint;
  status: 'ACTIVE';
  expiresAt: Date;
  observedAt: Date;
} {
  const now = new Date('2026-09-03T12:00:00.000Z');
  return {
    territoryId: fixture.territoryId,
    companyId: overrides.companyId ?? fixture.companyId,
    territoryVersion: overrides.territoryVersion ?? 1n,
    currency: 'USD',
    minimumAmountMinor: 1000n,
    status: 'ACTIVE',
    expiresAt: new Date(now.getTime() + 300_000),
    observedAt: now,
  };
}

function checkoutData(
  quoteId: string,
  fixture: Phase3Fixture,
  overrides: { provider?: string; providerCheckoutId?: string; companyId?: string } = {},
): {
  quoteId: string;
  companyId: string;
  provider: string;
  providerCheckoutId: string;
} {
  return {
    quoteId,
    companyId: overrides.companyId ?? fixture.companyId,
    provider: overrides.provider ?? 'DODO',
    providerCheckoutId: overrides.providerCheckoutId ?? `chk-${randomUUID()}`,
  };
}

function paymentData(
  checkoutId: string,
  overrides: {
    provider?: string;
    providerPaymentId?: string;
    amountMinor?: bigint;
    currency?: string;
    status?: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'RECONCILED';
  } = {},
): {
  checkoutId: string;
  provider: string;
  providerPaymentId: string;
  amountMinor: bigint;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'RECONCILED';
} {
  return {
    checkoutId,
    provider: overrides.provider ?? 'DODO',
    providerPaymentId: overrides.providerPaymentId ?? `pay-${randomUUID()}`,
    amountMinor: overrides.amountMinor ?? 1000n,
    currency: overrides.currency ?? 'USD',
    status: overrides.status ?? 'PENDING',
  };
}

async function uniqueIndexCount(table: string, column: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*) AS count FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = '${table}'
       AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%(${column})%'`,
  );
  return Number(result[0]?.count ?? 0n);
}

describe('Phase 3 checkout session invariants', () => {
  it('rejects a duplicate provider checkout id across quotes under the same provider', async () => {
    const fixture = currentFixture();
    const firstQuote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const secondQuote = await prisma.takeoverQuote.create({
      data: quoteData(fixture, { territoryVersion: 2n }),
    });
    const sharedProviderCheckoutId = `chk-${randomUUID()}`;
    await prisma.checkoutSession.create({
      data: checkoutData(firstQuote.id, fixture, { providerCheckoutId: sharedProviderCheckoutId }),
    });
    const error = await prisma.checkoutSession
      .create({
        data: checkoutData(secondQuote.id, fixture, { providerCheckoutId: sharedProviderCheckoutId }),
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'uq_checkout_provider');
  });

  it('allows the same provider checkout id under a different provider', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const sharedProviderCheckoutId = `chk-${randomUUID()}`;
    await prisma.checkoutSession.create({
      data: checkoutData(quote.id, fixture, { providerCheckoutId: sharedProviderCheckoutId }),
    });
    const otherProvider = await prisma.checkoutSession.create({
      data: checkoutData(quote.id, fixture, {
        provider: 'OTHER',
        providerCheckoutId: sharedProviderCheckoutId,
      }),
    });

    expect(otherProvider.provider).toBe('OTHER');
    expect(
      await prisma.checkoutSession.count({
        where: { providerCheckoutId: sharedProviderCheckoutId },
      }),
    ).toBe(2);
  });

  it('defaults the status to CREATED and round trips every committed status value', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const defaulted = await prisma.checkoutSession.create({
      data: checkoutData(quote.id, fixture),
    });
    expect(defaulted.status).toBe('CREATED');

    for (const status of ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const) {
      const session = await prisma.checkoutSession.create({
        data: checkoutData(quote.id, fixture, { providerCheckoutId: `chk-${randomUUID()}` }),
      });
      const updated = await prisma.checkoutSession.update({
        where: { id: session.id },
        data: { status },
      });
      expect(updated.status).toBe(status);
    }
  });

  it('rejects an unknown checkout status at the enum level', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const error = await prisma
      .$executeRawUnsafe(
        `UPDATE checkout_sessions SET status = 'CHARGED'::"CheckoutStatus" WHERE id = '${session.id}'`,
      )
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectRawPostgresError(error, '22P02');
  });

  it('rejects a checkout referencing a missing quote with the named foreign key', async () => {
    const fixture = currentFixture();
    const error = await prisma.checkoutSession
      .create({
        data: checkoutData('00000000-0000-4000-8000-000000000000', fixture),
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'CheckoutSession_quote_id_fkey');
  });

  it('rejects a checkout referencing a missing company with the named foreign key', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const error = await prisma.checkoutSession
      .create({
        data: checkoutData(quote.id, fixture, {
          companyId: '00000000-0000-4000-8000-000000000000',
        }),
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'CheckoutSession_company_id_fkey');
  });

  it('proves the committed schema does not yet enforce one active checkout per quote', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });

    expect(
      await prisma.checkoutSession.count({ where: { quoteId: quote.id } }),
      'two CREATED checkouts for one quote exist; if this fails the invariant was added and this test must be replaced',
    ).toBe(2);
    expect(
      await uniqueIndexCount('checkout_sessions', 'quote_id'),
      'no unique index covers checkout_sessions.quote_id',
    ).toBe(0);
  });
});

describe('Phase 3 checkout status token invariants', () => {
  it('rejects a duplicate token digest with the named unique constraint', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const digest = Buffer.from(`digest-${randomUUID()}`);
    await prisma.checkoutStatusToken.create({
      data: { checkoutId: session.id, tokenDigest: digest, expiresAt: new Date('2026-09-04T12:00:00.000Z') },
    });
    const error = await prisma.checkoutStatusToken
      .create({
        data: { checkoutId: session.id, tokenDigest: digest, expiresAt: new Date('2026-09-04T12:00:00.000Z') },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'CheckoutStatusToken_token_digest_key');
  });

  it('round trips expiry and revocation fields and leaves revocation unset by default', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const expiresAt = new Date('2026-09-04T12:00:00.000Z');
    const token = await prisma.checkoutStatusToken.create({
      data: { checkoutId: session.id, tokenDigest: Buffer.from(`digest-${randomUUID()}`), expiresAt },
    });
    expect(token.revokedAt).toBeNull();

    const revokedAt = new Date('2026-09-03T13:00:00.000Z');
    const revoked = await prisma.checkoutStatusToken.update({
      where: { id: token.id },
      data: { revokedAt },
    });
    expect(revoked.revokedAt?.toISOString()).toBe(revokedAt.toISOString());
  });

  it('cascades token deletion when the checkout is deleted', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const token = await prisma.checkoutStatusToken.create({
      data: { checkoutId: session.id, tokenDigest: Buffer.from(`digest-${randomUUID()}`), expiresAt: new Date('2026-09-04T12:00:00.000Z') },
    });
    await prisma.checkoutSession.delete({ where: { id: session.id } });

    expect(await prisma.checkoutStatusToken.count({ where: { id: token.id } })).toBe(0);
  });
});

describe('Phase 3 payment invariants', () => {
  it('persists every committed PaymentStatus value through Prisma', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });

    for (const status of ['PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'RECONCILED'] as const) {
      const payment = await prisma.payment.create({
        data: paymentData(session.id, { providerPaymentId: `pay-${randomUUID()}`, status }),
      });
      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(stored.status).toBe(status);
    }
    expect(await prisma.payment.count({ where: { checkoutId: session.id } })).toBe(5);
  });

  it('writes CONFIRMED through Prisma and reads it back unchanged', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const payment = await prisma.payment.create({
      data: paymentData(session.id, { status: 'CONFIRMED' }),
    });

    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('CONFIRMED');
  });

  it('rejects CAPTURED as an invalid PaymentStatus before any row is written', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const rejectedPaymentId = `pay-${randomUUID()}`;
    const error = await prisma.payment
      .create({ data: paymentData(session.id, { status: 'CAPTURED' as never }) })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(error, 'CAPTURED must not be a valid PaymentStatus').toBeInstanceOf(
      Prisma.PrismaClientValidationError,
    );
    expect(await prisma.payment.count({ where: { providerPaymentId: rejectedPaymentId } })).toBe(0);
  });

  it('rejects a negative amount with the named check constraint and allows zero', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const negative = await prisma.payment
      .create({ data: paymentData(session.id, { amountMinor: -1n }) })
      .then(() => null)
      .catch((caught: unknown) => caught);
    expectCheckViolation(negative, 'Payment_amount_minor_check');

    const zero = await prisma.payment.create({
      data: paymentData(session.id, { amountMinor: 0n, providerPaymentId: `pay-${randomUUID()}` }),
    });
    expect(zero.amountMinor).toBe(0n);
  });

  it('rejects a duplicate provider payment id and allows reuse across providers', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const sharedProviderPaymentId = `pay-${randomUUID()}`;
    await prisma.payment.create({
      data: paymentData(session.id, { providerPaymentId: sharedProviderPaymentId }),
    });
    const error = await prisma.payment
      .create({ data: paymentData(session.id, { providerPaymentId: sharedProviderPaymentId }) })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'uq_payment_provider');

    const otherProvider = await prisma.payment.create({
      data: paymentData(session.id, {
        provider: 'OTHER',
        providerPaymentId: sharedProviderPaymentId,
      }),
    });
    expect(otherProvider.provider).toBe('OTHER');
  });

  it('rejects a payment referencing a missing checkout with the named foreign key', async () => {
    const error = await prisma.payment
      .create({ data: paymentData('00000000-0000-4000-8000-000000000000') })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'Payment_checkout_id_fkey');
  });

  it('enforces the VARCHAR(3) currency column at the database level', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    const error = await prisma
      .$executeRawUnsafe(
        `INSERT INTO payments (checkout_id, provider, provider_payment_id, amount_minor, currency, status)
         VALUES ('${session.id}', 'DODO', 'pay-${randomUUID()}', 1000, 'USDD', 'PENDING')`,
      )
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectRawPostgresError(error, '22001');
  });

  it('proves the committed schema does not yet enforce one confirmed payment per checkout', async () => {
    const fixture = currentFixture();
    const quote = await prisma.takeoverQuote.create({ data: quoteData(fixture) });
    const session = await prisma.checkoutSession.create({ data: checkoutData(quote.id, fixture) });
    await prisma.payment.create({
      data: paymentData(session.id, { status: 'CONFIRMED', providerPaymentId: `pay-${randomUUID()}` }),
    });
    await prisma.payment.create({
      data: paymentData(session.id, { status: 'CONFIRMED', providerPaymentId: `pay-${randomUUID()}` }),
    });

    expect(
      await prisma.payment.count({ where: { checkoutId: session.id, status: 'CONFIRMED' } }),
      'two CONFIRMED payments for one checkout exist; if this fails the invariant was added and this test must be replaced',
    ).toBe(2);
    expect(
      await uniqueIndexCount('payments', 'checkout_id'),
      'no unique index covers payments.checkout_id',
    ).toBe(0);
  });
});
