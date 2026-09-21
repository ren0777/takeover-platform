import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../src/app/page.js';

describe('HomePage', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));

  it('sends people to the live territory board first', () => {
    expect(html).toContain('href="/territories"');
    expect(html).toMatch(/<a[^>]*href="\/territories"[^>]*>[^<]*territor/i);
  });

  it('no longer claims the board is unbuilt, and is honest about capture', () => {
    expect(html).not.toMatch(/not built/i);
    expect(html).toMatch(/capture|checkout/i);
    expect(html).toContain('href="/manage"');
  });
});
