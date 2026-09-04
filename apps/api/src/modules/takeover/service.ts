import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@takeover/database';
import {
  ERROR_CODES,
  attemptStatusSchema,
  checkoutResponseSchema,
  quoteResponseSchema,
  type AttemptStatus,
  type CheckoutResponse,
  type Money,
  type QuoteResponse,
} from '@takeover/shared';
import { hashSecurityScope } from '../../security/scope-key.js';

export type Clock = { now(): Date };

export type PaymentProviderCheckoutInput = {
  amount: Money;
  checkoutId: string;
  quoteId: string;
  returnUrl: string;
};

export type PaymentProviderCheckoutResult = {
  expiresAt?: Date;
  providerCheckoutId: string;
  providerCheckoutUrl: string;
};

export type PaymentProviderRefundInput = {
  amount: Money;
  paymentId: string;
  providerPaymentId: string;
  reason: string;
};

export type PaymentProviderRefundResult = {
  providerRefundId: string;
  status: 'succeeded' | 'failed' | 'pending' | 'review';
};

export type PaymentProviderRefundLookupInput = {
  paymentId: string;
  providerPaymentId: string;
};

export type PaymentProvider = {
  name: string;
  /**
   * Implementations must be idempotent for checkoutId. Core services may retry
   * this call after reserving a checkout but before the provider URL is stored.
   */
  createCheckout(input: PaymentProviderCheckoutInput): Promise<PaymentProviderCheckoutResult>;
  refundPayment(input: PaymentProviderRefundInput): Promise<PaymentProviderRefundResult>;
  lookupRefund(
    input: PaymentProviderRefundLookupInput,
  ): Promise<PaymentProviderRefundResult | null>;
};

export type TerritoryQuoteRecord = {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  currency: string;
  id: string;
  minimumTakeoverAmountMinor: bigint;
  slug: string;
  version: bigint;
};

export type QuoteRecord = {
  companyId: string;
  consumedAt: Date | null;
  createdAt?: Date;
  currency: string;
  expiresAt: Date;
  id: string;
  minimumAmountMinor: bigint;
  observedAt?: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  territoryId: string;
  territorySlug?: string;
  territoryVersion: bigint;
};

export type QuoteForCheckoutRecord = QuoteRecord & {
  territory: TerritoryQuoteRecord;
};

export type CheckoutRecord = {
  companyId: string;
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  provider: string;
  providerCheckoutId: string;
  providerCheckoutUrl: string | null;
  quoteId: string;
  status: 'CREATED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  updatedAt: Date;
};

export type StatusAttemptRecord = {
  capture: {
    completedAt: Date | null;
    failureCode: string | null;
    newOwnerCompanyId: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  } | null;
  checkout: Pick<CheckoutRecord, 'id' | 'status' | 'updatedAt'>;
  payment: {
    amountMinor: bigint;
    confirmedAt: Date | null;
    currency: string;
    failedAt: Date | null;
    status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'RECONCILED';
  } | null;
  quote: Pick<QuoteRecord, 'expiresAt' | 'territoryVersion'>;
  reconciliation: {
    action: string;
    providerRefundReference: string | null;
    status: string;
  } | null;
  territory: { ownerCompanyId: string | null; version: bigint };
  token: { expiresAt: Date; revokedAt: Date | null };
};

export type ConfirmProviderPaymentInput = {
  amountMinor: bigint;
  checkoutId: string;
  currency: string;
  provider: string;
  providerPaymentId: string;
};

export type VerifiedProviderWebhookInput = {
  amountMinor?: bigint;
  currency?: string;
  eventType: string;
  metadata: Record<string, unknown>;
  payload: unknown;
  provider: string;
  providerCheckoutId?: string;
  providerEventId: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  signatureDigest: Uint8Array;
};

export type RefundablePaymentRecord = {
  amountMinor: bigint;
  checkoutId: string;
  currency: string;
  id: string;
  provider: string;
  providerPaymentId: string;
};

export type RefundRequestResult = {
  payment: RefundablePaymentRecord | null;
  status: StatusAttemptRecord | null;
};

export type CreateQuoteInput = {
  companyId: string;
  currency: string;
  expiresAt: Date;
  minimumAmountMinor: bigint;
  observedAt: Date;
  territoryId: string;
  territorySlug: string;
  territoryVersion: bigint;
};

