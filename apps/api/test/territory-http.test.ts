import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  CompanyTerritoriesResult,
  TerritoryHistoryResult,
  TerritoryListResult,
} from '../src/modules/territories/service.js';
import type { TerritoryService } from '../src/modules/territories/service.js';
import type {
  CompanyPublicSummary,
  TerritoryCategory,
  TerritoryDetail,
  TerritoryHistoryEntry,
  TerritoryOwnershipSummary,
  TerritorySummary,
  TerritoryVisualMetadata,
} from '@takeover/shared';

const VALID_TERRITORY_SLUG = 'ai-coding';
const VALID_COMPANY_SLUG = 'acme-corp';
const VALID_CATEGORY_SLUG = 'ai';

const category: TerritoryCategory = {
  description: 'Products building with artificial intelligence.',
  id: '20000000-0000-4000-8000-000000000001',
  name: 'AI',
  slug: VALID_CATEGORY_SLUG,
};

const activeOwner: CompanyPublicSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Current Owner Ltd',
  slug: VALID_COMPANY_SLUG,
  status: 'active',
  verificationLevels: ['contact_verified'],
  websiteUrl: 'https://current-owner.example',
};

const suspendedOwner: CompanyPublicSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Previous Owner Inc',
  slug: 'previous-owner',
  status: 'suspended',
  verificationLevels: [],
  websiteUrl: 'https://previous.example',
};

const activeOwnership: TerritoryOwnershipSummary = {
  capturedAt: '2026-08-30T12:00:00.000Z',
  id: '44444444-4444-4444-8444-444444444444',
  owner: activeOwner,
  source: 'paid_capture',
  territoryVersion: '7',
};

const visualMetadata: TerritoryVisualMetadata = {
  accentColor: '#A78BFA',
  iconKey: 'code-2',
};

const territory: TerritorySummary = {
  category,
  createdAt: '2026-08-28T12:00:00.000Z',
  currentOwnership: activeOwnership,
  description: 'AI-assisted software creation.',
  displayWeight: 100,
  id: '21000000-0000-4000-8000-000000000001',
  name: 'AI Coding',
  slug: VALID_TERRITORY_SLUG,
  status: 'claimed',
  updatedAt: '2026-08-30T12:00:00.000Z',
  version: '7',
  visualMetadata,
};

const historyEntry: TerritoryHistoryEntry = {
  capturedAt: '2026-08-30T12:00:00.000Z',
  id: '44444444-4444-4444-8444-444444444444',
  owner: activeOwner,
  source: 'paid_capture',
  territoryVersion: '7',
};

const suspendedHistoryEntry: TerritoryHistoryEntry = {
  capturedAt: '2026-08-20T12:00:00.000Z',
  endedAt: '2026-08-30T11:59:59.999Z',
  id: '44444444-4444-4444-8444-000000000001',
  owner: suspendedOwner,
  source: 'paid_capture',
  territoryVersion: '6',
};

const territoryDetail: TerritoryDetail = {
  ...territory,
  ownershipHistoryPreview: [historyEntry, suspendedHistoryEntry],
};

const acmeCompany: CompanyPublicSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Acme Corp',
  slug: VALID_COMPANY_SLUG,
  status: 'active',
  verificationLevels: ['contact_verified'],
  websiteUrl: 'https://acme.example',
};

function createTerritoryService(): TerritoryService {
  return {
    listCategories: vi.fn(async () => [category]),
    listTerritories: vi.fn(async (): Promise<TerritoryListResult> => ({
      items: [territory],
      limit: 50,
    })),
    getTerritory: vi.fn(async (slug: string) => {
      if (
        slug === 'nonexistent' ||
        slug === 'nonexistent-slug' ||
        slug === 'totally-unknown' ||
        slug === 'unknown'
      ) {
        const err = Object.assign(new Error('Territory was not found'), {
          code: 'TERRITORY_NOT_FOUND',
          statusCode: 404,
        });
        throw err;
      }
      return territoryDetail;
    }),
    listTerritoryHistory: vi.fn(async (): Promise<TerritoryHistoryResult> => ({
      items: [historyEntry],
      limit: 50,
    })),
    getCompany: vi.fn(async (slug: string) => {
      if (slug === 'nonexistent-company' || slug === 'unknown-company') {
        const err = Object.assign(new Error('Company was not found'), {
          code: 'COMPANY_NOT_FOUND',
          statusCode: 404,
        });
        throw err;
      }
      return acmeCompany;
    }),
    listCompanyTerritories: vi.fn(async (): Promise<CompanyTerritoriesResult> => ({
      company: acmeCompany,
      currentTerritoryCount: 1,
      territories: [territory],
      limit: 50,
    })),
  } as unknown as TerritoryService;
}

