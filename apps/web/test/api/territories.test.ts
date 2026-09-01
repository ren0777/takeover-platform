import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCompanyTerritories,
  fetchTerritories,
  fetchTerritoryCategories,
  fetchTerritoryHistory,
} from '../../src/lib/api/territories.js';
import { ApiRequestError } from '../../src/lib/api/client.js';
import { detailFor, TERRITORY_FIXTURES, historyFor } from '../../src/lib/fixtures/territories.js';

/**
 * Fixtures double as realistic API payloads here: they are already parsed
 * through the authoritative schemas, so a response built from them is exactly
 * what a conforming API would return.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTerritories', () => {
  it('parses a page and preserves the required meta cursor', async () => {
    stubFetch(
      jsonResponse({
        data: TERRITORY_FIXTURES,
        meta: { limit: 50, nextCursor: 'cursor-abc' },
      }),
    );

    const page = await fetchTerritories();

    expect(page.data).toHaveLength(TERRITORY_FIXTURES.length);
    // The cursor is the whole reason these use an envelope-aware parse.
    expect(page.meta.nextCursor).toBe('cursor-abc');
    expect(page.meta.limit).toBe(50);
  });

  it('accepts a final page with no cursor', async () => {
    stubFetch(jsonResponse({ data: [], meta: { limit: 50 } }));

    const page = await fetchTerritories();
    expect(page.meta.nextCursor).toBeUndefined();
  });

  it('rejects a page missing meta rather than silently losing the cursor', async () => {
    stubFetch(jsonResponse({ data: TERRITORY_FIXTURES }));

    await expect(fetchTerritories()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('rejects a malformed territory inside an otherwise valid page', async () => {
    const [first, ...rest] = TERRITORY_FIXTURES;
    stubFetch(
      jsonResponse({
        data: [{ ...first, displayWeight: 250 }, ...rest],
        meta: { limit: 50 },
      }),
    );

    await expect(fetchTerritories()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('preserves the opaque version string exactly', async () => {
    const [first] = TERRITORY_FIXTURES;
    if (first === undefined) throw new Error('fixture missing');

    stubFetch(
      jsonResponse({
        data: [{ ...first, version: '9007199254740993' }],
        meta: { limit: 50 },
      }),
    );

    const page = await fetchTerritories();
    // Beyond Number.MAX_SAFE_INTEGER: proves it is never parsed into a number.
    expect(page.data[0]?.version).toBe('9007199254740993');
  });

  it('sends the category and status filters as query parameters', async () => {
    const spy = stubFetch(jsonResponse({ data: [], meta: { limit: 10 } }));

    await fetchTerritories({ category: 'ai', status: 'claimed', limit: 10 });

    const requestedPath = String(spy.mock.calls[0]?.[0]);
    expect(requestedPath).toContain('category=ai');
    expect(requestedPath).toContain('status=claimed');
    expect(requestedPath).toContain('limit=10');
  });
});

describe('fetchTerritoryHistory', () => {
  it('parses a history page and preserves meta', async () => {
    stubFetch(
      jsonResponse({
        data: historyFor('ai-coding'),
        meta: { limit: 20, nextCursor: 'next-page' },
      }),
    );

    const page = await fetchTerritoryHistory('ai-coding');
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.meta.nextCursor).toBe('next-page');
  });

  it('rejects a history page missing meta', async () => {
    stubFetch(jsonResponse({ data: historyFor('ai-coding') }));

    await expect(fetchTerritoryHistory('ai-coding')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('preserves the opaque territoryVersion string', async () => {
    const entries = historyFor('ai-coding');
    const [first] = entries;
    if (first === undefined) throw new Error('fixture missing');

    stubFetch(
      jsonResponse({
        data: [{ ...first, territoryVersion: '18446744073709551615' }],
        meta: { limit: 20 },
      }),
    );

    const page = await fetchTerritoryHistory('ai-coding');
    expect(page.data[0]?.territoryVersion).toBe('18446744073709551615');
  });
});

describe('fetchTerritoryCategories', () => {
  it('parses a bare data array', async () => {
    stubFetch(
      jsonResponse({
        data: [{ id: crypto.randomUUID(), slug: 'ai', name: 'AI' }],
      }),
    );

    const categories = await fetchTerritoryCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0]?.slug).toBe('ai');
  });

  it('rejects a non-array payload', async () => {
    stubFetch(jsonResponse({ data: { slug: 'ai' } }));
    await expect(fetchTerritoryCategories()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('rejects when any item fails the contract', async () => {
    stubFetch(
      jsonResponse({
        data: [{ id: 'not-a-uuid', slug: 'ai', name: 'AI' }],
      }),
    );

    await expect(fetchTerritoryCategories()).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('fetchCompanyTerritories', () => {
  it('parses the holdings payload', async () => {
    const owned = TERRITORY_FIXTURES.filter(
      (territory) => territory.currentOwnership?.owner.slug === 'northwind',
    );
    const [firstOwned] = owned;
    if (firstOwned?.currentOwnership === undefined) throw new Error('fixture missing');

    stubFetch(
      jsonResponse({
        data: {
          company: firstOwned.currentOwnership.owner,
          currentTerritoryCount: owned.length,
          territories: owned,
        },
      }),
    );

    const held = await fetchCompanyTerritories('northwind');
    expect(held.currentTerritoryCount).toBe(owned.length);
  });

  it('surfaces an API error envelope as ApiRequestError', async () => {
    stubFetch(
      jsonResponse({ error: { code: 'TERRITORY_NOT_FOUND', message: 'No such company' } }, 404),
    );

    await expect(fetchCompanyTerritories('nope')).rejects.toMatchObject({
      code: 'TERRITORY_NOT_FOUND',
      status: 404,
    });
  });
});

describe('detail fixture shape', () => {
  it('still satisfies the detail contract used by the live parser', () => {
    const [first] = TERRITORY_FIXTURES;
    if (first === undefined) throw new Error('fixture missing');
    expect(() => detailFor(first)).not.toThrow();
  });
});
