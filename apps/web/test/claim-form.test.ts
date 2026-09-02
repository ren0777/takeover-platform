import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimForm } from '../src/app/claim/claim-form.js';

describe('ClaimForm', () => {
  it('renders the company claim form and required fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimForm, { territoryExternalRef: null }),
    );

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

describe('territory prefill from /claim?territory=...', () => {
  it('submits the deep-linked territory as the field value', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimForm, { territoryExternalRef: 'ai-coding' }),
    );
    const input = inputTagFor(html, 'territoryExternalRef');

    // `value` is what the browser submits. A placeholder is never submitted, so
    // the deep link used to post an empty reference unless the user retyped it.
    expect(input).toContain('value="ai-coding"');
    expect(input).not.toContain('placeholder="ai-coding"');
  });

  it('leaves the field empty and editable when no territory was linked', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimForm, { territoryExternalRef: null }),
    );
    const input = inputTagFor(html, 'territoryExternalRef');

    expect(input).not.toContain('value=');
    // Uncontrolled and writable, so a manually typed reference still submits.
    // Matched as attributes: the class list contains `disabled:` utilities.
    expect(input).not.toMatch(/\sreadonly="/);
    expect(input).not.toMatch(/\sdisabled="/);
  });

  it('does not leak the territory into any other field', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimForm, { territoryExternalRef: 'ai-coding' }),
    );

    for (const name of ['name', 'websiteUrl', 'logoUrl', 'contactEmail']) {
      expect(inputTagFor(html, name)).not.toContain('ai-coding');
    }
  });
});
