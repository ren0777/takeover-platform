import { randomUUID } from 'node:crypto';
import { getDatabaseClient } from '@takeover/database';
import { beforeEach, describe, expect, it } from 'vitest';

const prisma = getDatabaseClient();

type TestRow = {
  id: string;
  territoryExternalRef?: string;
  territoryId?: string | null;
};

type TestCreateModel = {
  create(input: { data: Record<string, unknown> }): Promise<TestRow>;
  update(input: { data: Record<string, unknown>; where: { id: string } }): Promise<TestRow>;
};

type TerritoryPrismaClient = {
  territoryCategory: TestCreateModel;
  territory: TestCreateModel;
  territoryOwnership: TestCreateModel;
  takeoverIntent: TestCreateModel;
};

const territoryPrisma = prisma as unknown as TerritoryPrismaClient;

async function resetPhaseOneTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "territory_ownerships", "takeover_intents", "territories", "territory_categories",
    "security_rate_limit_buckets", "audit_logs", "email_verification_challenges",
    "company_management_sessions", "company_management_grants", "company_verifications",
    "company_access_requests", "company_contacts", "companies"
    RESTART IDENTITY CASCADE`);
}

async function createCompany(): Promise<TestRow> {
  const suffix = randomUUID();
  return prisma.company.create({
    data: {
      name: 'Territory Test Company',
      normalizedName: 'territory test company',
      normalizedWebsite: `https://${suffix}.example/`,
      status: 'ACTIVE',
      websiteUrl: `https://${suffix}.example/`,
    },
  });
}

async function createTerritory(): Promise<TestRow> {
  const suffix = randomUUID();
  const category = await territoryPrisma.territoryCategory.create({
    data: {
      displayOrder: 0,
      name: `Category ${suffix}`,
      slug: `category-${suffix}`,
    },
  });

  return territoryPrisma.territory.create({
    data: {
      categoryId: category.id,
      description: 'A territory used only for PostgreSQL invariant tests.',
      displayWeight: 50,
      name: `Territory ${suffix}`,
      slug: `territory-${suffix}`,
      visualMetadata: {},
    },
  });
}

beforeEach(resetPhaseOneTables);