export type CreateCheckoutInput = {
  checkoutId: string;
  companyId: string;
  expiresAt?: Date;
  provider: string;
  providerCheckoutId: string;
  providerCheckoutUrl: string;
  quoteId: string;
  statusTokenDigest: Uint8Array;
  statusTokenExpiresAt: Date;
};

export type ReleaseCheckoutReservationInput = {
  checkoutId: string;
  quoteId: string;
};

export type CompleteCheckoutProviderResultInput = {
  checkoutId: string;
  expiresAt?: Date;
  providerCheckoutId: string;
  providerCheckoutUrl: string;
};

export interface TakeoverRepository {
  findTerritoryForQuote(slug: string): Promise<TerritoryQuoteRecord | null>;
  findActiveQuote(input: {
    companyId: string;
    territoryId: string;
    territoryVersion: bigint;
  }): Promise<QuoteRecord | null>;
  createQuote(input: CreateQuoteInput): Promise<QuoteRecord>;
  findQuoteForCheckout(quoteId: string): Promise<QuoteForCheckoutRecord | null>;
  findCheckoutByQuote(quoteId: string): Promise<CheckoutRecord | null>;
  reserveCheckout(input: CreateCheckoutInput): Promise<{
    checkout: CheckoutRecord;
    created: boolean;
    statusTokenDigest: Uint8Array;
  }>;
  /**
   * Best-effort removal of a checkout reservation whose provider call failed
   * before any provider session could be persisted. Only a CREATED checkout
   * with no provider URL may be removed.
   */
  releaseCheckoutReservation(input: ReleaseCheckoutReservationInput): Promise<void>;
  completeCheckoutProviderResult(
    input: CompleteCheckoutProviderResultInput,
  ): Promise<CheckoutRecord>;
  confirmProviderPaymentAndCapture(
    input: ConfirmProviderPaymentInput,
  ): Promise<StatusAttemptRecord>;
  ingestVerifiedProviderWebhook(
    input: VerifiedProviderWebhookInput,
  ): Promise<StatusAttemptRecord | null>;
  beginRefundForReconciliation(paymentId: string): Promise<RefundRequestResult>;
  recordRefundRequestResult(input: {
    paymentId: string;
    providerRefundId?: string;
    status: 'succeeded' | 'failed' | 'pending' | 'review';
  }): Promise<StatusAttemptRecord>;
  recordRefundRequestFailure(input: {
    paymentId: string;
    reason: string;
    status: 'FAILED' | 'PENDING';
  }): Promise<StatusAttemptRecord>;
  // DB-level claim for refund processing
  claimRefund(paymentId: string, placeholder: string): Promise<boolean>;
  // Clear the claim placeholder (e.g., after failure or success)
  clearRefundClaim(paymentId: string, placeholder: string): Promise<void>;
  findStatusAttemptByTokenDigest(
    digest: Uint8Array,
    now: Date,
  ): Promise<StatusAttemptRecord | null>;
}

export class TakeoverTerritoryNotFoundError extends Error {
  readonly code = ERROR_CODES.TERRITORY_NOT_FOUND;
  readonly statusCode = 404;

  constructor() {
    super('Territory was not found');
    this.name = 'TakeoverTerritoryNotFoundError';
  }
}

export class TakeoverTerritoryDisabledError extends Error {
  readonly code = ERROR_CODES.TERRITORY_DISABLED;
  readonly statusCode = 409;

  constructor() {
    super('Territory is disabled');
    this.name = 'TakeoverTerritoryDisabledError';
  }
}

export class TakeoverPriceChangedError extends Error {
  readonly code = ERROR_CODES.TAKEOVER_PRICE_CHANGED;
  readonly statusCode = 409;

  constructor() {
    super('Takeover price changed');
    this.name = 'TakeoverPriceChangedError';
  }
}

export class TakeoverStaleTerritoryVersionError extends Error {
  readonly code = ERROR_CODES.STALE_TERRITORY_VERSION;
  readonly statusCode = 409;

  constructor() {
    super('Territory version is stale');
    this.name = 'TakeoverStaleTerritoryVersionError';
  }
}

export class CheckoutQuoteExpiredError extends Error {
  readonly code = ERROR_CODES.CONFLICT;
  readonly statusCode = 409;

  constructor() {
    super('Quote has expired');
    this.name = 'CheckoutQuoteExpiredError';
  }
}

