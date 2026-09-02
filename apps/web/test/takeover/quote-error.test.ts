import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ERROR_CODES } from '@takeover/shared';
import { describeQuoteError } from '../../src/lib/takeover/quote-error.js';
import { TakeoverPanel } from '../../src/components/territory/takeover-panel.js';

describe('describeQuoteError', () => {
  it('separates a price change from a stale territory version', () => {
    const priceChanged = describeQuoteError(ERROR_CODES.TAKEOVER_PRICE_CHANGED);
    const staleVersion = describeQuoteError(ERROR_CODES.STALE_TERRITORY_VERSION);

    // Two different causes, two different explanations. Collapsing them would
    // tell someone the price moved when the territory actually changed hands.
    expect(priceChanged.title).not.toBe(staleVersion.title);
    expect(priceChanged.title.toLowerCase()).toContain('price');
    expect(staleVersion.title.toLowerCase()).toContain('territory');
  });

  it('requires a fresh quote whenever the amount is no longer trustworthy', () => {
    expect(describeQuoteError(ERROR_CODES.TAKEOVER_PRICE_CHANGED).requiresNewQuote).toBe(true);
    expect(describeQuoteError(ERROR_CODES.STALE_TERRITORY_VERSION).requiresNewQuote).toBe(true);
  });

  it('never offers a retry that would re-run a rejected authorisation', () => {
    for (const code of [
      ERROR_CODES.AUTHORIZATION_REQUIRED,
      ERROR_CODES.CONTACT_VERIFICATION_REQUIRED,
      ERROR_CODES.COMPANY_ACCESS_PENDING,
      ERROR_CODES.COMPANY_ACCESS_DENIED,
    ]) {
      expect(describeQuoteError(code).canRetry, code).toBe(false);
    }
  });

  it('states that nothing was charged in every failure it knows', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const failure = describeQuoteError(code);
      // Every pre-payment failure must settle the only question that matters.
      expect(`${failure.message}`.toLowerCase(), code).toContain('charged');
    }
  });

  it('falls back safely for an unknown code', () => {
    const failure = describeQuoteError('SOMETHING_NEW_FROM_THE_SERVER');
    expect(failure.title.length).toBeGreaterThan(0);
    expect(failure.message.toLowerCase()).toContain('nothing was charged');
  });
});

describe('TakeoverPanel initial render', () => {
  const html = renderToStaticMarkup(
    React.createElement(TakeoverPanel, { territorySlug: 'ai-coding' }),
  );

  it('offers to review the takeover without showing any amount', () => {
    expect(html).toContain('Review takeover');
    // No price may exist client-side before the server has quoted one.
    expect(html).not.toMatch(/[$€£]\s*\d/);
  });

  it('never renders a price input', () => {
    expect(html).not.toContain('<input');
  });

  it('claims no payment or capture before anything has happened', () => {
    const text = html.toLowerCase();
    for (const phrase of ['you captured', 'you own', 'payment confirmed', 'purchased']) {
      expect(text, phrase).not.toContain(phrase);
    }
  });

  it('says plainly that nothing is charged yet', () => {
    expect(html.toLowerCase()).toContain('nothing is charged');
  });
});
