import { randomUUID } from 'node:crypto';
import { applyTerritorySeed, approvedTerritorySeed, getDatabaseClient } from '@takeover/database';
import {
  companyPublicSummarySchema,
  companyTerritoriesSchema,
  territoryCategorySchema,
  territoryDetailSchema,
  territoryHistoryPageSchema,
  territoryPageSchema,
} from '@takeover/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { PrismaTerritoryRepository } from '../../src/modules/territories/prisma-repository.js';
import { TerritoryService } from '../../src/modules/territories/service.js';

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

async function createPublicCompany(input: {
  name: string;
  slug: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}): Promise<TestRow> {
  const company = await prisma.company.create({
    data: {
      logoUrl: `https://${input.slug}.example/logo.png`,
      name: input.name,
      normalizedName: input.name.toLowerCase(),
      normalizedWebsite: `https://${input.slug}.example/`,
      slug: input.slug,
      status: input.status ?? 'ACTIVE',
      websiteUrl: `https://${input.slug}.example/`,
    },
  });
  await prisma.companyVerification.create({
    data: {
      companyId: company.id,
      level: 'CONTACT_VERIFIED',
      source: 'integration-test',
      status: 'VERIFIED',
      verifiedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  return company;
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
  it('serves all six public read routes from real PostgreSQL data', async () => {
    await applyTerritorySeed(prisma, approvedTerritorySeed);
    const firstOwner = await createPublicCompany({ name: 'First Owner', slug: 'first-owner' });
    const currentOwner = await createPublicCompany({
      name: 'Current Owner',
      slug: 'current-owner',
      status: 'SUSPENDED',
    });
    const aiCoding = await prisma.territory.update({
      data: { version: 9_007_199_254_740_993n },
      where: { slug: 'ai-coding' },
    });
    const aiAgents = await prisma.territory.findUniqueOrThrow({ where: { slug: 'ai-agents' } });
    const payments = await prisma.territory.update({
      data: { availabilityStatus: 'DISABLED' },
      where: { slug: 'payments' },
    });

    for (const index of [0, 1, 2, 3, 4, 5]) {
      await prisma.territoryOwnership.create({
        data: {
          capturedAt: new Date(`2026-08-${20 + index}T00:00:00.000Z`),
          companyId: index === 5 ? currentOwner.id : firstOwner.id,
          endedAt: index === 5 ? null : new Date(`2026-08-${21 + index}T00:00:00.000Z`),
          source: index === 0 ? 'INITIAL_SEED' : 'PAID_CAPTURE',
          territoryId: aiCoding.id,
          territoryVersion: BigInt(index + 2),
        },
      });
    }
    await prisma.territoryOwnership.create({
      data: {
        capturedAt: new Date('2026-09-01T00:00:00.000Z'),
        companyId: currentOwner.id,
        source: 'INITIAL_SEED',
        territoryId: payments.id,
        territoryVersion: 2n,
      },
    });
    await prisma.territoryOwnership.create({
      data: {
        capturedAt: new Date('2026-09-02T00:00:00.000Z'),
        companyId: currentOwner.id,
        source: 'INITIAL_SEED',
        territoryId: aiAgents.id,
        territoryVersion: 2n,
      },
    });

    const app = buildApp({
      logger: false,
      nodeEnv: 'test',
      territories: { service: new TerritoryService(new PrismaTerritoryRepository(prisma)) },
    });
    await app.ready();
    try {
      const categories = await app.inject({ method: 'GET', url: '/api/territory-categories' });
      expect(categories.statusCode).toBe(200);
      const categoryEnvelope = JSON.parse(categories.body);
      expect(categoryEnvelope).not.toHaveProperty('meta');
      expect(territoryCategorySchema.array().parse(categoryEnvelope.data)).toHaveLength(
        approvedTerritorySeed.categories.length,
      );

      const territories = await app.inject({ method: 'GET', url: '/api/territories?limit=2' });
      expect(territories.statusCode).toBe(200);
      const territoryPage = territoryPageSchema.parse(JSON.parse(territories.body));
      expect(territoryPage.meta).toMatchObject({ requestId: expect.any(String), limit: 2 });
      expect(territoryPage.meta.nextCursor).toEqual(expect.any(String));
      expect(territoryPage.data).toHaveLength(2);

      const nextTerritories = await app.inject({
        method: 'GET',
        url: `/api/territories?limit=2&cursor=${territoryPage.meta.nextCursor}`,
      });
      expect(nextTerritories.statusCode).toBe(200);
      expect(territoryPageSchema.parse(JSON.parse(nextTerritories.body)).data).toHaveLength(2);

      const categoryFiltered = await app.inject({
        method: 'GET',
        url: '/api/territories?category=ai',
      });
      expect(categoryFiltered.statusCode).toBe(200);
      expect(
        territoryPageSchema
          .parse(JSON.parse(categoryFiltered.body))
          .data.every((territory) => territory.category.slug === 'ai'),
      ).toBe(true);

      const unknownCategory = await app.inject({
        method: 'GET',
        url: '/api/territories?category=unknown-category',
      });
      expect(unknownCategory.statusCode).toBe(404);
      expect(JSON.parse(unknownCategory.body).error.code).toBe('TERRITORY_CATEGORY_NOT_FOUND');

      const invalidCursor = await app.inject({
        method: 'GET',
        url: '/api/territories?cursor=not-a-cursor',
      });
      expect(invalidCursor.statusCode).toBe(400);
      expect(JSON.parse(invalidCursor.body).error.code).toBe('INVALID_CURSOR');

      const detail = await app.inject({ method: 'GET', url: '/api/territories/ai-coding' });
      expect(detail.statusCode).toBe(200);
      const detailEnvelope = JSON.parse(detail.body);
      expect(detailEnvelope).not.toHaveProperty('meta');
      const detailBody = territoryDetailSchema.parse(detailEnvelope.data);
      expect(detailBody.status).toBe('claimed');
      expect(detailBody.version).toBe('9007199254740993');
      expect(detailBody.currentOwnership?.owner).toMatchObject({
        slug: 'current-owner',
        status: 'suspended',
      });
      expect(detailBody.ownershipHistoryPreview).toHaveLength(5);
      expect(JSON.stringify(detailBody)).not.toContain('contactEmail');

      const missingTerritory = await app.inject({
        method: 'GET',
        url: '/api/territories/missing-territory',
      });
      expect(missingTerritory.statusCode).toBe(404);
      expect(JSON.parse(missingTerritory.body).error.code).toBe('TERRITORY_NOT_FOUND');

      const history = await app.inject({
        method: 'GET',
        url: '/api/territories/ai-coding/history?limit=2',
      });
      expect(history.statusCode).toBe(200);
      const historyPage = territoryHistoryPageSchema.parse(JSON.parse(history.body));
      expect(historyPage.meta).toMatchObject({ requestId: expect.any(String), limit: 2 });
      expect(historyPage.meta.nextCursor).toEqual(expect.any(String));
      expect(historyPage.data).toHaveLength(2);

      const company = await app.inject({ method: 'GET', url: '/api/companies/current-owner' });
      expect(company.statusCode).toBe(200);
      const companyEnvelope = JSON.parse(company.body);
      expect(companyEnvelope).not.toHaveProperty('meta');
      const publicCompany = companyPublicSummarySchema.parse(companyEnvelope.data);
      expect(publicCompany).toMatchObject({ slug: 'current-owner', status: 'suspended' });
      expect(JSON.stringify(publicCompany)).not.toContain('management');

      const missingCompany = await app.inject({ method: 'GET', url: '/api/companies/missing-co' });
      expect(missingCompany.statusCode).toBe(404);
      expect(JSON.parse(missingCompany.body).error.code).toBe('COMPANY_NOT_FOUND');

      const companyTerritories = await app.inject({
        method: 'GET',
        url: '/api/companies/current-owner/territories?limit=3',
      });
      expect(companyTerritories.statusCode).toBe(200);
      const holdingsEnvelope = JSON.parse(companyTerritories.body);
      expect(holdingsEnvelope).not.toHaveProperty('meta');
      const holdings = companyTerritoriesSchema.parse(holdingsEnvelope.data);
      expect(holdings.currentTerritoryCount).toBe(3);
      expect(holdings.territories).toHaveLength(3);
      expect(holdings.territories.map((territory) => territory.slug)).toContain('payments');
      expect(holdings.territories.find((territory) => territory.slug === 'payments')?.status).toBe(
        'disabled',
      );
      expect(JSON.stringify(holdings)).not.toContain('companyManagement');
    } finally {
      await app.close();
    }
  });

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
    const expiresAt = new Date('2030-09-01T00:00:00.000Z');

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