export class CheckoutNotFoundError extends Error {
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly statusCode = 404;

  constructor() {
    super('Quote was not found');
    this.name = 'CheckoutNotFoundError';
  }
}

export class CheckoutCreationPendingError extends Error {
  readonly code = ERROR_CODES.CONFLICT;
  readonly statusCode = 409;

  constructor() {
    super('Checkout creation is already in progress; retry shortly');
    this.name = 'CheckoutCreationPendingError';
  }
}

export class InvalidStatusTokenError extends Error {
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly statusCode = 404;

  constructor() {
    super('Takeover status was not found');
    this.name = 'InvalidStatusTokenError';
  }
}

export class PaymentProviderRefundError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable: boolean }) {
    super(message);
    this.name = 'PaymentProviderRefundError';
    this.retryable = options.retryable;
  }
}

type TakeoverServiceDependencies = {
  clock: Clock;
  provider: PaymentProvider;
  quoteTtlSeconds?: number;
  repository: TakeoverRepository;
  statusTokenSecret: Uint8Array;
  statusTokenTtlSeconds: number;
  trustedWebOrigin: string;
  /**
   * How long a checkout request may wait for another in-flight creation of the
   * same quote to publish its provider URL before failing with a conflict.
   * Defaults cover the provider timeout (5s); tests shrink the window.
   */
  checkoutReusePollAttempts?: number;
  checkoutReusePollIntervalMs?: number;
};

function addSeconds(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1_000);
}

function safeMinorAmount(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new Error('Minor amount exceeds safe integer boundary');
  return value;
}

function mapMoney(amountMinor: bigint, currency: string): Money {
  return { amountMinor: safeMinorAmount(amountMinor), currency };
}

function mapQuote(record: QuoteRecord): QuoteResponse {
  return quoteResponseSchema.parse({
    checkoutAvailable: record.status === 'ACTIVE' && record.consumedAt === null,
    expiresAt: record.expiresAt.toISOString(),
    minimumAmount: mapMoney(record.minimumAmountMinor, record.currency),
    quoteId: record.id,
    status: record.status,
    territoryId: record.territoryId,
    territorySlug: record.territorySlug ?? '',
    territoryVersion: record.territoryVersion.toString(10),
  });
}

function issueStatusToken(secret: Uint8Array): { digest: Uint8Array; rawToken: string } {
  const rawToken = randomBytes(32).toString('base64url');
  return { digest: hashSecurityScope(secret, 'checkout-status', rawToken), rawToken };
}

function digestStatusToken(secret: Uint8Array, rawToken: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(rawToken)) return null;
  return hashSecurityScope(secret, 'checkout-status', rawToken);
}

function assertCheckoutQuoteCurrent(quote: QuoteForCheckoutRecord, now: Date): void {
  if (quote.status !== 'ACTIVE' || quote.expiresAt <= now) {
    throw new CheckoutQuoteExpiredError();
  }
  if (quote.territory.availabilityStatus === 'DISABLED') throw new TakeoverTerritoryDisabledError();
  if (quote.territory.version !== quote.territoryVersion) {
    throw new TakeoverStaleTerritoryVersionError();
  }
  if (
    quote.territory.minimumTakeoverAmountMinor !== quote.minimumAmountMinor ||
    quote.territory.currency !== quote.currency
  ) {
    throw new TakeoverPriceChangedError();
  }
}

function isTerminal(state: AttemptStatus['state'], amountCharged: Money | undefined): boolean {
  if (state === 'CAPTURED' || state === 'REFUNDED' || state === 'QUOTE_EXPIRED') return true;
  if (state === 'PAYMENT_FAILED') return amountCharged === undefined;
  return false;
}

const REFUND_CLAIM_PREFIX = 'CLAIMED_';

function refundClaimTimestamp(now: Date): string {
  return String(now.getTime()).padStart(13, '0');
}

function createRefundClaimPlaceholder(now: Date): string {
  return `${REFUND_CLAIM_PREFIX}${refundClaimTimestamp(now)}_${randomUUID()}`;
}

function isRefundClaimPlaceholder(reference: string | null | undefined): boolean {
  return typeof reference === 'string' && reference.startsWith(REFUND_CLAIM_PREFIX);
}

function hasProviderRefundReference(record: StatusAttemptRecord): boolean {
  const reference = record.reconciliation?.providerRefundReference;
  return (
    typeof reference === 'string' && reference.length > 0 && !isRefundClaimPlaceholder(reference)
  );
}

