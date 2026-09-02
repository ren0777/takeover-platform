import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDatabase, getDatabaseClient } from '../src/index.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  createPhase3Fixture,
  deletePhase3Fixture,
  expectForeignKeyViolation,
  expectRawPostgresError,
  expectUniqueViolation,
  type Phase3Fixture,
} from './helpers/phase3.js';

/**
 * Phase 3 `PaymentWebhookEvent`, `OwnershipCapture`, and
 * `PaymentReconciliationAction` database invariants against real PostgreSQL.
 *
 * Every assertion targets the concrete PostgreSQL failure (unique index,
 * foreign-key constraint, enum rejection, NOT NULL) or the persisted rows.
 * The webhook ledger's ON DELETE SET NULL behaviour is verified explicitly
 * because it is what keeps the raw event record after a payment row is gone.
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

async function createPaidCheckout(
  fixture: Phase3Fixture,
): Promise<{ checkoutId: string; paymentId: string }> {
  const now = new Date('2026-09-03T12:00:00.000Z');
  const quote = await prisma.takeoverQuote.create({
    data: {
      territoryId: fixture.territoryId,
      companyId: fixture.companyId,
      territoryVersion: 1n,
      currency: 'USD',
      minimumAmountMinor: 1000n,
      status: 'ACTIVE',
      expiresAt: new Date(now.getTime() + 300_000),
      observedAt: now,
    },
  });
  const session = await prisma.checkoutSession.create({
    data: {
      quoteId: quote.id,
      companyId: fixture.companyId,
      provider: 'DODO',
      providerCheckoutId: `chk-${randomUUID()}`,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      checkoutId: session.id,
      provider: 'DODO',
      providerPaymentId: `pay-${randomUUID()}`,
      amountMinor: 1000n,
      currency: 'USD',
      status: 'PENDING',
    },
  });
  return { checkoutId: session.id, paymentId: payment.id };
}

describe('Phase 3 payment webhook event invariants', () => {
  it('rejects a duplicate provider event id for the same provider', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const providerEventId = `evt-${randomUUID()}`;
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: 'DODO',
        providerEventId,
        signatureDigest: Buffer.from(`sig-${randomUUID()}`),
        payload: { kind: 'payment.succeeded' },
        paymentId,
      },
    });
    const error = await prisma.paymentWebhookEvent
      .create({
        data: {
          provider: 'DODO',
          providerEventId,
          signatureDigest: Buffer.from(`sig-${randomUUID()}`),
          payload: { kind: 'payment.succeeded' },
          paymentId,
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'uq_webhook_event');
  });

  it('allows the same provider event id under a different provider', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const providerEventId = `evt-${randomUUID()}`;
    const webhook = { providerEventId, payload: { kind: 'payment.succeeded' } as object };
    await prisma.paymentWebhookEvent.create({
      data: { ...webhook, provider: 'DODO', signatureDigest: Buffer.from(`sig-${randomUUID()}`), paymentId },
    });
    const other = await prisma.paymentWebhookEvent.create({
      data: { ...webhook, provider: 'OTHER', signatureDigest: Buffer.from(`sig-${randomUUID()}`) },
    });

    expect(other.provider).toBe('OTHER');
    expect(await prisma.paymentWebhookEvent.count({ where: { providerEventId } })).toBe(2);
  });

  it('rejects a webhook event without the raw payload', async () => {
    const fixture = currentFixture();
    await createPaidCheckout(fixture);
    const error = await prisma
      .$executeRawUnsafe(
        `INSERT INTO payment_webhook_events (provider, provider_event_id, signature_digest, payload)
         VALUES ('DODO', 'evt-${randomUUID()}', convert_to('sig', 'UTF8'), NULL)`,
      )
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectRawPostgresError(error, '23502');
  });

  it('defaults processing status to PENDING and round trips processing values', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const created = await prisma.paymentWebhookEvent.create({
      data: {
        provider: 'DODO',
        providerEventId: `evt-${randomUUID()}`,
        signatureDigest: Buffer.from(`sig-${randomUUID()}`),
        payload: { kind: 'payment.succeeded' },
        paymentId,
      },
    });
    expect(created.processingStatus).toBe('PENDING');

    for (const processingStatus of ['PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED']) {
      const updated = await prisma.paymentWebhookEvent.update({
        where: { id: created.id },
        data: { processingStatus },
      });
      expect(updated.processingStatus).toBe(processingStatus);
    }
  });

  it('rejects a webhook referencing a missing payment with the named foreign key', async () => {
    const error = await prisma.paymentWebhookEvent
      .create({
        data: {
          provider: 'DODO',
          providerEventId: `evt-${randomUUID()}`,
          signatureDigest: Buffer.from(`sig-${randomUUID()}`),
          payload: { kind: 'payment.succeeded' },
          paymentId: '00000000-0000-4000-8000-000000000000',
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'PaymentWebhookEvent_payment_id_fkey');
  });

  it('keeps the ledger row with a null payment reference when the payment is deleted', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const webhook = await prisma.paymentWebhookEvent.create({
      data: {
        provider: 'DODO',
        providerEventId: `evt-${randomUUID()}`,
        signatureDigest: Buffer.from(`sig-${randomUUID()}`),
        payload: { kind: 'payment.succeeded' },
        paymentId,
      },
    });
    await prisma.payment.delete({ where: { id: paymentId } });

    const stored = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: webhook.id } });
    expect(stored.paymentId).toBeNull();
  });
});

describe('Phase 3 ownership capture invariants', () => {
  it('rejects a second capture for the same payment', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const captureData = {
      paymentId,
      territoryId: fixture.territoryId,
      newOwnerCompanyId: fixture.companyId,
      expectedTerritoryVersion: 1n,
    };
    await prisma.ownershipCapture.create({ data: captureData });
    const error = await prisma.ownershipCapture
      .create({ data: captureData })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'uq_ownership_capture_payment');
  });

  it('rejects a capture referencing a missing payment with the named foreign key', async () => {
    const fixture = currentFixture();
    const error = await prisma.ownershipCapture
      .create({
        data: {
          paymentId: '00000000-0000-4000-8000-000000000000',
          territoryId: fixture.territoryId,
          newOwnerCompanyId: fixture.companyId,
          expectedTerritoryVersion: 1n,
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'OwnershipCapture_payment_id_fkey');
  });

  it('rejects a capture referencing a missing territory with the named foreign key', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const error = await prisma.ownershipCapture
      .create({
        data: {
          paymentId,
          territoryId: '00000000-0000-4000-8000-000000000000',
          newOwnerCompanyId: fixture.companyId,
          expectedTerritoryVersion: 1n,
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'OwnershipCapture_territory_id_fkey');
  });

  it('rejects a capture referencing a missing owner company with the named foreign key', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const error = await prisma.ownershipCapture
      .create({
        data: {
          paymentId,
          territoryId: fixture.territoryId,
          newOwnerCompanyId: '00000000-0000-4000-8000-000000000000',
          expectedTerritoryVersion: 1n,
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'OwnershipCapture_new_owner_company_id_fkey');
  });

  it('round trips every committed capture status and rejects unknown values', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const capture = await prisma.ownershipCapture.create({
      data: {
        paymentId,
        territoryId: fixture.territoryId,
        newOwnerCompanyId: fixture.companyId,
        expectedTerritoryVersion: 1n,
      },
    });
    expect(capture.status).toBe('PENDING');

    for (const status of ['COMPLETED', 'FAILED', 'REFUNDED'] as const) {
      const updated = await prisma.ownershipCapture.update({
        where: { id: capture.id },
        data: { status },
      });
      expect(updated.status).toBe(status);
    }

    const error = await prisma
      .$executeRawUnsafe(
        `UPDATE ownership_captures SET status = 'CAPTURED'::"OwnershipCaptureStatus" WHERE id = '${capture.id}'`,
      )
      .then(() => null)
      .catch((caught: unknown) => caught);
    expectRawPostgresError(error, '22P02');
  });
});

describe('Phase 3 payment reconciliation action invariants', () => {
  it('rejects a duplicate action for the same payment with the named unique constraint', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    const actionData = {
      paymentId,
      action: 'REFUND',
      requestedByActorType: 'SYSTEM',
      reason: 'capture cannot complete',
    };
    await prisma.paymentReconciliationAction.create({ data: actionData });
    const error = await prisma.paymentReconciliationAction
      .create({ data: actionData })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectUniqueViolation(error, 'uq_reconciliation_action');
  });

  it('allows different actions for the same payment', async () => {
    const fixture = currentFixture();
    const { paymentId } = await createPaidCheckout(fixture);
    await prisma.paymentReconciliationAction.create({
      data: { paymentId, action: 'REFUND', requestedByActorType: 'SYSTEM' },
    });
    const markFailed = await prisma.paymentReconciliationAction.create({
      data: { paymentId, action: 'MARK_FAILED', requestedByActorType: 'SYSTEM' },
    });

    expect(markFailed.action).toBe('MARK_FAILED');
    expect(await prisma.paymentReconciliationAction.count({ where: { paymentId } })).toBe(2);
  });

  it('rejects a reconciliation action referencing a missing payment with the named foreign key', async () => {
    const error = await prisma.paymentReconciliationAction
      .create({
        data: {
          paymentId: '00000000-0000-4000-8000-000000000000',
          action: 'REFUND',
          requestedByActorType: 'SYSTEM',
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expectForeignKeyViolation(error, 'PaymentReconciliationAction_payment_id_fkey');
  });
});
