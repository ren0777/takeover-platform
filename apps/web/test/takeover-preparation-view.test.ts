import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { type TakeoverPreparationView } from '@takeover/shared';
import {
  TakeoverPreparationPanel,
  describePreparationTerritory,
} from '../src/app/manage/company/takeover-preparation-panel.js';

const company = { id: '11111111-1111-4111-8111-111111111111', name: 'My Cool Startup' };
const intent = {
  checkoutAvailable: false as const,
  companyId: company.id,
  expiresAt: '2026-08-31T13:00:00.000Z',
  id: '33333333-3333-4333-8333-333333333333',
  quoteAuthority: 'reference_only' as const,
  status: 'identity_ready' as const,
  territoryExternalRef: 'ai-coding',
};
const territory = {
  categoryName: 'AI',
  minimumTakeoverAmount: { amountMinor: 25_000, currency: 'USD' },
  name: 'AI Coding',
  pricingConfigured: true,
  quoteAvailability: 'quotable' as const,
  slug: 'ai-coding',
  status: 'unclaimed' as const,
};

type PartialView = Omit<TakeoverPreparationView, 'quote' | 'quoteState'> &
  Partial<Pick<TakeoverPreparationView, 'quote' | 'quoteState'>>;

function render(view: PartialView, busy = false): string {
  return renderToStaticMarkup(
    React.createElement(TakeoverPreparationPanel, {
      busy,
      company,
      onCancel: () => undefined,
      onQuote: () => undefined,
      onRestart: () => undefined,
      view: { quote: null, quoteState: 'none', ...view },
    }),
  );
}

describe('TakeoverPreparationPanel', () => {
  it('shows territory, company, availability, minimum amount, status and the checkout warning', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory,
      territoryState: 'available',
    });

    expect(html).toContain('AI Coding');
    expect(html).toContain('My Cool Startup');
    expect(html).toContain('Available');
    expect(html).toContain('$250.00');
    expect(html).toContain('identity_ready');
    expect(html).toContain('Checkout is unavailable');
    expect(html).toContain('Cancel preparation');
    expect(html).toContain('href="/territory/ai-coding"');
    // No control anywhere leads toward payment.
    const controls = html.match(/<(button|a)\b[^>]*>[^<]*/g) ?? [];
    expect(controls.some((control) => /pay|checkout|capture/i.test(control))).toBe(false);
  });

  it('names the current owner when the territory was claimed since preparation began', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory: {
        ...territory,
        currentOwner: { name: 'Northwind', slug: 'northwind' },
        status: 'claimed',
      },
      territoryState: 'claimed',
    });

    expect(html).toContain('Claimed by');
    expect(html).toContain('Northwind');
    expect(html).toContain('Cancel preparation');
  });

  it('offers no restart onto a disabled territory, only cancel and the board', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory: { ...territory, status: 'disabled' },
      territoryState: 'disabled',
    });

    expect(html).toContain('Unavailable');
    expect(html).toContain('Cancel preparation');
    expect(html).not.toContain('Start again');
    expect(html).toContain('href="/territories"');
  });

  it('explains a missing territory without pretending a preparation is usable', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory: null,
      territoryState: 'missing',
    });

    expect(html).toContain('no longer exists');
    expect(html).toContain(intent.territoryExternalRef);
    expect(html).toContain('Cancel preparation');
  });

  it('points to the board when nothing is being prepared', () => {
    const html = render({
      checkoutAvailable: false,
      intent: null,
      territory: null,
      territoryState: 'none',
    });

    expect(html).toContain('No territory is being prepared');
    expect(html).toContain('href="/territories"');
    expect(html).not.toContain('Cancel preparation');
  });

  it('lets a cancelled preparation be started again', () => {
    const html = render({
      checkoutAvailable: false,
      intent: { ...intent, status: 'cancelled' },
      territory,
      territoryState: 'available',
    });

    expect(html).toContain('cancelled');
    expect(html).toContain('Start again');
    expect(html).not.toContain('Cancel preparation');
  });

  it('disables actions while a mutation is in flight', () => {
    const html = render(
      { checkoutAvailable: false, intent, territory, territoryState: 'available' },
      true,
    );

    expect(html).toMatch(/<button[^>]*disabled/);
  });
});