describe('Territory public read API routes', () => {
  it('GET /api/territory-categories returns an unpaginated data envelope', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territory-categories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({ slug: VALID_CATEGORY_SLUG, name: 'AI' });
    expect(body).not.toHaveProperty('meta');
  });

  it('GET /api/territories returns a paginated territory list with meta', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body.meta.limit).toBe(50);
    expect(body.meta.requestId).toBeDefined();
    expect(body.data[0]).toMatchObject({
      slug: VALID_TERRITORY_SLUG,
      status: 'claimed',
      displayWeight: 100,
    });
    expect(body.data[0].currentOwnership).toBeDefined();
    expect(body.data[0].currentOwnership.owner).toMatchObject({
      slug: VALID_COMPANY_SLUG,
      status: 'active',
    });
    // Privacy: no management fields
    expect(body.data[0].currentOwnership.owner).not.toHaveProperty('contactEmail');
    expect(body.data[0].currentOwnership.owner).not.toHaveProperty('managementGrants');
  });

  it('GET /api/territories supports category filter', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories?category=${VALID_CATEGORY_SLUG}`,
    });

    expect(response.statusCode).toBe(200);
    expect(service.listTerritories).toHaveBeenCalledWith(
      expect.objectContaining({ category: VALID_CATEGORY_SLUG }),
    );
  });

  it('GET /api/territories returns 404 TERRITORY_CATEGORY_NOT_FOUND for unknown category filter', async () => {
    const service = createTerritoryService();
    (service.listTerritories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Territory category was not found'), {
        code: 'TERRITORY_CATEGORY_NOT_FOUND',
        statusCode: 404,
      }),
    );
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/territories?category=unknown-category',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('TERRITORY_CATEGORY_NOT_FOUND');
  });

  it('GET /api/territories supports status filter (unclaimed, claimed, disabled)', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });

    for (const status of ['unclaimed', 'claimed', 'disabled'] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/territories?status=${status}`,
      });
      expect(response.statusCode).toBe(200);
      expect(service.listTerritories).toHaveBeenCalledWith(expect.objectContaining({ status }));
    }
  });

  it('GET /api/territories supports cursor pagination and returns nextCursor in meta', async () => {
    const service = createTerritoryService();
    const nextCursor = Buffer.from(
      JSON.stringify({
        displayWeight: 100,
        id: territory.id,
        k: 'territory',
        name: territory.name,
        v: 1,
      }),
    ).toString('base64url');
    (service.listTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [],
      limit: 50,
      nextCursor,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.meta.nextCursor).toBe(nextCursor);
  });

  it('GET /api/territories rejects an invalid cursor with 400 INVALID_CURSOR', async () => {
    const service = createTerritoryService();
    const InvalidTerritoryCursorError = Object.assign(
      new Error('The pagination cursor is invalid'),
      {
        code: 'INVALID_CURSOR',
        statusCode: 400,
      },
    );
    (service.listTerritories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      InvalidTerritoryCursorError,
    );
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories?cursor=${Buffer.from('not-valid-payload').toString('base64url')}`,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('INVALID_CURSOR');
  });

  it('GET /api/territories rejects limit above 100 with 400', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories?limit=200' });

    expect(response.statusCode).toBe(400);
  });

  it.each(['0', '-5'])(
    'GET /api/territories rejects a %s limit below the 1..100 range with 400',
    async (limit) => {
      const service = createTerritoryService();
      const app = buildApp({ territories: { service } });
      const response = await app.inject({
        method: 'GET',
        url: `/api/territories?limit=${limit}`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('GET /api/territories/:slug returns territory detail with ownershipHistoryPreview', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories/${VALID_TERRITORY_SLUG}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.slug).toBe(VALID_TERRITORY_SLUG);
    expect(body.data).toHaveProperty('ownershipHistoryPreview');
    expect(Array.isArray(body.data.ownershipHistoryPreview)).toBe(true);
    expect(body.data.ownershipHistoryPreview.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/territories/:slug validates slug path input', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/territories/Bad%20Slug',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(service.getTerritory).not.toHaveBeenCalled();
  });

  it('GET /api/territories/:slug includes exactly 5 history-preview rows (max)', async () => {
    const service = createTerritoryService();
    const fiveEntryPreview = Array.from({ length: 5 }, (_, i) => ({
      capturedAt: new Date(`2026-08-${20 + i}T12:00:00.000Z`).toISOString(),
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      owner: {
        ...activeOwner,
        id: `00000000-0000-4000-8000-00000000001${i + 1}`,
        slug: `owner-${i + 1}`,
      },
      source: 'paid_capture' as const,
      territoryVersion: String(10 - i),
    }));
    (service.getTerritory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...territory,
      ownershipHistoryPreview: fiveEntryPreview,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories/${VALID_TERRITORY_SLUG}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.ownershipHistoryPreview).toHaveLength(5);
  });

  it('GET /api/territories/:slug â€” suspended owner remains truthfully visible', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories/${VALID_TERRITORY_SLUG}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const suspendedEntry = body.data.ownershipHistoryPreview.find(
      (e: { owner: { status: string } }) => e.owner.status === 'suspended',
    );
    expect(suspendedEntry?.owner.name).toBe('Previous Owner Inc');
    expect(suspendedEntry?.owner.status).toBe('suspended');
  });

  it('GET /api/territories/:slug returns 404 TERRITORY_NOT_FOUND for unknown slug', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/territories/totally-unknown',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('TERRITORY_NOT_FOUND');
    expect(body.error.message).toBe('Territory was not found');
    expect(body.error.requestId).toBeDefined();
  });

  it('GET /api/territories/:slug/history returns paginated history with meta', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories/${VALID_TERRITORY_SLUG}/history`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.limit).toBe(50);
    expect(body.meta.requestId).toBeDefined();
    expect(body.data[0]).toHaveProperty('owner');
    expect(body.data[0].owner).not.toHaveProperty('contactEmail');
  });

  it('GET /api/territories/:slug/history returns 404 for unknown territory', async () => {
    const service = createTerritoryService();
    (service.listTerritoryHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Territory was not found'), {
        code: 'TERRITORY_NOT_FOUND',
        statusCode: 404,
      }),
    );
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/territories/unknown/history',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('TERRITORY_NOT_FOUND');
  });

  it('GET /api/territories/:slug/history supports cursor pagination with nextCursor', async () => {
    const service = createTerritoryService();
    const nextCursor = Buffer.from(
      JSON.stringify({
        capturedAt: historyEntry.capturedAt,
        id: historyEntry.id,
        k: 'history',
        v: 1,
      }),
    ).toString('base64url');
    (service.listTerritoryHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [historyEntry],
      limit: 50,
      nextCursor,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/territories/${VALID_TERRITORY_SLUG}/history`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.meta.nextCursor).toBe(nextCursor);
  });

  it('GET /api/companies/:slug returns privacy-safe public company projection', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/companies/${VALID_COMPANY_SLUG}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toMatchObject({ slug: VALID_COMPANY_SLUG, status: 'active' });
    expect(body.data).not.toHaveProperty('contactEmail');
    expect(body.data).not.toHaveProperty('managementGrants');
    expect(body.data).not.toHaveProperty('managementSessions');
    expect(body.data).not.toHaveProperty('accessRequests');
  });

  it('GET /api/companies/:slug returns 404 COMPANY_NOT_FOUND for unknown slug', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/companies/nonexistent-company',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('COMPANY_NOT_FOUND');
    expect(body.error.message).toBe('Company was not found');
  });

  it('GET /api/companies/:slug/territories returns an unpaginated data envelope', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/companies/${VALID_COMPANY_SLUG}/territories`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.company.slug).toBe(VALID_COMPANY_SLUG);
    expect(typeof body.data.currentTerritoryCount).toBe('number');
    expect(Array.isArray(body.data.territories)).toBe(true);
    expect(body).not.toHaveProperty('meta');
  });

  it('GET /api/companies/:slug/territories returns 404 for unknown company', async () => {
    const service = createTerritoryService();
    (service.listCompanyTerritories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Company was not found'), {
        code: 'COMPANY_NOT_FOUND',
        statusCode: 404,
      }),
    );
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/companies/unknown-company/territories',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('COMPANY_NOT_FOUND');
  });

  it('GET /api/companies/:slug validates slug path input', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/companies/Bad%20Slug',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(service.getCompany).not.toHaveBeenCalled();
  });

  it('territory version serializes as decimal string, not raw BigInt in JSON', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(typeof body.data[0].version).toBe('string');
    expect(/^[1-9][0-9]*$/.test(body.data[0].version)).toBe(true);
    expect(typeof body.data[0].currentOwnership.territoryVersion).toBe('string');
    expect(/^[1-9][0-9]*$/.test(body.data[0].currentOwnership.territoryVersion)).toBe(true);
  });

  it('territory version beyond Number.MAX_SAFE_INTEGER serializes correctly as string', async () => {
    const service = createTerritoryService();
    const bigVersion = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    (service.listTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          ...territory,
          status: 'unclaimed' as const,
          version: bigVersion,
        },
      ],
      limit: 50,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data[0].version).toBe(bigVersion);
  });

  it('no contested state appears in any territory status', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    for (const item of body.data) {
      expect(['unclaimed', 'claimed', 'disabled']).toContain(item.status);
    }
  });

  it('displayWeight is always an integer within 1..100', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    for (const item of body.data) {
      expect(item.displayWeight).toBeGreaterThanOrEqual(1);
      expect(item.displayWeight).toBeLessThanOrEqual(100);
      expect(Number.isInteger(item.displayWeight)).toBe(true);
    }
  });

  it('privacy: no contact, grant, session, or recovery fields leak from any endpoint', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });

    const forbiddenFields = [
      'contactEmail',
      'contact_email',
      'managementGrants',
      'management_sessions',
      'accessRequests',
      'access_requests',
      'recoveryRequests',
      'recovery_requests',
      'verificationTokens',
    ];

    for (const path of [
      '/api/territories',
      `/api/territories/${VALID_TERRITORY_SLUG}`,
      `/api/territories/${VALID_TERRITORY_SLUG}/history`,
      `/api/companies/${VALID_COMPANY_SLUG}`,
      `/api/companies/${VALID_COMPANY_SLUG}/territories`,
    ]) {
      const response = await app.inject({ method: 'GET', url: path });
      const serialized = response.body;
      for (const field of forbiddenFields) {
        expect(serialized, `Field "${field}" must not appear in ${path}`).not.toContain(field);
      }
    }
  });

  it('GET /api/territory-categories with no territories returns empty array', async () => {
    const service = createTerritoryService();
    (service.listCategories as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territory-categories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toEqual([]);
  });

  it('unknown route within /api/territories/* returns 404 with NOT_FOUND code', async () => {
    const service = createTerritoryService();
    const app = buildApp({ territories: { service } });
    // A path that does not match any registered route
    const response = await app.inject({
      method: 'GET',
      url: '/api/territories/slug/unknown-sub-resource',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('initial_seed ownership is real ownership â€” status is claimed, not provisional', async () => {
    const service = createTerritoryService();
    (service.listTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          ...territory,
          currentOwnership: {
            ...activeOwnership,
            source: 'initial_seed' as const,
          },
          status: 'claimed' as const,
        },
      ],
      limit: 50,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data[0].status).toBe('claimed');
    expect(body.data[0].currentOwnership.source).toBe('initial_seed');
  });

  it('unclaimed territory returns no currentOwnership', async () => {
    const service = createTerritoryService();
    (service.listTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          category,
          createdAt: '2026-08-28T12:00:00.000Z',
          description: 'Unclaimed territory.',
          displayWeight: 55,
          id: '21000000-0000-4000-8000-000000000099',
          name: 'Unclaimed Territory',
          slug: 'unclaimed-territory',
          status: 'unclaimed' as const,
          updatedAt: '2026-08-28T12:00:00.000Z',
          version: '1',
          visualMetadata: { accentColor: '#AABBCC', iconKey: 'box' },
        },
      ],
      limit: 50,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data[0].status).toBe('unclaimed');
    expect(body.data[0].currentOwnership).toBeUndefined();
  });

  it('disabled territory returns status disabled', async () => {
    const service = createTerritoryService();
    (service.listTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          ...territory,
          status: 'disabled' as const,
        },
      ],
      limit: 50,
    });
    const app = buildApp({ territories: { service } });
    const response = await app.inject({ method: 'GET', url: '/api/territories' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data[0].status).toBe('disabled');
  });
});