function mapAttempt(record: StatusAttemptRecord, now: Date): AttemptStatus {
  const amountCharged =
    record.payment === null
      ? undefined
      : mapMoney(record.payment.amountMinor, record.payment.currency);
  let state: AttemptStatus['state'] = 'PENDING_PAYMENT';
  let capturedAt: string | undefined;
  let newOwnerCompanyId: string | undefined;
  let failureReason: string | undefined;

  if (record.payment?.status === 'REFUNDED' || record.capture?.status === 'REFUNDED') {
    state = 'REFUNDED';
  } else if (record.capture?.status === 'COMPLETED') {
    state = 'CAPTURED';
    capturedAt = record.capture.completedAt?.toISOString();
    newOwnerCompanyId = record.capture.newOwnerCompanyId;
  } else if (record.reconciliation !== null && record.reconciliation.status === 'PENDING') {
    state =
      record.reconciliation.action === 'REFUND' && hasProviderRefundReference(record)
        ? 'REFUND_PENDING'
        : 'RECONCILIATION_REQUIRED';
  } else if (record.capture?.status === 'FAILED') {
    state = 'RECONCILIATION_REQUIRED';
    failureReason = record.capture.failureCode ?? undefined;
  } else if (record.capture?.status === 'PENDING') {
    state = 'CAPTURE_IN_PROGRESS';
  } else if (record.payment?.status === 'CONFIRMED') {
    state = 'PAYMENT_CONFIRMED';
  } else if (record.payment?.status === 'FAILED') {
    state = 'PAYMENT_FAILED';
  } else if (
    record.payment === null &&
    record.territory.version !== record.quote.territoryVersion
  ) {
    state = 'LOST_TERRITORY_RACE';
  } else if (record.payment === null && record.quote.expiresAt <= now) {
    state = 'QUOTE_EXPIRED';
  }

  return attemptStatusSchema.parse({
    ...(amountCharged === undefined ? {} : { amountCharged }),
    ...(capturedAt === undefined ? {} : { capturedAt }),
    checkoutId: record.checkout.id,
    ...(failureReason === undefined ? {} : { failureReason }),
    ...(newOwnerCompanyId === undefined ? {} : { newOwnerCompanyId }),
    pollAfterMs: isTerminal(state, amountCharged) ? undefined : 2_000,
    state,
    terminal: isTerminal(state, amountCharged),
    updatedAt: record.checkout.updatedAt.toISOString(),
  });
}

export class TakeoverService {
  private readonly quoteTtlSeconds: number;
  private readonly checkoutReusePollAttempts: number;
  private readonly checkoutReusePollIntervalMs: number;

  constructor(private readonly dependencies: TakeoverServiceDependencies) {
    if (dependencies.statusTokenSecret.byteLength < 32) {
      throw new Error('Status token secret must contain at least 32 bytes');
    }
    this.quoteTtlSeconds = dependencies.quoteTtlSeconds ?? 300;
    this.checkoutReusePollAttempts = dependencies.checkoutReusePollAttempts ?? 40;
    this.checkoutReusePollIntervalMs = dependencies.checkoutReusePollIntervalMs ?? 150;
  }

  async createQuote(input: { companyId: string; territorySlug: string }): Promise<QuoteResponse> {
    const now = this.dependencies.clock.now();
    const territory = await this.dependencies.repository.findTerritoryForQuote(input.territorySlug);
    if (territory === null) throw new TakeoverTerritoryNotFoundError();
    if (territory.availabilityStatus === 'DISABLED') throw new TakeoverTerritoryDisabledError();

    const existing = await this.dependencies.repository.findActiveQuote({
      companyId: input.companyId,
      territoryId: territory.id,
      territoryVersion: territory.version,
    });
    if (
      existing !== null &&
      existing.expiresAt > now &&
      existing.minimumAmountMinor === territory.minimumTakeoverAmountMinor &&
      existing.currency === territory.currency
    ) {
      return mapQuote({ ...existing, territorySlug: territory.slug });
    }

    const quote = await this.dependencies.repository.createQuote({
      companyId: input.companyId,
      currency: territory.currency,
      expiresAt: addSeconds(now, this.quoteTtlSeconds),
      minimumAmountMinor: territory.minimumTakeoverAmountMinor,
      observedAt: now,
      territoryId: territory.id,
      territorySlug: territory.slug,
      territoryVersion: territory.version,
    });
    return mapQuote({ ...quote, territorySlug: territory.slug });
  }