describe('describePreparationTerritory', () => {
  it('maps every territory state to a label and tone', () => {
    expect(describePreparationTerritory('available')).toEqual({ label: 'Available', tone: 'info' });
    expect(describePreparationTerritory('claimed')).toEqual({ label: 'Claimed', tone: 'neutral' });
    expect(describePreparationTerritory('disabled')).toEqual({
      label: 'Unavailable',
      tone: 'warning',
    });
    expect(describePreparationTerritory('missing')).toEqual({
      label: 'Not found',
      tone: 'warning',
    });
    expect(describePreparationTerritory('none')).toEqual({ label: 'None', tone: 'neutral' });
  });
});

describe('TakeoverPreparationPanel minimum amount', () => {
  it('never presents a zero minimum as a real price', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory: {
        ...territory,
        minimumTakeoverAmount: { amountMinor: 0, currency: 'USD' },
        pricingConfigured: false,
        quoteAvailability: 'pricing_not_configured' as const,
      },
      territoryState: 'available',
    });

    expect(html).not.toContain('$0.00');
    expect(html).toContain('Pricing not configured');
  });

  it('shows a configured minimum with its currency', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory,
      territoryState: 'available',
    });

    expect(html).toContain('$250.00');
    expect(html).toContain('USD');
    expect(html).not.toContain('Pricing not configured');
  });
});

describe('TakeoverPreparationPanel quotes', () => {
  const quote = {
    amount: { amountMinor: 1_000, currency: 'USD' },
    checkoutAvailable: false as const,
    createdAt: '2026-09-22T10:00:00.000Z',
    expiresAt: '2026-09-22T10:05:00.000Z',
    id: '44444444-4444-4444-8444-444444444444',
    intentId: intent.id,
    status: 'active' as const,
    territorySlug: 'ai-coding',
    territoryVersion: '3',
    usable: true,
  };

  it('offers Generate quote for a priced, active preparation with no quote yet', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory,
      territoryState: 'available',
    });

    expect(html).toContain('Generate quote');
    expect(html).not.toContain('Refresh quote');
    expect(html).toContain('Checkout is unavailable');
  });

  it('never offers a quote when pricing is not configured', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory: {
        ...territory,
        minimumTakeoverAmount: { amountMinor: 0, currency: 'USD' },
        pricingConfigured: false,
        quoteAvailability: 'pricing_not_configured' as const,
      },
      territoryState: 'available',
    });

    expect(html).toContain('Pricing not configured');
    expect(html).not.toContain('Generate quote');
    expect(html).not.toContain('Refresh quote');
  });

  it('shows an active quote with amount, currency, expiry and status, plus Refresh quote', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      quote,
      quoteState: 'active',
      territory,
      territoryState: 'available',
    });

    expect(html).toContain('$10.00');
    expect(html).toContain('USD');
    expect(html).toMatch(/Quote status[\s\S]*Active/);
    expect(html).toContain('Quote expires');
    expect(html).toContain('Refresh quote');
    expect(html).not.toContain('Generate quote');
    expect(html).toContain('cannot be paid');
  });

  it.each([
    ['expired', 'expired', undefined, 'expired'],
    ['stale', 'stale', 'pricing_changed', 'price changed'],
    ['stale', 'stale', 'territory_version_changed', 'territory changed'],
    ['cancelled', 'cancelled', undefined, 'cancelled'],
  ] as const)(
    'explains a %s quote and offers a refresh',
    (status, quoteState, staleReason, wording) => {
      const html = render({
        checkoutAvailable: false,
        intent,
        quote: {
          ...quote,
          status: status === 'stale' ? 'active' : status,
          usable: false,
          ...(staleReason === undefined ? {} : { staleReason }),
        },
        quoteState,
        territory,
        territoryState: 'available',
      });

      expect(html.toLowerCase()).toContain(wording);
      expect(html).toContain('Refresh quote');
      expect(html).toContain('$10.00');
    },
  );

  it('hides quote actions once the preparation itself is no longer active', () => {
    const html = render({
      checkoutAvailable: false,
      intent: { ...intent, status: 'cancelled' },
      quote: { ...quote, status: 'cancelled', usable: false },
      quoteState: 'cancelled',
      territory,
      territoryState: 'available',
    });

    expect(html).not.toContain('Generate quote');
    expect(html).not.toContain('Refresh quote');
  });
});

