import { describe, expect, it } from 'vitest';
import { DATA_RESOURCES, resolveSourceWith } from '../../src/lib/data/source.js';

const dev = { nodeEnv: 'development' as const };

describe('resolveSourceWith', () => {
  it('defaults every resource to fixtures in development', () => {
    for (const resource of DATA_RESOURCES) {
      expect(resolveSourceWith(resource, { ...dev, liveResources: undefined })).toBe('fixture');
    }
  });

  it('switches a single resource to live without affecting the others', () => {
    const environment = { ...dev, liveResources: 'territory-list' };

    expect(resolveSourceWith('territory-list', environment)).toBe('live');
    expect(resolveSourceWith('territory-detail', environment)).toBe('fixture');
    expect(resolveSourceWith('territory-history', environment)).toBe('fixture');
    expect(resolveSourceWith('public-company', environment)).toBe('fixture');
  });

  it('switches several named resources independently', () => {
    const environment = { ...dev, liveResources: 'territory-list,territory-detail' };

    expect(resolveSourceWith('territory-list', environment)).toBe('live');
    expect(resolveSourceWith('territory-detail', environment)).toBe('live');
    expect(resolveSourceWith('company-territories', environment)).toBe('fixture');
  });

  it('tolerates whitespace around names', () => {
    const environment = { ...dev, liveResources: ' territory-list , public-company ' };
    expect(resolveSourceWith('territory-list', environment)).toBe('live');
    expect(resolveSourceWith('public-company', environment)).toBe('live');
  });

  it('supports switching everything at once', () => {
    for (const resource of DATA_RESOURCES) {
      expect(resolveSourceWith(resource, { ...dev, liveResources: 'all' })).toBe('live');
    }
  });

  it('throws on an unknown resource name rather than silently ignoring it', () => {
    // A typo that resolved to "fixture" would look live while serving fixtures.
    expect(() =>
      resolveSourceWith('territory-list', { ...dev, liveResources: 'terrritory-list' }),
    ).toThrow(/Unknown data resource/);
  });

  it('refuses to serve fixtures in production', () => {
    expect(() =>
      resolveSourceWith('territory-list', { nodeEnv: 'production', liveResources: undefined }),
    ).toThrow(/development-only/);
  });

  it('allows a configured live resource in production', () => {
    expect(
      resolveSourceWith('territory-list', {
        nodeEnv: 'production',
        liveResources: 'territory-list',
      }),
    ).toBe('live');
  });

  it('still refuses unconfigured resources in production when others are live', () => {
    expect(() =>
      resolveSourceWith('territory-detail', {
        nodeEnv: 'production',
        liveResources: 'territory-list',
      }),
    ).toThrow(/development-only/);
  });
});