  async createCheckout(input: { companyId: string; quoteId: string }): Promise<CheckoutResponse> {
    const now = this.dependencies.clock.now();
    const quote = await this.dependencies.repository.findQuoteForCheckout(input.quoteId);
    if (quote === null) throw new CheckoutNotFoundError();
    if (quote.companyId !== input.companyId) throw new CheckoutNotFoundError();
    assertCheckoutQuoteCurrent(quote, now);

    // The provider must observe at most one creation call per quote: either
    // this request reserves a fresh checkout, or it waits for the winner to
    // publish the provider URL. A reused reservation without a URL is another
    // in-flight creation — re-calling the provider here would hand two clients
    // two live payment sessions for one intent.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = issueStatusToken(this.dependencies.statusTokenSecret);
      const checkoutId = randomUUID();
      const reserved = await this.dependencies.repository.reserveCheckout({
        checkoutId,
        companyId: input.companyId,
        provider: this.dependencies.provider.name,
        providerCheckoutId: checkoutId,
        providerCheckoutUrl: '',
        quoteId: quote.id,
        statusTokenDigest: token.digest,
        statusTokenExpiresAt: addSeconds(now, this.dependencies.statusTokenTtlSeconds),
      });

      if (reserved.created) {
        try {
          const amount = mapMoney(quote.minimumAmountMinor, quote.currency);
          const providerCheckout = await this.dependencies.provider.createCheckout({
            amount,
            checkoutId: reserved.checkout.id,
            quoteId: quote.id,
            returnUrl: `${this.dependencies.trustedWebOrigin}/takeover/${token.rawToken}`,
          });
          const checkout = await this.dependencies.repository.completeCheckoutProviderResult({
            checkoutId: reserved.checkout.id,
            ...(providerCheckout.expiresAt === undefined
              ? {}
              : { expiresAt: providerCheckout.expiresAt }),
            providerCheckoutId: providerCheckout.providerCheckoutId,
            providerCheckoutUrl: providerCheckout.providerCheckoutUrl,
          });
          return checkoutResponseSchema.parse({
            checkoutId: checkout.id,
            providerCheckoutUrl: checkout.providerCheckoutUrl,
            statusToken: token.rawToken,
          });
        } catch (error) {
          // The provider never returned a payable session for this
          // reservation, so release it and let a retry start over.
          await this.dependencies.repository
            .releaseCheckoutReservation({
              checkoutId: reserved.checkout.id,
              quoteId: quote.id,
            })
            .catch(() => undefined);
          throw error;
        }
      }

      if (reserved.checkout.providerCheckoutUrl !== null) {
        return checkoutResponseSchema.parse({
          checkoutId: reserved.checkout.id,
          providerCheckoutUrl: reserved.checkout.providerCheckoutUrl,
          statusToken: token.rawToken,
        });
      }

      const poll = await this.pollForReservedCheckoutUrl(quote.id);
      if (poll.kind === 'ready') {
        return checkoutResponseSchema.parse({
          checkoutId: poll.checkout.id,
          providerCheckoutUrl: poll.checkout.providerCheckoutUrl,
          statusToken: token.rawToken,
        });
      }
      if (poll.kind === 'vanished') continue;
      throw new CheckoutCreationPendingError();
    }
    throw new CheckoutCreationPendingError();
  }

  private async pollForReservedCheckoutUrl(
    quoteId: string,
  ): Promise<{ kind: 'pending' } | { kind: 'vanished' } | { checkout: CheckoutRecord; kind: 'ready' }> {
    for (let poll = 0; poll < this.checkoutReusePollAttempts; poll += 1) {
      const row = await this.dependencies.repository.findCheckoutByQuote(quoteId);
      if (row === null) return { kind: 'vanished' };
      if (row.providerCheckoutUrl !== null) return { checkout: row, kind: 'ready' };
      if (poll + 1 < this.checkoutReusePollAttempts) {
        await new Promise((resolve) => setTimeout(resolve, this.checkoutReusePollIntervalMs));
      }
    }
    return { kind: 'pending' };
  }

  async getStatus(rawToken: string): Promise<AttemptStatus> {
    const now = this.dependencies.clock.now();
    const digest = digestStatusToken(this.dependencies.statusTokenSecret, rawToken);
    if (digest === null) throw new InvalidStatusTokenError();
    const attempt = await this.dependencies.repository.findStatusAttemptByTokenDigest(digest, now);
    if (attempt === null || attempt.token.expiresAt <= now || attempt.token.revokedAt !== null) {
      throw new InvalidStatusTokenError();
    }
    return mapAttempt(attempt, now);
  }

  async confirmProviderPayment(input: ConfirmProviderPaymentInput): Promise<AttemptStatus> {
    const attempt = await this.dependencies.repository.confirmProviderPaymentAndCapture(input);
    return mapAttempt(attempt, this.dependencies.clock.now());
  }

  async processVerifiedProviderWebhook(
    input: VerifiedProviderWebhookInput,
  ): Promise<AttemptStatus | undefined> {
    const attempt = await this.dependencies.repository.ingestVerifiedProviderWebhook(input);
    return attempt === null ? undefined : mapAttempt(attempt, this.dependencies.clock.now());
  }

  async requestRefundForReconciliation(paymentId: string): Promise<AttemptStatus | undefined> {
    // Begin refund preparation with retry on transaction conflicts (P2034)
    let prepared;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        prepared = await this.dependencies.repository.beginRefundForReconciliation(paymentId);
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          // Retryable transaction conflict, try again
          continue;
        }
        throw error;
      }
    }
    if (!prepared) throw new Error('Failed to prepare refund after retries');
    if (prepared.status !== null && prepared.payment === null) {
      return mapAttempt(prepared.status, this.dependencies.clock.now());
    }
    if (prepared.payment === null) return undefined;

    const claimPlaceholder = createRefundClaimPlaceholder(this.dependencies.clock.now());
    const claimed = await this.dependencies.repository.claimRefund(
      prepared.payment.id,
      claimPlaceholder,
    );
    if (!claimed) {
      // Claim failed: another instance may have already claimed the refund.
      // To avoid duplicate provider refunds, check if a refund already exists.
      try {
        const existing = await this.dependencies.provider.lookupRefund({
          paymentId: prepared.payment.id,
          providerPaymentId: prepared.payment.providerPaymentId,
        });
        if (existing !== null) {
          const attempt = await this.dependencies.repository.recordRefundRequestResult({
            paymentId: prepared.payment.id,
            providerRefundId: existing.providerRefundId,
            status: existing.status,
          });
          return mapAttempt(attempt, this.dependencies.clock.now());
        }
      } catch {
        // Inconclusive lookup: do not issue another provider refund from an unclaimed worker.
      }
      // Record a pending refund request result for the current payment
      const attempt = await this.dependencies.repository.recordRefundRequestResult({
        paymentId: prepared.payment.id,
        // providerRefundId omitted
        status: 'pending',
      });
      return mapAttempt(attempt, this.dependencies.clock.now());
    }

    try {
      // After successfully claiming the refund placeholder, double‑check the provider
      // for any existing refund (e.g., a race where another instance already issued it).
      const existing = await this.dependencies.provider.lookupRefund({
        paymentId: prepared.payment.id,
        providerPaymentId: prepared.payment.providerPaymentId,
      });
      const refund =
        existing ??
        (await this.dependencies.provider.refundPayment({
          amount: mapMoney(prepared.payment.amountMinor, prepared.payment.currency),
          paymentId: prepared.payment.id,
          providerPaymentId: prepared.payment.providerPaymentId,
          reason: 'Takeover ownership capture could not be completed safely',
        }));

      const attempt = await this.dependencies.repository.recordRefundRequestResult({
        paymentId: prepared.payment.id,
        providerRefundId: refund.providerRefundId,
        status: refund.status,
      });
      return mapAttempt(attempt, this.dependencies.clock.now());
    } catch (error) {
      if (error instanceof PaymentProviderRefundError && !error.retryable) {
        await this.dependencies.repository.clearRefundClaim(prepared.payment.id, claimPlaceholder);
      }
      const attempt = await this.dependencies.repository.recordRefundRequestFailure({
        paymentId: prepared.payment.id,
        reason: error instanceof Error ? error.message : 'Refund request failed',
        status:
          error instanceof PaymentProviderRefundError && !error.retryable ? 'FAILED' : 'PENDING',
      });
      return mapAttempt(attempt, this.dependencies.clock.now());
    }
  }
}
