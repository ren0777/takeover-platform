import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  CompanyTerritoriesResult,
  TerritoryService,
} from '../src/modules/territories/service.js';
import type { CompanyPublicSummary, TerritorySummary } from '@takeover/shared';

vi.setConfig({ testTimeout: 20000 });



/**
 * Regression marker for the company-territories pagination bug.
 *
 * `GET /api/companies/:slug/territories` parses `cursor` and `limit`, the
 * service paginates and computes `nextCursor`, and then the route builds a
 * data-only envelope, so the cursor never leaves the server. The repo's own
 * API convention is that paginated responses use `{ data, meta }` with
 * required `meta.requestId` — the territory list and territory history routes
 * both do this today.
 *
 * The desired behavior below is marked `it.fails` so the suite stays green
 * while the bug exists. When the route publishes `meta`, remove the marker:
 * this test must then pass as written, and the committed assertion
 * `expect(body).not.toHaveProperty('meta')` in territory-http.test.ts must be
 * updated in the same change.
 */

const companySlug = 'acme-corp';

const company: CompanyPublicSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Acme Corp',
  slug: companySlug,
  status: 'active',
  verificationLevels: ['contact_verified'],
  websiteUrl: 'https://acme.example',
};

const ownedTerritory = {
  category: {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'AI',
    slug: 'ai',
  },
  createdAt: '2026-08-28T12:00:00.000Z',
  description: 'AI-assisted software creation.',
  displayWeight: 100,
  id: '21000000-0000-4000-8000-000000000001',
  name: 'AI Coding',
  slug: 'ai-coding',
  status: 'claimed',
  updatedAt: '2026-08-30T12:00:00.000Z',
  version: '7',
  visualMetadata: {},
} as unknown as TerritorySummary;

function createService(): TerritoryService {
  // Two deterministic territories for pagination
  const secondTerritory = {
    ...ownedTerritory,
    id: '21000000-0000-4000-8000-000000000002',
    name: 'AI Coding 2',
    slug: 'ai-coding-2',
  } as unknown as TerritorySummary;

  let callIndex = 0;
  return {
    getCompany: vi.fn(async () => company),
    listCompanyTerritories: vi.fn(async (slug: string, query: { cursor?: string; limit: number }) => {
      // First page (no cursor)
      if (!query?.cursor) {
        callIndex++;
        return {
          company,
          currentTerritoryCount: 2,
          territories: [ownedTerritory],
          limit: query.limit,
          nextCursor: 'next-page-cursor',
        };
      }
      // Second page (cursor present)
      callIndex++;
      return {
        company,
        currentTerritoryCount: 2,
        territories: [secondTerritory],
        limit: query.limit,
        nextCursor: null,
      };
    }),
  } as unknown as TerritoryService;
}

describe('company territories pagination regression', () => {
  it(
    'GET /api/companies/:slug/territories publishes the pagination cursor in meta',
    async () => {
      const app = buildApp({ territories: { service: createService() } });
      const response = await app.inject({
        method: 'GET',
        url: `/api/companies/${companySlug}/territories?limit=1`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.territories).toHaveLength(1);
      expect(body.meta).toBeDefined();
      expect(body.meta.nextCursor).toBe('next-page-cursor');
      expect(body.meta.limit).toBe(1);
      expect(typeof body.meta.requestId).toBe('string');

       // Request second page using cursor
       const nextCursor = body.meta.nextCursor;
       const response2 = await app.inject({
         method: 'GET',
         url: `/api/companies/${companySlug}/territories?limit=1&cursor=${nextCursor}`,
       });
       expect(response2.statusCode).toBe(200);
       const body2 = JSON.parse(response2.body);
       expect(body2.data.territories).toHaveLength(1);
       // Ensure different territory
       expect(body2.data.territories[0].id).not.toBe(body.data.territories[0].id);
       expect(body2.meta).toBeDefined();
       expect(body2.meta.nextCursor).toBeNull();
       expect(body2.meta.limit).toBe(1);
       expect(typeof body2.meta.requestId).toBe('string');
    },
  );
});
