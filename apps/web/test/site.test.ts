import { describe, expect, it } from 'vitest';
import { buildPageTitle, SITE } from '../src/lib/site.js';

describe('buildPageTitle', () => {
  it('returns the branded title when a page name is absent', () => {
    expect(buildPageTitle()).toBe('TakeOver — Own a piece of the internet.');
    expect(buildPageTitle('   ')).toBe('TakeOver — Own a piece of the internet.');
  });

  it('prefixes a meaningful page name', () => {
    expect(buildPageTitle('Territories')).toBe('Territories — TakeOver');
  });
});

describe('SITE', () => {
  it('carries the fixed product promise', () => {
    expect(SITE.tagline).toBe('Own a piece of the internet.');
  });
});
