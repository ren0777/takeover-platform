import { type AttemptState, type AttemptStatus } from '@takeover/shared';
import { type BadgeTone } from '@/components/ui/status-badge';

/**
 * How one authoritative attempt state is presented.
 *
 * Pure and table-driven, like `describeIdentityError`: the whole takeover
 * matrix is data, so it is testable without rendering anything, and adding a
 * state to the shared enum fails the type check here rather than falling
 * through to a default that would say something untrue about money.
 *
 * The table describes the state alone. Anything that depends on the server's
 * `terminal` flag — polling, restarting — is computed from the status below,
 * never guessed from the state name.
 */
export type AttemptPresentation = {
  /** Short badge label. Always text: state is never carried by colour alone. */
  badgeLabel: string;
  tone: BadgeTone;
  title: string;
  body: string;
  /**
   * True for exactly one state. Nothing else may claim ownership changed, and
   * no browser event may set it.
   */
  ownershipTransferred: boolean;
  /**
   * The payer's money may still be unresolved in this state, so the UI must
   * not offer any action that could charge again.
   */
  moneyMayBeOutstanding: boolean;
  /** Show the attempt reference for support. */
  showSupportReference: boolean;
};

const PRESENTATION: Record<AttemptState, AttemptPresentation> = {
  QUOTE_ACTIVE: {
    badgeLabel: 'Quote active',
    tone: 'info',
    title: 'Ready to take over',
    body: 'This quote is current. Nothing has been charged yet.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: false,
    showSupportReference: false,
  },
  CHECKOUT_CREATED: {
    badgeLabel: 'Checkout open',
    tone: 'info',
    title: 'Checkout is open with our payment provider',
    body: 'Complete the payment in the provider’s checkout. Nothing has been charged yet.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: false,
    showSupportReference: false,
  },
  PENDING_PAYMENT: {
    badgeLabel: 'Payment pending',
    tone: 'warning',
    title: 'Payment is being confirmed',
    body: 'Our payment provider has not confirmed this payment yet. The territory has not changed hands.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: false,
  },
  PAYMENT_CONFIRMED: {
    badgeLabel: 'Payment confirmed',
    tone: 'warning',
    title: 'Payment confirmed — the territory has not moved yet',
    body: 'The payment is confirmed. Transferring the territory is a separate step that has not run yet, so you do not own it yet.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: false,
  },
  CAPTURE_IN_PROGRESS: {
    badgeLabel: 'Transferring',
    tone: 'warning',
    title: 'Transferring the territory',
    body: 'The transfer is running now. It is not complete, and it can still fail.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: false,
  },
  CAPTURED: {
    badgeLabel: 'Captured',
    tone: 'positive',
    title: 'You captured this territory',
    body: 'The transfer is committed on our side. You are the current owner.',
    ownershipTransferred: true,
    moneyMayBeOutstanding: false,
    showSupportReference: false,
  },
  CAPTURE_FAILED: {
    badgeLabel: 'Transfer failed',
    tone: 'danger',
    title: 'Your payment went through but the territory could not be transferred',
    body: 'You have not lost the money. This attempt is recorded and is being resolved — do not pay again.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: true,
  },
  QUOTE_EXPIRED: {
    badgeLabel: 'Quote expired',
    tone: 'neutral',
    title: 'This quote expired',
    body: 'Nothing was charged. Prices can move while a quote sits open, so taking over needs a fresh quote.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: false,
    showSupportReference: false,
  },
  PAYMENT_FAILED: {
    badgeLabel: 'Payment failed',
    tone: 'danger',
    title: 'The payment did not go through',
    body: 'Our payment provider did not complete this payment, and no territory changed hands.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: false,
    showSupportReference: true,
  },
  LOST_TERRITORY_RACE: {
    badgeLabel: 'Not captured',
    tone: 'danger',
    title: 'Another company captured this territory first',
    body: 'Your payment was still being confirmed when someone else captured it, so you did not capture it. Your money is being resolved — do not pay again.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: true,
  },
  RECONCILIATION_REQUIRED: {
    badgeLabel: 'Under review',
    tone: 'danger',
    title: 'This attempt needs manual review',
    body: 'Something went wrong that we will not resolve automatically. The attempt is recorded and a person is working through it.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: true,
  },
  REFUND_PENDING: {
    badgeLabel: 'Refund started',
    tone: 'warning',
    title: 'A refund has been started',
    body: 'The refund has been requested. Our payment provider has not confirmed it yet.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: true,
    showSupportReference: true,
  },
  REFUNDED: {
    badgeLabel: 'Refunded',
    tone: 'neutral',
    title: 'This attempt was refunded',
    body: 'The refund is confirmed. No territory changed hands.',
    ownershipTransferred: false,
    moneyMayBeOutstanding: false,
    showSupportReference: true,
  },
};

export function describeAttemptState(state: AttemptState): AttemptPresentation {
  return PRESENTATION[state];
}

/**
 * Whether the surface should keep refetching.
 *
 * The server's `terminal` flag is the only input. The frontend never decides
 * for itself that an attempt has settled.
 */
export function shouldPoll(status: AttemptStatus): boolean {
  return !status.terminal;
}

/**
 * Whether a fresh takeover may be started from this attempt.
 *
 * Requires all three: the server says the attempt is settled, no money may
 * still be outstanding, and ownership did not transfer. Anything else could
 * charge a second time for one takeover, or offer to re-buy something already
 * owned. A restart always begins from a new quote — never a stored amount.
 */
export function canStartNewCheckout(status: AttemptStatus): boolean {
  const presentation = describeAttemptState(status.state);
  return (
    status.terminal && !presentation.moneyMayBeOutstanding && !presentation.ownershipTransferred
  );
}
