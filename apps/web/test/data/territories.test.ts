import { describe, expect, it } from 'vitest';
import { territoryDetailSchema, territorySummarySchema } from '@takeover/shared';
import {
  getTerritories,
  getTerritoryBySlug,
  getTerritoryHistory,
} from '../../src/lib/data/territories.js';
import { getCompanyTerritories } from '../../src/lib/data/companies.js';
import { resolveSource } from '../../src/lib/data/source.js';

// Fixtures parse through the real .strict() schemas at module load, so simply
// importing them proves they match the authoritative contract.
describe('territory fixtures', () => {
  it('every territory satisfies the authoritative summary schema', async () => {
    const territories = await getTerritories();
    expect(territories.length).toBeGreaterThan(0);
    for (const territory of territories) {
      expect(() => territorySummarySchema.parse(territory)).not.toThrow();
    }
  });

  it('covers unclaimed, claimed, and disabled — and nothing else', async () => {
    const statuses = new Set((await getTerritories()).map((territory) => territory.status));
    expect(statuses).toEqual(new Set(['unclaimed', 'claimed', 'disabled']));
  });

  it('keeps display weight inside the authoritative 1..100 range', async () => {
    for (const territory of await getTerritories()) {
      expect(territory.displayWeight).toBeGreaterThanOrEqual(1);
      expect(territory.displayWeight).toBeLessThanOrEqual(100);
    }
  });

  it('exposes versions as opaque decimal strings, never numbers', async () => {
    for (const territory of await getTerritories()) {
      expect(typeof territory.version).toBe('string');
      expect(territory.version).toMatch(/^[1-9][0-9]*$/);
    }
  });

  it('never attaches ownership to an unclaimed territory', async () => {
    for (const territory of await getTerritories()) {
      if (territory.status === 'unclaimed') {
        expect(territory.currentOwnership).toBeUndefined();
      }
    }
  });

  it('includes a suspended owner, which stays publicly named', async () => {
    const owners = (await getTerritories())
      .map((territory) => territory.currentOwnership?.owner)
      .filter((owner) => owner !== undefined);
    expect(owners.some((owner) => owner.status === 'suspended')).toBe(true);
  });

  it('includes both ownership sources', async () => {
    const sources = new Set(
      (await getTerritories())
        .map((territory) => territory.currentOwnership?.source)
        .filter((source) => source !== undefined),
    );
    expect(sources).toEqual(new Set(['initial_seed', 'paid_capture']));
  });
});

describe('getTerritoryBySlug', () => {
  it('returns a detail record satisfying the detail schema', async () => {
    const detail = await getTerritoryBySlug('ai-coding');
    expect(detail).not.toBeNull();
    expect(() => territoryDetailSchema.parse(detail)).not.toThrow();
  });

  it('caps the history preview at five entries', async () => {
    const detail = await getTerritoryBySlug('ai-coding');
    expect(detail?.ownershipHistoryPreview.length).toBeLessThanOrEqual(5);
  });

  it('returns null for an unknown slug rather than throwing', async () => {
    expect(await getTerritoryBySlug('does-not-exist')).toBeNull();
  });
});

describe('getTerritoryHistory', () => {
  it('returns more entries than the preview shows', async () => {
    expect((await getTerritoryHistory('ai-coding')).length).toBeGreaterThan(5);
  });

  it('returns an empty list for a territory with no history', async () => {
    expect(await getTerritoryHistory('analytics')).toEqual([]);
  });
});

describe('getCompanyTerritories', () => {
  it('counts only territories the company currently owns', async () => {
    const held = await getCompanyTerritories('northwind');
    expect(held).not.toBeNull();
    expect(held?.currentTerritoryCount).toBe(held?.territories.length);
    for (const territory of held?.territories ?? []) {
      expect(territory.currentOwnership?.owner.slug).toBe('northwind');
    }
  });

  it('returns null for an unknown company', async () => {
    expect(await getCompanyTerritories('nope')).toBeNull();
  });
});

describe('resolveSource', () => {
  it('keeps every territory resource on fixtures until the API ships', () => {
    expect(resolveSource('territory-categories')).toBe('fixture');
    expect(resolveSource('territory-list')).toBe('fixture');
    expect(resolveSource('territory-detail')).toBe('fixture');
    expect(resolveSource('territory-history')).toBe('fixture');
    expect(resolveSource('public-company')).toBe('fixture');
    expect(resolveSource('company-territories')).toBe('fixture');
  });
});