describe('Phase 2 PostgreSQL territory migration invariants', () => {
  it('exposes the generated authoritative territory models', () => {
    expect(territoryPrisma.territoryCategory).toBeDefined();
    expect(territoryPrisma.territory).toBeDefined();
    expect(territoryPrisma.territoryOwnership).toBeDefined();
  });

  it('rejects duplicate slugs and display weights outside the shared 1..100 range', async () => {
    const category = await territoryPrisma.territoryCategory.create({
      data: { displayOrder: 0, name: 'Category', slug: 'duplicate-category' },
    });

    await expect(
      territoryPrisma.territoryCategory.create({
        data: { displayOrder: 1, name: 'Other category', slug: 'duplicate-category' },
      }),
    ).rejects.toThrow();

    await territoryPrisma.territory.create({
      data: {
        categoryId: category.id,
        description: 'A valid territory.',
        displayWeight: 1,
        name: 'Duplicate territory',
        slug: 'duplicate-territory',
        visualMetadata: {},
      },
    });

    await expect(
      territoryPrisma.territory.create({
        data: {
          categoryId: category.id,
          description: 'A duplicate territory.',
          displayWeight: 100,
          name: 'Other territory',
          slug: 'duplicate-territory',
          visualMetadata: {},
        },
      }),
    ).rejects.toThrow();

    await expect(
      territoryPrisma.territory.create({
        data: {
          categoryId: category.id,
          description: 'An invalid low-weight territory.',
          displayWeight: 0,
          name: 'Low weight territory',
          slug: 'low-weight-territory',
          visualMetadata: {},
        },
      }),
    ).rejects.toThrow();
    await expect(
      territoryPrisma.territory.create({
        data: {
          categoryId: category.id,
          description: 'An invalid high-weight territory.',
          displayWeight: 101,
          name: 'High weight territory',
          slug: 'high-weight-territory',
          visualMetadata: {},
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate active ownership and overlapping closed ownership timelines', async () => {
    const company = await createCompany();
    const activeTerritory = await createTerritory();
    const capturedAt = new Date('2026-08-30T00:00:00.000Z');

    await territoryPrisma.territoryOwnership.create({
      data: {
        capturedAt,
        companyId: company.id,
        source: 'INITIAL_SEED',
        territoryId: activeTerritory.id,
        territoryVersion: 1n,
      },
    });
    await expect(
      territoryPrisma.territoryOwnership.create({
        data: {
          capturedAt: new Date('2026-08-30T01:00:00.000Z'),
          companyId: company.id,
          source: 'PAID_CAPTURE',
          territoryId: activeTerritory.id,
          territoryVersion: 2n,
        },
      }),
    ).rejects.toThrow();

    const historicalTerritory = await createTerritory();
    await territoryPrisma.territoryOwnership.create({
      data: {
        capturedAt,
        companyId: company.id,
        endedAt: new Date('2026-08-30T02:00:00.000Z'),
        source: 'INITIAL_SEED',
        territoryId: historicalTerritory.id,
        territoryVersion: 1n,
      },
    });
    await expect(
      territoryPrisma.territoryOwnership.create({
        data: {
          capturedAt: new Date('2026-08-30T01:00:00.000Z'),
          companyId: company.id,
          endedAt: new Date('2026-08-30T03:00:00.000Z'),
          source: 'PAID_CAPTURE',
          territoryId: historicalTerritory.id,
          territoryVersion: 2n,
        },
      }),
    ).rejects.toThrow();

    const duplicateVersionTerritory = await createTerritory();
    await territoryPrisma.territoryOwnership.create({
      data: {
        capturedAt,
        companyId: company.id,
        endedAt: new Date('2026-08-30T01:00:00.000Z'),
        source: 'INITIAL_SEED',
        territoryId: duplicateVersionTerritory.id,
        territoryVersion: 1n,
      },
    });
    await expect(
      territoryPrisma.territoryOwnership.create({
        data: {
          capturedAt: new Date('2026-08-30T01:00:00.000Z'),
          companyId: company.id,
          endedAt: new Date('2026-08-30T02:00:00.000Z'),
          source: 'PAID_CAPTURE',
          territoryId: duplicateVersionTerritory.id,
          territoryVersion: 1n,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces PostgreSQL-only checks, btree_gist coverage, and one-way ownership history', async () => {
    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT "extname" FROM "pg_extension" WHERE "extname" = 'btree_gist'
    `;
    expect(extensions).toEqual([{ extname: 'btree_gist' }]);

    await expect(
      territoryPrisma.territoryCategory.create({
        data: { displayOrder: -1, name: 'Invalid order', slug: 'invalid-order' },
      }),
    ).rejects.toThrow();
    await expect(
      territoryPrisma.territoryCategory.create({
        data: { displayOrder: 0, name: 'Invalid slug', slug: 'Invalid Slug' },
      }),
    ).rejects.toThrow();

    const category = await territoryPrisma.territoryCategory.create({
      data: { displayOrder: 0, name: 'Valid category', slug: 'valid-category' },
    });
    const territoryData = {
      categoryId: category.id,
      description: 'A territory used to test PostgreSQL-only invariants.',
      displayWeight: 50,
      name: 'Invariant territory',
      slug: 'invariant-territory',
      visualMetadata: {},
    };
    await expect(
      territoryPrisma.territory.create({ data: { ...territoryData, slug: 'Invalid Slug' } }),
    ).rejects.toThrow();
    await expect(
      territoryPrisma.territory.create({ data: { ...territoryData, version: 0n } }),
    ).rejects.toThrow();
    await expect(
      territoryPrisma.territory.create({ data: { ...territoryData, visualMetadata: [] } }),
    ).rejects.toThrow();

    const territory = await territoryPrisma.territory.create({ data: territoryData });
    const company = await createCompany();
    const capturedAt = new Date('2026-08-30T00:00:00.000Z');
    await expect(
      territoryPrisma.territoryOwnership.create({
        data: {
          capturedAt,
          companyId: company.id,
          endedAt: capturedAt,
          source: 'INITIAL_SEED',
          territoryId: territory.id,
          territoryVersion: 1n,
        },
      }),
    ).rejects.toThrow();
    await expect(
      territoryPrisma.territoryOwnership.create({
        data: {
          capturedAt,
          companyId: company.id,
          source: 'INITIAL_SEED',
          territoryId: territory.id,
          territoryVersion: 0n,
        },
      }),
    ).rejects.toThrow();

    const ownership = await territoryPrisma.territoryOwnership.create({
      data: {
        capturedAt,
        companyId: company.id,
        source: 'INITIAL_SEED',
        territoryId: territory.id,
        territoryVersion: 1n,
      },
    });
    const otherCompany = await createCompany();
    const otherTerritory = await createTerritory();
    const immutableChanges: Array<Record<string, unknown>> = [
      { id: randomUUID() },
      { territoryId: otherTerritory.id },
      { companyId: otherCompany.id },
      { capturedAt: new Date('2026-08-30T00:30:00.000Z') },
      { source: 'PAID_CAPTURE' },
      { reason: 'history rewrite' },
      { territoryVersion: 2n },
      { createdAt: new Date('2026-08-29T00:00:00.000Z') },
    ];
    for (const data of immutableChanges) {
      await expect(
        territoryPrisma.territoryOwnership.update({ data, where: { id: ownership.id } }),
      ).rejects.toThrow('territory ownership history is immutable');
    }
    await expect(
      territoryPrisma.territoryOwnership.update({
        data: { endedAt: new Date('2026-08-30T01:00:00.000Z') },
        where: { id: ownership.id },
      }),
    ).resolves.toMatchObject({ id: ownership.id });
    await expect(
      territoryPrisma.territoryOwnership.update({
        data: { endedAt: new Date('2026-08-30T02:00:00.000Z') },
        where: { id: ownership.id },
      }),
    ).rejects.toThrow('invalid territory ownership end transition');
  });

  it('preserves Phase 1 external references while allowing only explicit nullable territory links', async () => {
    const company = await createCompany();
    const contact = await prisma.companyContact.create({
      data: {
        email: 'territory-intent@example.com',
        normalizedEmail: 'territory-intent@example.com',
      },
    });
    const territory = await createTerritory();
    const expiresAt = new Date('2026-09-01T00:00:00.000Z');

    const legacyIntent = await territoryPrisma.takeoverIntent.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt,
        territoryExternalRef: 'legacy-reference',
        territoryId: null,
      },
    });
    expect(legacyIntent).toMatchObject({
      territoryExternalRef: 'legacy-reference',
      territoryId: null,
    });

    const explicitlyLinkedIntent = await territoryPrisma.takeoverIntent.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        expiresAt,
        territoryExternalRef: 'still-reference-only',
        territoryId: territory.id,
      },
    });
    expect(explicitlyLinkedIntent).toMatchObject({
      territoryExternalRef: 'still-reference-only',
      territoryId: territory.id,
    });
  });
});
