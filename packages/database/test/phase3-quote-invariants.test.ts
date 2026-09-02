import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDatabase, getDatabaseClient } from '../src/index.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
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
 * Phase 3 `TakeoverQuote` database invariants, verified against real PostgreSQL.
 *
 * The active-quote rule lives in the partial unique index
 * `uq_takeover_quote_active` (territory_id, company_id, territory_version)
 * WHERE status = 'ACTIVE', and the legal-minimum rule in the
 * `TakeoverQuote_minimum_amount_minor_check` constraint. Every test asserts the
 * concrete PostgreSQL error or the persisted rows, never a bare rejection.
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

type QuoteInput = {
  territoryId: string;
  companyId: string;
  territoryVersion: bigint;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
};

function quoteInput(
  fixture: Phase3Fixture,
  overrides: Partial<QuoteInput> = {},
): {
  territoryId: string;
  companyId: string;
  territoryVersion: bigint;
  currency: string;
  minimumAmountMinor: bigint;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  expiresAt: Date;
  observedAt: Date;
} {
  const now = new Date('2026-09-03T12:00:00.000Z');
  return {
    territoryId: fixture.territoryId,
    companyId: fixture.companyId,
    territoryVersion: 1n,
    currency: 'USD',
    minimumAmountMinor: 1000n,
    status: 'ACTIVE',
    expiresAt: new Date(now.getTime() + 300_000),
    observedAt: now,
    ...overrides,
  };
}

describe('Phase 3 takeover quote invariants', () => {
  it('rejects a second ACTIVE quote for the same territory, company, and version', async () => {
    const fixture = currentFixture();
    await prisma.takeoverQuote.create({ data: quoteInput(fixture) });
    const error = await prisma.takeoverQuote
      .create({ data: quoteInput(fixture) })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'uq_takeover_quote_active');
    expect(await prisma.takeoverQuote.count({ where: { companyId: fixture.companyId } })).toBe(1);
  });

  it('allows an EXPIRED quote to coexist with an ACTIVE quote at the same version', async () => {
    const fixture = currentFixture();
    await prisma.takeoverQuote.create({ data: quoteInput(fixture) });
    const expired = await prisma.takeoverQuote.create({
      data: quoteInput(fixture, { status: 'EXPIRED' }),
    });

    expect(expired.status).toBe('EXPIRED');
    expect(
      await prisma.takeoverQuote.count({
        where: { companyId: fixture.companyId, territoryVersion: 1n },
      }),
    ).toBe(2);
  });

  it('allows a CANCELLED quote to coexist with an ACTIVE quote at the same version', async () => {
    const fixture = currentFixture();
    await prisma.takeoverQuote.create({ data: quoteInput(fixture) });
    const cancelled = await prisma.takeoverQuote.create({
      data: quoteInput(fixture, { status: 'CANCELLED' }),
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(
      await prisma.takeoverQuote.count({
        where: { companyId: fixture.companyId, territoryVersion: 1n },
      }),
    ).toBe(2);
  });

  it('allows a new ACTIVE quote when the territory version advances', async () => {
    const fixture = currentFixture();
    const nextVersion = await prisma.takeoverQuote.create({
      data: quoteInput(fixture, { territoryVersion: 2n }),
    });

    expect(nextVersion.territoryVersion).toBe(2n);
    expect(nextVersion.status).toBe('ACTIVE');
  });

  it('allows two companies to hold ACTIVE quotes for the same territory and version', async () => {
    const fixture = currentFixture();
    await prisma.takeoverQuote.create({ data: quoteInput(fixture) });
    const rivalQuote = await prisma.takeoverQuote.create({
      data: quoteInput(fixture, { companyId: fixture.secondCompanyId }),
    });

    expect(rivalQuote.companyId).toBe(fixture.secondCompanyId);
    expect(
      await prisma.takeoverQuote.count({
        where: { territoryId: fixture.territoryId, territoryVersion: 1n, status: 'ACTIVE' },
      }),
    ).toBe(2);
  });

  it('rejects a zero minimum amount with the named check constraint', async () => {
    const fixture = currentFixture();
    const error = await prisma.takeoverQuote
      .create({ data: quoteInput(fixture, { minimumAmountMinor: 0n, territoryVersion: 3n }) })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectCheckViolation(error, 'TakeoverQuote_minimum_amount_minor_check');
  });

  it('rejects a quote referencing a missing territory with the named foreign key', async () => {
    const fixture = currentFixture();
    const error = await prisma.takeoverQuote
      .create({
        data: quoteInput(fixture, {
          territoryId: '00000000-0000-4000-8000-000000000000',
          territoryVersion: 4n,
        }),
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'TakeoverQuote_territory_id_fkey');
  });

  it('rejects a quote referencing a missing company with the named foreign key', async () => {
    const fixture = currentFixture();
    const error = await prisma.takeoverQuote
      .create({
        data: quoteInput(fixture, {
          companyId: '00000000-0000-4000-8000-000000000000',
          territoryVersion: 5n,
        }),
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'TakeoverQuote_company_id_fkey');
  });

  it('persists quote timestamps exactly and leaves consumedAt unset until consumption', async () => {
    const fixture = currentFixture();
    const observedAt = new Date('2026-09-03T08:30:00.000Z');
    const expiresAt = new Date('2026-09-03T09:00:00.000Z');
    const quote = await prisma.takeoverQuote.create({
      data: quoteInput(fixture, { observedAt, expiresAt, territoryVersion: 6n }),
    });
    const stored = await prisma.takeoverQuote.findUniqueOrThrow({ where: { id: quote.id } });

    expect(stored.observedAt.toISOString()).toBe(observedAt.toISOString());
    expect(stored.expiresAt.toISOString()).toBe(expiresAt.toISOString());
    expect(stored.consumedAt).toBeNull();
    expect(stored.idempotencyKeyDigest).toBeNull();
  });

  it('rejects an unknown quote status at the enum level', async () => {
    const fixture = currentFixture();
    const error = await prisma
      .$executeRawUnsafe(
        `INSERT INTO takeover_quotes
           (territory_id, territory_version, company_id, currency, minimum_amount_minor, status, expires_at, observed_at)
         VALUES ('${fixture.territoryId}', 7, '${fixture.companyId}', 'USD', 1000, 'SETTLED', now() + interval '5 minutes', now())`,
      )
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectRawPostgresError(error, '22P02');
  });
});
