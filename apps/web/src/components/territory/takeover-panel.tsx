'use client';

import { useEffect, useState } from 'react';
import { type QuoteResponse } from '@takeover/shared';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ApiRequestError } from '@/lib/api/client';
import { getTakeoverQuote, startTakeoverCheckout } from '@/lib/data/takeover';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { describeQuoteError, type QuoteFailure } from '@/lib/takeover/quote-error';

/**
 * Takeover review and provider handoff for one territory.
 *
 * Shows the server's authoritative minimum amount and nothing else. There is
 * no amount input: the charge is the minimum, decided server-side, so there is
 * nothing for a person to type and nothing for this component to compute.
 *
 * Inline rather than a dialog, so the amount stays above the action on a small
 * screen and no focus trap sits between a person and their money.
 */

type PanelState =
  | { status: 'idle' }
  | { status: 'quoting' }
  | { status: 'quoted'; quote: QuoteResponse }
  | { status: 'expired'; quote: QuoteResponse }
  | { status: 'starting'; quote: QuoteResponse }
  | { status: 'redirecting' }
  | { status: 'failed'; failure: QuoteFailure; requestId: string | undefined };

function secondsUntil(iso: string, nowMs: number): number {
  return Math.max(0, Math.round((Date.parse(iso) - nowMs) / 1000));
}

function failureFrom(error: unknown): { failure: QuoteFailure; requestId: string | undefined } {
  if (error instanceof ApiRequestError) {
    return { failure: describeQuoteError(error.code), requestId: error.requestId };
  }
  return { failure: describeQuoteError('INTERNAL_ERROR'), requestId: undefined };
}

/** Live countdown. The ticking value is hidden from assistive tech; the
 *  absolute time beside it carries the same information as text. */
function ExpiryCountdown({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt, Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      const next = secondsUntil(expiresAt, Date.now());
      setRemaining(next);
      if (next === 0) onExpired();
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <span className="font-[family-name:var(--font-mono)] text-sm" aria-hidden="true">
      {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  );
}

export function TakeoverPanel({ territorySlug }: { territorySlug: string }) {
  const [state, setState] = useState<PanelState>({ status: 'idle' });

  async function requestQuote() {
    setState({ status: 'quoting' });
    try {
      const quote = await getTakeoverQuote(territorySlug);
      // The server can hand back a quote that is already spent.
      setState(
        quote.status === 'ACTIVE' ? { status: 'quoted', quote } : { status: 'expired', quote },
      );
    } catch (error: unknown) {
      setState({ status: 'failed', ...failureFrom(error) });
    }
  }

  async function proceedToPayment(quote: QuoteResponse) {
    setState({ status: 'starting', quote });
    try {
      const checkout = await startTakeoverCheckout({ quoteId: quote.quoteId });
      // Handing off. The status token in the URL the server built is the only
      // way back to an authoritative outcome; this navigation proves nothing.
      setState({ status: 'redirecting' });
      window.location.assign(checkout.providerCheckoutUrl);
    } catch (error: unknown) {
      setState({ status: 'failed', ...failureFrom(error) });
    }
  }

  if (state.status === 'idle' || state.status === 'quoting') {
    return (
      <div className="mt-8">
        <Button
          onClick={requestQuote}
          busy={state.status === 'quoting'}
          busyLabel="Checking the current amount…"
        >
          Review takeover
        </Button>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Shows the current amount to take over this territory. Nothing is charged until you confirm
          at our payment provider.
        </p>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="mt-8 space-y-3">
        <Notice
          variant="error"
          title={state.failure.title}
          {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
        >
          <p>{state.failure.message}</p>
        </Notice>
        {(state.failure.canRetry || state.failure.requiresNewQuote) && (
          <Button variant="secondary" onClick={requestQuote}>
            {state.failure.requiresNewQuote ? 'Get a new quote' : 'Try again'}
          </Button>
        )}
      </div>
    );
  }

  if (state.status === 'redirecting') {
    return (
      <div className="mt-8">
        <Notice variant="pending" title="Opening secure checkout">
          <p>
            You are being handed to our payment provider. Do not close this tab. Returning here
            afterwards does not by itself mean anything was paid or captured.
          </p>
        </Notice>
      </div>
    );
  }

  if (state.status === 'expired') {
    return (
      <div className="mt-8 space-y-3">
        <Notice variant="warning" title="This quote expired">
          <p>Nothing was charged. Amounts can move while a quote sits open, so get a new one.</p>
        </Notice>
        <Button variant="secondary" onClick={requestQuote}>
          Get a new quote
        </Button>
      </div>
    );
  }

  const { quote } = state;

  return (
    <section
      aria-labelledby="takeover-heading"
      className="mt-8 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <h2 id="takeover-heading" className="font-[family-name:var(--font-display)] font-semibold">
        Take over this territory
      </h2>

      {/* Amount first, action last: the figure must never sit below the fold
          on a small screen with the button in view. */}
      <dl className="mt-3 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-sm text-[var(--color-muted)]">Amount to take over</dt>
          <dd className="font-[family-name:var(--font-mono)] text-2xl">
            {formatMoney(quote.minimumAmount)}
            <span className="sr-only"> {quote.minimumAmount.currency}</span>
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-sm text-[var(--color-muted)]">Quote valid until</dt>
          <dd className="flex items-baseline gap-2 text-sm">
            <span className="font-[family-name:var(--font-mono)]">
              {formatAbsoluteDateTime(quote.expiresAt)}
            </span>
            <ExpiryCountdown
              expiresAt={quote.expiresAt}
              onExpired={() => setState({ status: 'expired', quote })}
            />
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-[var(--color-muted)]">
        This is the whole amount. It is set by us, not entered by you, and it is charged only if you
        complete payment at our provider.
      </p>

      {quote.checkoutAvailable ? (
        <div className="mt-4">
          <Button
            onClick={() => proceedToPayment(quote)}
            busy={state.status === 'starting'}
            busyLabel="Preparing secure checkout…"
            fullWidth
          >
            Proceed to payment
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Notice variant="warning" title="You cannot take over this territory yet">
            <p>
              {quote.eligibilityReason ??
                'Your company is not currently able to start a takeover. Nothing has been charged.'}
            </p>
          </Notice>
        </div>
      )}
    </section>
  );
}
