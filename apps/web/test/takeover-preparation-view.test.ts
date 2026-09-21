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
  slug: 'ai-coding',
  status: 'unclaimed' as const,
};

function render(view: TakeoverPreparationView, busy = false): string {
  return renderToStaticMarkup(
    React.createElement(TakeoverPreparationPanel, {
      busy,
      company,
      onCancel: () => undefined,
      onRestart: () => undefined,
      view,
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
      territory: { ...territory, minimumTakeoverAmount: { amountMinor: 0, currency: 'USD' } },
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
