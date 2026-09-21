import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TerritoriesLoading, {
  TERRITORY_BOARD_SKELETON_TILES,
} from '../src/app/territories/loading.js';

describe('TerritoriesLoading', () => {
  const html = renderToStaticMarkup(React.createElement(TerritoriesLoading));

  it('announces the loading board in words for assistive technology', () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading territories');
  });

  it('keeps the page title so the route does not jump when data arrives', () => {
    expect(html).toContain('Territories');
  });

  it('renders decorative skeleton tiles hidden from the accessibility tree', () => {
    const tiles = html.match(/aria-hidden="true"/g) ?? [];
    expect(tiles.length).toBeGreaterThanOrEqual(TERRITORY_BOARD_SKELETON_TILES);
  });

  it('never shows territory content, status labels, or actions while loading', () => {
    for (const forbidden of ['Unclaimed', 'Claimed', 'Unavailable', 'Claim this territory']) {
      expect(html).not.toContain(forbidden);
    }
  });
});