describe('TakeoverPreparationPanel on a claimed territory', () => {
  const claimedTerritory = {
    ...territory,
    currentOwner: { name: 'Northwind', slug: 'northwind' },
    quoteAvailability: 'claimed_pricing_not_configured' as const,
    status: 'claimed' as const,
  };

  it('explains that takeover pricing is unavailable, offers no quote, and keeps the territory', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      territory: claimedTerritory,
      territoryState: 'claimed',
    });

    expect(html).toContain('Northwind');
    expect(html).toContain('Takeover pricing for this claimed territory is not available');
    expect(html).not.toContain('Generate quote');
    expect(html).not.toContain('Refresh quote');
    expect(html).not.toContain('no longer exists');
    expect(html).toContain('Checkout is unavailable');
  });

  it('marks an earlier quote stale with claimed wording and offers no refresh', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      quote: {
        amount: { amountMinor: 1_000, currency: 'USD' },
        checkoutAvailable: false,
        createdAt: '2026-09-22T10:00:00.000Z',
        expiresAt: '2026-09-22T10:05:00.000Z',
        id: '44444444-4444-4444-8444-444444444444',
        intentId: intent.id,
        staleReason: 'territory_claimed',
        status: 'active',
        territorySlug: 'ai-coding',
        territoryVersion: '3',
        usable: false,
      },
      quoteState: 'stale',
      territory: claimedTerritory,
      territoryState: 'claimed',
    });

    expect(html).toContain('claimed by another company');
    expect(html).not.toContain('Refresh quote');
    expect(html).toContain('$10.00');
  });
});

describe('MVP pricing disclosures', () => {
  const html = render({
    checkoutAvailable: false,
    intent,
    territory,
    territoryState: 'available',
  });

  it('states the price, the five-minute validity and the 20% increase', () => {
    expect(html).toContain('Takeover price');
    expect(html).toContain('$250.00');
    // Derived from the policy TTL (or the quote itself), never hardcoded prose.
    expect(html).toContain('valid for 5 minutes');
    expect(html).toContain('120% of the amount actually paid');
    expect(html).toContain('rounded up to the next cent');
  });

  it('says a takeover replaces the placement and pays the previous holder nothing', () => {
    expect(html).toContain('replaces the current placement');
    expect(html).toContain('no payout and no revenue share');
  });

  it('describes temporary promotional placement, never equity or permanent ownership', () => {
    expect(html).toContain('temporary promotional placement');
    expect(html).toMatch(
      /not equity, intellectual property, permanent ownership, or an investment/,
    );
  });

  it('keeps saying that checkout is unavailable and nothing can be charged', () => {
    expect(html).toContain('checkout is unavailable and nothing can be charged');
    expect(html).toContain('Checkout is unavailable');
  });
});

describe('quote validity wording', () => {
  it('uses the lifetime the server actually applied to the quote', () => {
    const html = render({
      checkoutAvailable: false,
      intent,
      quote: {
        amount: { amountMinor: 1_000, currency: 'USD' },
        checkoutAvailable: false,
        createdAt: '2026-09-22T10:00:00.000Z',
        expiresAt: '2026-09-22T10:10:00.000Z',
        id: '44444444-4444-4444-8444-444444444444',
        intentId: intent.id,
        status: 'active',
        territorySlug: 'ai-coding',
        territoryVersion: '3',
        usable: true,
      },
      quoteState: 'active',
      territory,
      territoryState: 'available',
    });

    expect(html).toContain('valid for 10 minutes');
    expect(html).not.toContain('valid for 5 minutes');
  });
});
