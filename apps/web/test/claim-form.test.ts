import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimForm } from '../src/app/claim/claim-form.js';

const selected = {
  category: { name: 'AI', slug: 'ai' },
  name: 'AI Coding',
  slug: 'ai-coding',
  status: 'unclaimed' as const,
};

describe('ClaimForm', () => {
  it('renders the company claim form and required fields', () => {
    const html = renderToStaticMarkup(React.createElement(ClaimForm, { territory: selected }));

    expect(html).toContain('Company name');
    expect(html).toContain('Contact email');
    expect(html).toContain('Claim this company');
  });
});

/**
 * Returns the rendered `<input>` tag whose `name` attribute matches.
 *
 * Asserting on the whole document would pass on a value that landed on the
 * wrong field, which is the class of bug this file guards.
 */
function inputTagFor(html: string, name: string): string {
  const match = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html);
  if (match === null) throw new Error(`no input rendered for name="${name}"`);
  return match[0];
}

describe('territory selected from the board', () => {
  it('submits the selected territory from a hidden field and shows it by name', () => {
    const html = renderToStaticMarkup(React.createElement(ClaimForm, { territory: selected }));
    const input = inputTagFor(html, 'territoryExternalRef');

    // `value` is what the browser submits; the person never types the reference.
    expect(input).toContain('value="ai-coding"');
    expect(input).toContain('type="hidden"');
    expect(html).toContain('Selected territory');
    expect(html).toContain('AI Coding');
    expect(html).toContain('Unclaimed');
    expect(html).toContain('href="/territory/ai-coding"');
  });

  it('shows a claimed territory as a takeover target rather than hiding it', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimForm, { territory: { ...selected, status: 'claimed' } }),
    );

    expect(html).toContain('Claimed');
    expect(inputTagFor(html, 'territoryExternalRef')).toContain('value="ai-coding"');
  });

  it('does not leak the territory into any other field', () => {
    const html = renderToStaticMarkup(React.createElement(ClaimForm, { territory: selected }));

    for (const name of ['name', 'websiteUrl', 'logoUrl', 'contactEmail']) {
      expect(inputTagFor(html, name)).not.toContain('ai-coding');
    }
  });
});
