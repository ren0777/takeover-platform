import Link from 'next/link';
import {
  type TakeoverPreparationQuote,
  type TakeoverPreparationQuoteState,
  type TakeoverPreparationTerritoryState,
  type TakeoverPreparationView,
  type TakeoverQuoteStaleReason,
} from '@takeover/shared';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { formatAbsoluteDateTime } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';

type TerritoryPresentation = { label: string; tone: BadgeTone };

const TERRITORY_STATE: Record<TakeoverPreparationTerritoryState, TerritoryPresentation> = {
  none: { label: 'None', tone: 'neutral' },
  available: { label: 'Available', tone: 'info' },
  claimed: { label: 'Claimed', tone: 'neutral' },
  disabled: { label: 'Unavailable', tone: 'warning' },
  missing: { label: 'Not found', tone: 'warning' },
};

export function describePreparationTerritory(
  state: TakeoverPreparationTerritoryState,
): TerritoryPresentation {
  return TERRITORY_STATE[state];
}

const QUOTE_STATE: Record<TakeoverPreparationQuoteState, TerritoryPresentation> = {
  none: { label: 'No quote', tone: 'neutral' },
  active: { label: 'Active', tone: 'info' },
  expired: { label: 'Expired', tone: 'warning' },
  stale: { label: 'Out of date', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const STALE_REASON: Record<TakeoverQuoteStaleReason, string> = {
  territory_version_changed: 'The territory changed after this quote was issued.',
  territory_claimed:
    'This territory was claimed by another company after this quote was issued, and takeover pricing for claimed territories is not available yet.',
  pricing_changed: 'The price changed after this quote was issued.',
  territory_disabled: 'The territory became unavailable after this quote was issued.',
  territory_missing: 'The territory no longer exists.',
  intent_not_ready: 'The preparation this quote belongs to is no longer active.',
};

export function describeQuoteState(state: TakeoverPreparationQuoteState): TerritoryPresentation {
  return QUOTE_STATE[state];
}

type PanelProps = {
  busy: boolean;
  company: { id: string; name: string };
  onCancel: (intentId: string) => void;
  onQuote: () => void;
  onRestart: (territoryExternalRef: string) => void;
  view: TakeoverPreparationView;
};

/**
 * The quote as stored: amount and currency are the server's snapshot and are
 * shown verbatim even when the quote is no longer usable, so a person can see
 * what changed.
 */
function QuoteSection({
  busy,
  canQuote,
  onQuote,
  quote,
  quoteState,
}: {
  busy: boolean;
  canQuote: boolean;
  onQuote: () => void;
  quote: TakeoverPreparationQuote | null;
  quoteState: TakeoverPreparationQuoteState;
}) {
  const presentation = describeQuoteState(quoteState);
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-4">
      <h3 className="text-sm font-semibold">Quote</h3>
      {quote === null ? (
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          No quote has been generated. A quote records the current minimum takeover amount for a few
          minutes; it cannot be paid and reserves nothing.
        </p>
      ) : (
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--color-muted)]">Quoted amount</dt>
            <dd className="mt-1 font-[family-name:var(--font-mono)]">
              {formatMoney(quote.amount)} {quote.amount.currency}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Quote status</dt>
            <dd className="mt-1">
              <StatusBadge tone={presentation.tone} label={presentation.label} />
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Quote expires</dt>
            <dd className="mt-1 font-[family-name:var(--font-mono)]">
              {formatAbsoluteDateTime(quote.expiresAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Quote ID</dt>
            <dd className="mt-1 font-[family-name:var(--font-mono)] text-xs break-all">
              {quote.id}
            </dd>
          </div>
          {quoteState === 'expired' && (
            <p className="text-[var(--color-muted)] sm:col-span-2">
              This quote expired. Refresh it to get the current amount.
            </p>
          )}
          {quoteState === 'cancelled' && (
            <p className="text-[var(--color-muted)] sm:col-span-2">This quote was cancelled.</p>
          )}
          {quote.staleReason !== undefined && (
            <p className="text-[var(--color-muted)] sm:col-span-2">
              {STALE_REASON[quote.staleReason]}
              {canQuote ? ' Refresh it to see the current amount.' : ''}
            </p>
          )}
        </dl>
      )}
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        A quote cannot be paid: checkout is unavailable and nothing can be charged.
      </p>
      {canQuote && (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={onQuote}
            busy={busy}
            busyLabel="Working…"
            disabled={busy}
          >
            {quote === null ? 'Generate quote' : 'Refresh quote'}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The preparation as the server reports it, with nothing computed here.
 *
 * Pure: every fact on screen (territory state, minimum amount, intent status,
 * quote verdict) comes from the view, and every action is a callback, so the
 * container owns the fetch/mutation lifecycle and this component can be
 * rendered statically.
 */
export function TakeoverPreparationPanel({
  busy,
  company,
  onCancel,
  onQuote,
  onRestart,
  view,
}: PanelProps) {
  const { intent, quote, quoteState, territory, territoryState } = view;

  if (intent === null) {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          No territory is being prepared for {company.name} in this browser.
        </p>
        <Link href="/territories" className="text-sm underline">
          Choose a territory on the board
        </Link>
      </div>
    );
  }

  const territoryPresentation = describePreparationTerritory(territoryState);
  const isActive = intent.status === 'identity_ready';
  // Restart only makes sense onto a territory the server would accept.
  const canRestart =
    !isActive &&
    territory !== null &&
    (territoryState === 'available' || territoryState === 'claimed');
  // Quoting needs a live preparation and a territory the server would quote.
  const canQuote = isActive && territory !== null && territory.quoteAvailability === 'quotable';

  return (
    <div className="mt-3 space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--color-muted)]">Selected territory</dt>
          <dd className="mt-1 font-medium">
            {territory === null ? (
              <span className="font-[family-name:var(--font-mono)]">
                {intent.territoryExternalRef}
              </span>
            ) : (
              <Link href={`/territory/${territory.slug}`} className="underline">
                {territory.name}
              </Link>
            )}
            {territory !== null && (
              <span className="ml-2 text-xs tracking-wide text-[var(--color-muted)] uppercase">
                {territory.categoryName}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Company</dt>
          <dd className="mt-1 font-medium">{company.name}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Territory availability</dt>
          <dd className="mt-1">
            <StatusBadge tone={territoryPresentation.tone} label={territoryPresentation.label} />
            {territory?.currentOwner !== undefined && (
              <span className="ml-2">
                Claimed by{' '}
                <Link href={`/company/${territory.currentOwner.slug}`} className="underline">
                  {territory.currentOwner.name}
                </Link>
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Minimum takeover amount</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)]">
            {territory === null ? (
              '—'
            ) : !territory.pricingConfigured ? (
              // Zero is "no price set", not a free territory: say so rather
              // than print a currency amount nobody has decided.
              <span className="font-sans text-[var(--color-muted)]">Pricing not configured</span>
            ) : (
              `${formatMoney(territory.minimumTakeoverAmount)} ${territory.minimumTakeoverAmount.currency}`
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Preparation status</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)]">{intent.status}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Preparation expires</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)]">
            {formatAbsoluteDateTime(intent.expiresAt)}
          </dd>
        </div>
      </dl>

      {territoryState === 'missing' && (
        <Notice variant="warning" title="This territory no longer exists">
          <p>
            The reference{' '}
            <span className="font-[family-name:var(--font-mono)]">
              {intent.territoryExternalRef}
            </span>{' '}
            does not match any territory. Cancel this preparation and choose another on the{' '}
            <Link href="/territories" className="underline">
              board
            </Link>
            .
          </p>
        </Notice>
      )}
      {territoryState === 'disabled' && (
        <Notice variant="warning" title="This territory is unavailable">
          <p>
            It cannot be claimed or captured right now. Cancel this preparation and choose another
            on the{' '}
            <Link href="/territories" className="underline">
              board
            </Link>
            .
          </p>
        </Notice>
      )}
      {territoryState === 'claimed' && isActive && (
        <Notice variant="pending" title="Another company holds this territory">
          <p>
            Takeover pricing for this claimed territory is not available yet: no rule decides what
            taking it over would cost, so no quote can be issued. The territory and its owner are
            unchanged; your preparation records your interest only.
          </p>
        </Notice>
      )}

      {territory !== null &&
        (quote !== null || territory.quoteAvailability !== 'pricing_not_configured') && (
          <QuoteSection
            busy={busy}
            canQuote={canQuote}
            onQuote={onQuote}
            quote={quote}
            quoteState={quoteState}
          />
        )}

      <Notice variant="warning" title="Checkout is unavailable">
        <p>
          Payment and territory capture are not implemented. This preparation cannot charge you,
          reserve a price, or transfer ownership.
        </p>
      </Notice>

      <div className="flex flex-col gap-3 sm:flex-row">
        {isActive && (
          <Button
            variant="destructive"
            onClick={() => onCancel(intent.id)}
            busy={busy}
            busyLabel="Working…"
            disabled={busy}
          >
            Cancel preparation
          </Button>
        )}
        {canRestart && (
          <Button
            variant="secondary"
            onClick={() => onRestart(intent.territoryExternalRef)}
            busy={busy}
            busyLabel="Working…"
            disabled={busy}
          >
            Start again
          </Button>
        )}
        {!isActive && (
          <Link
            href="/territories"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium"
          >
            Choose another territory
          </Link>
        )}
      </div>
    </div>
  );
}
