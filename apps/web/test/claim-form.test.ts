import React, { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimForm } from '../src/app/claim/claim-form.js';

describe('ClaimForm', () => {
  it('renders the company claim form and required fields', () => {
    const html = renderToStaticMarkup(createElement(ClaimForm, { territoryExternalRef: null }));

    expect(html).toContain('Company name');
    expect(html).toContain('Contact email');
    expect(html).toContain('Claim this company');
  });
});
