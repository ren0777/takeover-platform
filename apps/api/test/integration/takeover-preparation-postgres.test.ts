import { randomUUID } from 'node:crypto';
import { getDatabaseClient, type Prisma } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaCompanyIdentityRepository } from '../../src/modules/company-identity/prisma-repository.js';

/**
 * Takeover preparation against real PostgreSQL.
 *
 * These are the invariants the browser flow relies on but cannot see: one
 * ready intent per company and contact under concurrency, restart and cancel
 * converging on a single row, the verification exchange superseding an older
 * preparation, and every mutation refusing another company's session.
 */

const prisma = getDatabaseClient();
const repository = new PrismaCompanyIdentityRepository(prisma);

const CATEGORY_ID = '20000000-0000-4000-8000-000000000099';
const soon = () => new Date(Date.now() + 3_600_000);
const now = () => new Date();

async function resetTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "takeover_intents", "company_contacts", "companies",
    "territory_ownerships"
    RESTART IDENTITY CASCADE`);
  await prisma.territory.deleteMany({ where: { categoryId: CATEGORY_ID } });
  await prisma.territoryCategory.deleteMany({ where: { id: CATEGORY_ID } });
  await prisma.territoryCategory.create({
    data: { displayOrder: 999, id: CATEGORY_ID, name: 'Prep Fixtures', slug: 'prep-fixtures' },
  });
}

async function createTerritory(slug: string, availability: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
  return prisma.territory.create({
    data: {
      availabilityStatus: availability,
      categoryId: CATEGORY_ID,
      currency: 'USD',
      description: `${slug} fixture`,
      displayWeight: 50,
      minimumTakeoverAmountMinor: 25_000n,
      name: slug,
      slug,
    },
  });
}

/** A verified contact with an active grant and live session on a draft company. */
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

function startInput(managed: Awaited<ReturnType<typeof createManagedCompany>>, slug: string) {
  return {
    companyId: managed.company.id,
    contactId: managed.contact.id,
    expiresAt: soon(),
    now: now(),
    requestId: `req-${slug}`,
    sessionId: managed.session.id,
    territoryExternalRef: slug,
  };
}

async function readyIntents(companyId: string, contactId: string) {
  return prisma.takeoverIntent.findMany({
    where: { companyId, contactId, status: 'IDENTITY_READY' },
  });
}

beforeEach(resetTables);

describe('takeover preparation PostgreSQL invariants', () => {
  it('creates exactly one ready intent when many identical starts race', async () => {
    const managed = await createManagedCompany('race');
    await createTerritory('race-territory');

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        repository.startTakeoverPreparation(startInput(managed, 'race-territory')),
      ),
    );

    const ready = results.filter((result) => result.kind === 'ready');
    expect(ready).toHaveLength(6);
    expect(ready.filter((result) => result.kind === 'ready' && result.created)).toHaveLength(1);
    const ids = new Set(ready.map((result) => (result.kind === 'ready' ? result.intent.id : '')));
    expect(ids.size).toBe(1);
    expect(await readyIntents(managed.company.id, managed.contact.id)).toHaveLength(1);
    expect(await prisma.takeoverIntent.count()).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'takeover_intent.preparation_started' } }),
    ).toBe(1);
  });

  it('restarts onto a different territory by cancelling the previous preparation', async () => {
    const managed = await createManagedCompany('restart');
    const first = await createTerritory('restart-first');
    const second = await createTerritory('restart-second');

    const started = await repository.startTakeoverPreparation(startInput(managed, first.slug));
    const repeated = await repository.startTakeoverPreparation(startInput(managed, first.slug));
    const moved = await repository.startTakeoverPreparation(startInput(managed, second.slug));

    if (started.kind !== 'ready' || repeated.kind !== 'ready' || moved.kind !== 'ready') {
      throw new Error('expected ready preparations');
    }
    expect(repeated.created).toBe(false);
    expect(repeated.intent.id).toBe(started.intent.id);
    expect(moved.created).toBe(true);
    expect(moved.intent.id).not.toBe(started.intent.id);
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: moved.intent.id } }),
    ).resolves.toMatchObject({ status: 'IDENTITY_READY', territoryId: second.id });
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: started.intent.id } }),
    ).resolves.toMatchObject({ status: 'CANCELLED', territoryId: first.id });
    expect(await readyIntents(managed.company.id, managed.contact.id)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'takeover_intent.superseded' } })).toBe(
      1,
    );
  });

  it('is backed by a partial unique index that rejects a second ready intent per contact', async () => {
    const managed = await createManagedCompany('index');
    await createTerritory('index-territory');
    await repository.startTakeoverPreparation(startInput(managed, 'index-territory'));

    await expect(
      prisma.takeoverIntent.create({
        data: {
          companyId: managed.company.id,
          contactId: managed.contact.id,
          expiresAt: soon(),
          status: 'IDENTITY_READY',
          territoryExternalRef: 'index-territory',
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
    // Terminal rows are outside the invariant, so history is never blocked.
    await expect(
      prisma.takeoverIntent.create({
        data: {
          companyId: managed.company.id,
          contactId: managed.contact.id,
          expiresAt: soon(),
          status: 'CANCELLED',
          territoryExternalRef: 'index-territory',
        },
      }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('lets a newer verified claim supersede the earlier preparation instead of failing', async () => {
    await createTerritory('supersede-a');
    await createTerritory('supersede-b');
    const exchange = (selector: string, digestByte: number) =>
      repository.consumeContactVerification({
        accessRequestExpiresAt: soon(),
        candidateDigest: new Uint8Array(32).fill(digestByte),
        csrfDigest: new Uint8Array(32).fill(digestByte + 1),
        maxFailedAttempts: 10,
        now: now(),
        selector,
        sessionExpiresAt: soon(),
        sessionTokenDigest: new Uint8Array(32).fill(digestByte + 2),
      });

    const first = await repository.beginCompanyClaim({
      challenge: {
        expiresAt: soon(),
        selector: 'supersede-1',
        tokenDigest: new Uint8Array(32).fill(10),
      },
      company: {
        expiresAt: soon(),
        name: 'Supersede',
        normalizedName: 'supersede',
        normalizedWebsite: 'https://supersede.example/',
        websiteUrl: 'https://supersede.example/',
      },
      contact: { email: 'supersede@gmail.com', normalizedEmail: 'supersede@gmail.com' },
      intent: { expiresAt: soon(), territoryExternalRef: 'supersede-a' },
      now: now(),
    });
    await repository.markChallengeDelivery(first.challenge.id, 'SENT');
    expect((await exchange('supersede-1', 10)).kind).toBe('management_session');
    const firstIntentId = first.intent.id;
    // The claim linked the reference to the real territory row.
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: firstIntentId } }),
    ).resolves.toMatchObject({ status: 'IDENTITY_READY', territoryId: expect.any(String) });

    // A later claim on the same company by the same contact: a fresh awaiting
    // intent and a fresh delivered challenge, as the claim route would store.
    const second = await prisma.takeoverIntent.create({
      data: {
        companyId: first.company.id,
        contactId: first.contact.id,
        expiresAt: soon(),
        territoryExternalRef: 'supersede-b',
      },
    });
    await prisma.emailVerificationChallenge.create({
      data: {
        companyId: first.company.id,
        contactId: first.contact.id,
        deliveryStatus: 'SENT',
        expiresAt: soon(),
        purpose: 'CONTACT_VERIFICATION',
        selector: 'supersede-2',
        tokenDigest: Buffer.alloc(32, 20),
      },
    });
    expect((await exchange('supersede-2', 20)).kind).toBe('management_session');
    const secondIntentId = second.id;

    // The consumed link is dead: replaying it changes nothing.
    expect((await exchange('supersede-2', 20)).kind).toBe('invalid');
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: firstIntentId } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: secondIntentId } }),
    ).resolves.toMatchObject({ status: 'IDENTITY_READY', territoryExternalRef: 'supersede-b' });
    const intent = await prisma.takeoverIntent.findUniqueOrThrow({ where: { id: secondIntentId } });
    const view = await repository.getTakeoverPreparation({
      companyId: intent.companyId,
      contactId: intent.contactId,
      now: now(),
    });
    expect(view.intent?.id).toBe(secondIntentId);
    expect(view.territory?.slug).toBe('supersede-b');
  });

  it('cancels idempotently, refuses another company, and allows a fresh start afterwards', async () => {
    const owner = await createManagedCompany('owner');
    const stranger = await createManagedCompany('stranger');
    await createTerritory('cancel-territory');
    const started = await repository.startTakeoverPreparation(
      startInput(owner, 'cancel-territory'),
    );
    if (started.kind !== 'ready') throw new Error('expected ready preparation');
    const cancelInput = (managed: typeof owner) => ({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      intentId: started.intent.id,
      now: now(),
      requestId: 'req-cancel',
      sessionId: managed.session.id,
    });

    await expect(repository.cancelTakeoverIntent(cancelInput(stranger))).resolves.toBeNull();
    await expect(
      prisma.takeoverIntent.findUniqueOrThrow({ where: { id: started.intent.id } }),
    ).resolves.toMatchObject({ status: 'IDENTITY_READY' });

    const cancelled = await repository.cancelTakeoverIntent(cancelInput(owner));
    const again = await repository.cancelTakeoverIntent(cancelInput(owner));
    expect(cancelled?.intent?.status).toBe('CANCELLED');
    expect(again?.intent?.status).toBe('CANCELLED');
    expect(await prisma.auditLog.count({ where: { action: 'takeover_intent.cancelled' } })).toBe(1);
    await expect(
      repository.getTakeoverPreparation({
        companyId: owner.company.id,
        contactId: owner.contact.id,
        now: now(),
      }),
    ).resolves.toEqual({ intent: null, territory: null });

    const restarted = await repository.startTakeoverPreparation(
      startInput(owner, 'cancel-territory'),
    );
    expect(restarted.kind === 'ready' && restarted.created).toBe(true);
    expect(await readyIntents(owner.company.id, owner.contact.id)).toHaveLength(1);
  });

  it('refuses missing and disabled territories and revoked or foreign sessions', async () => {
    const managed = await createManagedCompany('refuse');
    const other = await createManagedCompany('refuse-other');
    await createTerritory('refuse-disabled', 'DISABLED');
    await createTerritory('refuse-active');

    await expect(
      repository.startTakeoverPreparation(startInput(managed, 'does-not-exist')),
    ).resolves.toEqual({ kind: 'territory_missing' });
    await expect(
      repository.startTakeoverPreparation(startInput(managed, 'refuse-disabled')),
    ).resolves.toEqual({ kind: 'territory_disabled' });
    // A session that belongs to another company cannot prepare for this one.
    await expect(
      repository.startTakeoverPreparation({
        ...startInput(managed, 'refuse-active'),
        sessionId: other.session.id,
      }),
    ).resolves.toEqual({ kind: 'unauthorized' });
    await prisma.companyManagementSession.update({
      where: { id: managed.session.id },
      data: { revokedAt: now() },
    });
    await expect(
      repository.startTakeoverPreparation(startInput(managed, 'refuse-active')),
    ).resolves.toEqual({ kind: 'unauthorized' });
    expect(await prisma.takeoverIntent.count()).toBe(0);
  });

  it('projects a territory claimed since preparation began, and hides expired intents', async () => {
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
    const territory = await createTerritory('claimed-territory');
    const started = await repository.startTakeoverPreparation(
      startInput(managed, 'claimed-territory'),
    );
    if (started.kind !== 'ready') throw new Error('expected ready preparation');
    expect(started.territory?.currentOwner).toBeNull();

    await prisma.territoryOwnership.create({
      data: {
        capturedAt: now(),
        companyId: rival.id,
        source: 'INITIAL_SEED',
        territoryId: territory.id,
        territoryVersion: 1n,
      },
    });
    const claimed = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: now(),
    });
    expect(claimed.territory?.currentOwner).toEqual({ name: 'Rival', slug: 'rival' });
    expect(claimed.territory?.minimumTakeoverAmountMinor).toBe(25_000n);

    const expired = await repository.getTakeoverPreparation({
      companyId: managed.company.id,
      contactId: managed.contact.id,
      now: new Date(Date.now() + 7_200_000),
    });
    expect(expired).toEqual({ intent: null, territory: null });
  });
});
