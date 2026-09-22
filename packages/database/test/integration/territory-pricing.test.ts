import { TAKEOVER_BASE_PRICE_MINOR, TAKEOVER_CURRENCY } from '@takeover/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDatabase, getDatabaseClient } from '../../src/index.js';
import { applyTerritorySeed } from '../../src/territory-seed.js';
import { approvedTerritorySeed } from '../../src/territory-seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * The reviewed seed and the base-price migration against real PostgreSQL:
 * every seeded territory carries the MVP base price in USD, re-running changes
 * nothing, and a price an operator already configured is never overwritten.
 */

const prisma = getDatabaseClient() as PrismaClient;
const SEEDED_IDS = approvedTerritorySeed.territories.map((territory) => territory.id);

async function resetTerritories(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "territory_ownerships", "territories", "territory_categories" RESTART IDENTITY CASCADE`,
  );
}

beforeEach(resetTerritories);

afterAll(async () => {
  await resetTerritories();
  await disconnectDatabase();
});

describe('seeded territory pricing', () => {
  it('prices all 27 seeded territories at the base price in USD', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);

    const territories = await prisma.territory.findMany({ where: { id: { in: SEEDED_IDS } } });
    expect(territories).toHaveLength(27);
    for (const territory of territories) {
      expect(territory.minimumTakeoverAmountMinor).toBe(TAKEOVER_BASE_PRICE_MINOR);
      expect(territory.currency).toBe(TAKEOVER_CURRENCY);
    }
  });

  it('is idempotent: re-running changes no price and creates no rows', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);
    const before = await prisma.territory.findMany({
      orderBy: { id: 'asc' },
      select: { currency: true, id: true, minimumTakeoverAmountMinor: true, version: true },
    });

    await applyTerritorySeed(prisma, approvedTerritorySeed);
    await applyTerritorySeed(prisma, approvedTerritorySeed);

    const after = await prisma.territory.findMany({
      orderBy: { id: 'asc' },
      select: { currency: true, id: true, minimumTakeoverAmountMinor: true, version: true },
    });
    expect(after).toEqual(before);
    expect(await prisma.territory.count()).toBe(27);
  });

  it('never overwrites a price an operator or a capture already set', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);
    const [configured, raised] = SEEDED_IDS;
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 5_000n },
      where: { id: configured! },
    });
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 1_440n },
      where: { id: raised! },
    });

    await applyTerritorySeed(prisma, approvedTerritorySeed);

    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: configured! } }),
    ).resolves.toMatchObject({ minimumTakeoverAmountMinor: 5_000n });
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: raised! } }),
    ).resolves.toMatchObject({ minimumTakeoverAmountMinor: 1_440n });
  });

  it('fills a zero price left by an older seed run, in USD', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);
    const [target] = SEEDED_IDS;
    // Reproduces the pre-migration state: seeded rows with no price decided.
    await prisma.territory.update({
      data: { currency: 'EUR', minimumTakeoverAmountMinor: 0n },
      where: { id: target! },
    });

    await applyTerritorySeed(prisma, approvedTerritorySeed);

    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: target! } }),
    ).resolves.toMatchObject({
      currency: TAKEOVER_CURRENCY,
      minimumTakeoverAmountMinor: TAKEOVER_BASE_PRICE_MINOR,
    });
  });

  it('applies the committed base-price migration exactly as the seed does', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);
    const [zeroed, configured] = SEEDED_IDS;
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 0n },
      where: { id: zeroed! },
    });
    await prisma.territory.update({
      data: { minimumTakeoverAmountMinor: 7_500n },
      where: { id: configured! },
    });

    // The statement committed in 20260922140000_seeded_territory_base_price.
    await prisma.$executeRawUnsafe(`
      UPDATE "territories"
      SET "minimum_takeover_amount_minor" = 1000,
          "currency" = 'USD',
          "updated_at" = now()
      WHERE "minimum_takeover_amount_minor" = 0
        AND "id" >= '21000000-0000-4000-8000-000000000001'::uuid
        AND "id" <= '21000000-0000-4000-8000-000000000027'::uuid
    `);

    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: zeroed! } }),
    ).resolves.toMatchObject({ minimumTakeoverAmountMinor: 1_000n });
    await expect(
      prisma.territory.findUniqueOrThrow({ where: { id: configured! } }),
    ).resolves.toMatchObject({ minimumTakeoverAmountMinor: 7_500n });
  });

  it('creates no money, capture or ownership rows while seeding', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);

    expect(await prisma.takeoverQuote.count()).toBe(0);
    expect(await prisma.checkoutSession.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentReconciliationAction.count()).toBe(0);
    expect(await prisma.ownershipCapture.count()).toBe(0);
    expect(await prisma.territoryOwnership.count()).toBe(0);
    expect(await prisma.paymentWebhookEvent.count()).toBe(0);
  });
});
