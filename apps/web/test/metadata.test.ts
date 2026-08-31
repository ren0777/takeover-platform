import { describe, expect, it } from 'vitest';
import { privatePageMetadata, publicPageMetadata } from '../src/lib/metadata.js';

describe('privatePageMetadata', () => {
  it('marks capability landings noindex and nofollow', () => {
    const meta = privatePageMetadata('Company management');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('brands the title', () => {
    expect(privatePageMetadata('Verify your email').title).toBe('Verify your email — TakeOver');
  });

  it('never carries a canonical url, which would invite indexing', () => {
    expect(privatePageMetadata('Manage').alternates).toBeUndefined();
  });
});

describe('publicPageMetadata', () => {
  it('brands the title and keeps the description', () => {
    const meta = publicPageMetadata({
      title: 'Territories',
      description: 'Every internet territory on TakeOver.',
      path: '/territories',
    });
    expect(meta.title).toBe('Territories — TakeOver');
    expect(meta.description).toBe('Every internet territory on TakeOver.');
  });

  it('sets a canonical path', () => {
    const meta = publicPageMetadata({
      title: 'Territories',
      description: 'x',
      path: '/territories',
    });
    expect(meta.alternates?.canonical).toBe('/territories');
  });

  it('does not suppress indexing', () => {
    const meta = publicPageMetadata({ title: 'Territories', description: 'x', path: '/t' });
    expect(meta.robots).toBeUndefined();
  });

  it('mirrors title and description into the open graph card', () => {
    const meta = publicPageMetadata({ title: 'Territories', description: 'x', path: '/t' });
    expect(meta.openGraph?.title).toBe('Territories — TakeOver');
    expect(meta.openGraph?.description).toBe('x');
  });
});
