import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TERRITORY_API_PATHS } from '../../src/lib/api/territories.js';
import { getPublicCompany, getCompanyTerritories } from '../../src/lib/data/companies.js';
import {
  getTerritories,
  getTerritoryBySlug,
  getTerritoryCategories,
  getTerritoryHistory,
  getTerritoryHistoryPage,
  getTerritoryPage,
} from '../../src/lib/data/territories.js';
import {
  COMPANY_FIXTURES,
  TERRITORY_CATEGORY_FIXTURES,
  TERRITORY_FIXTURES,
  detailFor,
  historyFor,
} from '../../src/lib/fixtures/territories.js';

/**
 * One switch test per public read resource.
 *
 * These are the tests that decide whether flipping `TAKEOVER_LIVE_RESOURCES`
 * is safe: with a resource on fixtures nothing may touch the network, and with
 * it live every byte must come from the HTTP layer and be parsed through
 * `@takeover/shared`. The HTTP layer is mocked at `fetch`, so the real client,
 * the real URL resolution and the real schemas all run.
 */

let fetchSpy: ReturnType<typeof vi.fn>;

function respondWith(body: unknown, status = 200) {
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function notFoundResponse() {
  respondWith({ error: { code: 'TERRITORY_NOT_FOUND', message: 'No such record' } }, 404);
}

function live(...resources: string[]) {
  vi.stubEnv('TAKEOVER_LIVE_RESOURCES', resources.join(','));
}

/** The URL the single mocked request was made against. */
function requestedUrl(): string {
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  return String(fetchSpy.mock.calls[0]?.[0]);
}

function firstTerritory() {
  const [first] = TERRITORY_FIXTURES;
  if (first === undefined) throw new Error('fixture missing');
  return first;
}

function ownedCompanySlug(): string {
  const owned = TERRITORY_FIXTURES.find((territory) => territory.currentOwnership !== undefined);
  if (owned?.currentOwnership === undefined) throw new Error('fixture missing');
  return owned.currentOwnership.owner.slug;
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('territory-categories', () => {
  it('reads fixtures without touching the network when not live', async () => {
    expect(await getTerritoryCategories()).toEqual(TERRITORY_CATEGORY_FIXTURES);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the API when live', async () => {
    live('territory-categories');
    respondWith({ data: TERRITORY_CATEGORY_FIXTURES });

    expect(await getTerritoryCategories()).toHaveLength(TERRITORY_CATEGORY_FIXTURES.length);
    expect(requestedUrl()).toContain(TERRITORY_API_PATHS.categories);
  });

  it('rejects a malformed live response instead of rendering it', async () => {
    live('territory-categories');
    respondWith({ data: [{ id: 'not-a-uuid', slug: 'ai', name: 'AI' }] });

    await expect(getTerritoryCategories()).rejects.toThrow();
  });
});

describe('territory-list', () => {
  it('reads fixtures without touching the network when not live', async () => {
    expect(await getTerritories()).toEqual(TERRITORY_FIXTURES);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the API when live', async () => {
    live('territory-list');
    respondWith({ data: TERRITORY_FIXTURES, meta: { requestId: 'req-1', limit: 50 } });

    expect(await getTerritories()).toHaveLength(TERRITORY_FIXTURES.length);
    expect(requestedUrl()).toContain(TERRITORY_API_PATHS.territories);
  });

  it('carries the pagination cursor through to the data layer', async () => {
    live('territory-list');
    respondWith({
      data: TERRITORY_FIXTURES,
      meta: { requestId: 'req-1', limit: 50, nextCursor: 'cursor-abc' },
    });

    const page = await getTerritoryPage();
    expect(page.nextCursor).toBe('cursor-abc');
    expect(page.items).toHaveLength(TERRITORY_FIXTURES.length);
  });

  it('rejects a live page whose meta was dropped', async () => {
    live('territory-list');
    respondWith({ data: TERRITORY_FIXTURES });

    await expect(getTerritoryPage()).rejects.toThrow();
  });

  it('rejects a live page whose meta omits the request id', async () => {
    live('territory-list');
    // The shared page meta requires requestId; a page without it is not the
    // contract, and accepting it would hide an envelope regression.
    respondWith({ data: TERRITORY_FIXTURES, meta: { limit: 50 } });

    await expect(getTerritoryPage()).rejects.toThrow();
  });

  it('keeps the version string opaque across the live boundary', async () => {
    live('territory-list');
    // Beyond Number.MAX_SAFE_INTEGER: survives only if never parsed as a number.
    respondWith({
      data: [{ ...firstTerritory(), version: '9007199254740993' }],
      meta: { requestId: 'req-1', limit: 50 },
    });

    expect((await getTerritories())[0]?.version).toBe('9007199254740993');
  });

  it('forwards filters to the live endpoint', async () => {
    live('territory-list');
    respondWith({ data: [], meta: { requestId: 'req-1', limit: 10 } });

    await getTerritories({ category: 'ai', status: 'claimed', limit: 10 });
    expect(requestedUrl()).toContain('category=ai');
  });

  it('rejects a malformed live response instead of rendering it', async () => {
    live('territory-list');
    respondWith({
      data: [{ ...firstTerritory(), displayWeight: 250 }],
      meta: { requestId: 'req-1', limit: 50 },
    });

    await expect(getTerritories()).rejects.toThrow();
  });
});

describe('territory-detail', () => {
  it('reads fixtures without touching the network when not live', async () => {
    expect(await getTerritoryBySlug(firstTerritory().slug)).toEqual(detailFor(firstTerritory()));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the API when live', async () => {
    live('territory-detail');
    const detail = detailFor(firstTerritory());
    respondWith({ data: detail });

    expect((await getTerritoryBySlug(detail.slug))?.slug).toBe(detail.slug);
    expect(requestedUrl()).toContain(TERRITORY_API_PATHS.territoryDetail(detail.slug));
  });

  it('returns null for a live 404 rather than throwing', async () => {
    live('territory-detail');
    notFoundResponse();

    expect(await getTerritoryBySlug('does-not-exist')).toBeNull();
  });

  it('rejects a malformed live response instead of rendering it', async () => {
    live('territory-detail');
    const detail: Record<string, unknown> = { ...detailFor(firstTerritory()) };
    // The detail contract requires the preview array; dropping it is drift.
    delete detail.ownershipHistoryPreview;
    respondWith({ data: detail });

    await expect(getTerritoryBySlug(String(detail.slug))).rejects.toThrow();
  });
});

describe('territory-history', () => {
  it('reads fixtures without touching the network when not live', async () => {
    expect(await getTerritoryHistory('ai-coding')).toEqual(historyFor('ai-coding'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the API when live', async () => {
    live('territory-history');
    respondWith({ data: historyFor('ai-coding'), meta: { requestId: 'req-1', limit: 20 } });

    expect((await getTerritoryHistory('ai-coding')).length).toBeGreaterThan(0);
    expect(requestedUrl()).toContain(TERRITORY_API_PATHS.territoryHistory('ai-coding'));
  });

  it('carries the pagination cursor through to the data layer', async () => {
    live('territory-history');
    respondWith({
      data: historyFor('ai-coding'),
      meta: { requestId: 'req-1', limit: 20, nextCursor: 'next-page' },
    });

    expect((await getTerritoryHistoryPage('ai-coding')).nextCursor).toBe('next-page');
  });

  it('rejects a live history page whose meta was dropped', async () => {
    live('territory-history');
    respondWith({ data: historyFor('ai-coding') });

    await expect(getTerritoryHistory('ai-coding')).rejects.toThrow();
  });

  it('keeps the territory version string opaque across the live boundary', async () => {
    live('territory-history');
    const [entry] = historyFor('ai-coding');
    if (entry === undefined) throw new Error('fixture missing');
    respondWith({
      data: [{ ...entry, territoryVersion: '18446744073709551615' }],
      meta: { requestId: 'req-1', limit: 20 },
    });

    expect((await getTerritoryHistory('ai-coding'))[0]?.territoryVersion).toBe(
      '18446744073709551615',
    );
  });
});

describe('public-company', () => {
  it('reads fixtures without touching the network when not live', async () => {
    const [company] = COMPANY_FIXTURES;
    if (company === undefined) throw new Error('fixture missing');

    expect(await getPublicCompany(company.slug)).toEqual(company);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the API when live', async () => {
    live('public-company');
    const [company] = COMPANY_FIXTURES;
    if (company === undefined) throw new Error('fixture missing');
    respondWith({ data: company });

    expect((await getPublicCompany(company.slug))?.slug).toBe(company.slug);
    expect(requestedUrl()).toContain(TERRITORY_API_PATHS.company(company.slug));
  });

  it('returns null for a live 404 rather than throwing', async () => {
    live('public-company');
    notFoundResponse();

    expect(await getPublicCompany('nope')).toBeNull();
  });

  it('rejects a malformed live response instead of rendering it', async () => {
    live('public-company');
    const [company] = COMPANY_FIXTURES;
    if (company === undefined) throw new Error('fixture missing');
    // The contract requires HTTPS; an http origin is a contract violation.
    respondWith({ data: { ...company, websiteUrl: 'http://insecure.example.com' } });

    await expect(getPublicCompany(company.slug)).rejects.toThrow();
  });
});

describe('company-territories', () => {
  it('reads fixtures without touching the network when not live', async () => {
    const held = await getCompanyTerritories(ownedCompanySlug());
    expect(held?.currentTerritoryCount).toBe(held?.territories.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the API when live', async () => {
    live('company-territories');
    const slug = ownedCompanySlug();
    const owned = TERRITORY_FIXTURES.filter(
      (territory) => territory.currentOwnership?.owner.slug === slug,
    );
    const [first] = owned;
    if (first?.currentOwnership === undefined) throw new Error('fixture missing');

    respondWith({
      data: {
        company: first.currentOwnership.owner,
        currentTerritoryCount: owned.length,
        territories: owned,
      },
    });

    expect((await getCompanyTerritories(slug))?.currentTerritoryCount).toBe(owned.length);
    expect(requestedUrl()).toContain(TERRITORY_API_PATHS.companyTerritories(slug));
  });

  it('returns null for a live 404 rather than throwing', async () => {
    live('company-territories');
    notFoundResponse();

    expect(await getCompanyTerritories('nope')).toBeNull();
  });

  it('rejects a malformed live response instead of rendering it', async () => {
    live('company-territories');
    respondWith({ data: { currentTerritoryCount: 1, territories: [] } });

    await expect(getCompanyTerritories('nope')).rejects.toThrow();
  });
});

describe('switch safety', () => {
  it('switches one resource without dragging the others live', async () => {
    live('territory-list');
    respondWith({ data: TERRITORY_FIXTURES, meta: { requestId: 'req-1', limit: 50 } });

    await getTerritories();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await getTerritoryCategories();
    // Categories are still on fixtures, so no second request was made.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fails loudly on an unknown resource name rather than serving fixtures', async () => {
    live('terrritory-list');
    await expect(getTerritories()).rejects.toThrow(/Unknown data resource/);
  });

  it('refuses to fall back to fixtures in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(getTerritories()).rejects.toThrow(/development-only/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('propagates a live transport failure instead of substituting fixtures', async () => {
    live('territory-list');
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    await expect(getTerritories()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('requires an explicit API origin in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    live('territory-list');

    await expect(getTerritories()).rejects.toThrow(/TAKEOVER_API_ORIGIN/);
  });

  it('calls the configured API origin for server-side reads', async () => {
    vi.stubEnv('TAKEOVER_API_ORIGIN', 'https://api.takeover.example');
    live('territory-list');
    respondWith({ data: [], meta: { requestId: 'req-1', limit: 50 } });

    await getTerritories();
    expect(requestedUrl()).toBe(`https://api.takeover.example${TERRITORY_API_PATHS.territories}`);
  });
});
