import Link from 'next/link';
import {
  type TakeoverPreparationTerritoryState,
  type TakeoverPreparationView,
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

type PanelProps = {
  busy: boolean;
  company: { id: string; name: string };
  onCancel: (intentId: string) => void;
  onRestart: (territoryExternalRef: string) => void;
  view: TakeoverPreparationView;
};

/**
 * The preparation as the server reports it, with nothing computed here.
 *
 * Pure: every fact on screen (territory state, minimum amount, intent status)
 * comes from the view, and every action is a callback, so the container owns
 * the fetch/mutation lifecycle and this component can be rendered statically.
 */
export function TakeoverPreparationPanel({ busy, company, onCancel, onRestart, view }: PanelProps) {
  const { intent, territory, territoryState } = view;

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
            ) : territory.minimumTakeoverAmount.amountMinor === 0 ? (
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
            Taking it over means beating the current price, which is decided server-side at
            checkout. Preparation records your interest only.
          </p>
        </Notice>
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
