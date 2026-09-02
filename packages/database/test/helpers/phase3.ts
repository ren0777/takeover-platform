import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { Prisma, type PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Shared fixtures and error assertions for the Phase 3 constraint tests.
 *
 * Every fixture is namespaced by a fresh random suffix, so suites are
 * rerunnable and parallel-safe without truncating shared tables. Cleanup runs
 * in foreign-key order and only touches rows these suites created.
 */

export type Phase3Fixture = {
  suffix: string;
  categoryId: string;
  territoryId: string;
  companyId: string;
  secondCompanyId: string;
};

export async function createPhase3Fixture(prisma: PrismaClient): Promise<Phase3Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.territoryCategory.create({
    data: { slug: `p3-${suffix}`, name: `Phase 3 probe ${suffix}`, displayOrder: 999 },
  });
  const territory = await prisma.territory.create({
    data: {
      slug: `p3-${suffix}`,
      name: `Phase 3 probe territory ${suffix}`,
      description: 'Phase 3 constraint probe territory',
      categoryId: category.id,
      displayWeight: 1,
      visualMetadata: {},
      version: 1n,
    },
  });
  const company = await prisma.company.create({
    data: {
      name: `Phase 3 probe company ${suffix}`,
      normalizedName: `phase 3 probe company ${suffix}`,
      slug: `p3-company-${suffix}`,
      websiteUrl: `https://p3-${suffix}.example/`,
      normalizedWebsite: `https://p3-${suffix}.example/`,
      status: 'ACTIVE',
    },
  });
  const secondCompany = await prisma.company.create({
    data: {
      name: `Phase 3 probe company B ${suffix}`,
      normalizedName: `phase 3 probe company b ${suffix}`,
      slug: `p3-company-b-${suffix}`,
      websiteUrl: `https://p3-b-${suffix}.example/`,
      normalizedWebsite: `https://p3-b-${suffix}.example/`,
      status: 'ACTIVE',
    },
  });
  return {
    suffix,
    categoryId: category.id,
    territoryId: territory.id,
    companyId: company.id,
    secondCompanyId: secondCompany.id,
  };
}

/**
 * Deletes a fixture's rows in foreign-key order. Idempotent.
 *
 * The Phase 3 models expose scalar foreign-key columns without Prisma
 * relations, so cleanup resolves ids with explicit reads instead of nested
 * relation filters.
 */
export async function deletePhase3Fixture(
  prisma: PrismaClient,
  fixture: Phase3Fixture,
): Promise<void> {
  const sessions = await prisma.checkoutSession.findMany({
    where: { companyId: { in: [fixture.companyId, fixture.secondCompanyId] } },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);
  const payments = sessionIds.length
    ? await prisma.payment.findMany({ where: { checkoutId: { in: sessionIds } }, select: { id: true } })
    : [];
  const paymentIds = payments.map((payment) => payment.id);

  await prisma.paymentReconciliationAction.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.ownershipCapture.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.paymentWebhookEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { checkoutId: { in: sessionIds } } });
  await prisma.checkoutStatusToken.deleteMany({ where: { checkoutId: { in: sessionIds } } });
  await prisma.checkoutSession.deleteMany({ where: { companyId: { in: [fixture.companyId, fixture.secondCompanyId] } } });
  await prisma.takeoverQuote.deleteMany({
    where: { companyId: { in: [fixture.companyId, fixture.secondCompanyId] } },
  });
  await prisma.territory.deleteMany({ where: { id: fixture.territoryId } });
  await prisma.company.deleteMany({ where: { id: { in: [fixture.companyId, fixture.secondCompanyId] } } });
  await prisma.territoryCategory.deleteMany({ where: { id: fixture.categoryId } });
}

type DriverConstraintMeta = {
  driverAdapterError?: { cause?: { constraint?: { index?: string } } };
};

function knownError(error: unknown): Prisma.PrismaClientKnownRequestError {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  return error as Prisma.PrismaClientKnownRequestError;
}

function constraintIndex(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = error.meta as (DriverConstraintMeta & Record<string, unknown>) | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index;
}

/** Asserts a PostgreSQL unique violation backed by the named unique index. */
export function expectUniqueViolation(error: unknown, indexName: string): void {
  const known = knownError(error);
  expect(known.code).toBe('P2002');
  expect(constraintIndex(known)).toBe(indexName);
}

/** Asserts a PostgreSQL foreign-key violation backed by the named constraint. */
export function expectForeignKeyViolation(error: unknown, constraintName: string): void {
  const known = knownError(error);
  expect(known.code).toBe('P2003');
  expect(constraintIndex(known)).toBe(constraintName);
}

/** Asserts a PostgreSQL CHECK violation raised by the named constraint. */
export function expectCheckViolation(error: unknown, constraintName: string): void {
  const known = knownError(error);
  expect(known.code).toBe('P2039');
  const meta = known.meta as { driverAdapterError?: { cause?: { originalMessage?: string } } } | undefined;
  expect(meta?.driverAdapterError?.cause?.originalMessage).toContain(constraintName);
}

type RawQueryFailure = Prisma.PrismaClientKnownRequestError & {
  meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } };
};

/** Asserts a raw statement failed with the given PostgreSQL error code (e.g. 22P02). */
export function expectRawPostgresError(error: unknown, originalCode: string): void {
  const known = knownError(error) as RawQueryFailure;
  expect(known.code).toBe('P2010');
  expect(known.meta?.driverAdapterError?.cause?.originalCode).toBe(originalCode);
}
