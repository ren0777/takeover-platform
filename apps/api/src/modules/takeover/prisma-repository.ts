import { getDatabaseClient, Prisma, type PrismaClient } from '@takeover/database';
import {
  createTerritoryOwnershipTransactionClient,
  PrismaTerritoryOwnershipRepository,
} from '../territories/prisma-repository.js';
import {
  OwnershipConflictError,
  StaleTerritoryVersionError,
  TerritoryDisabledError,
} from '../territories/domain.js';
import type {
  CheckoutRecord,
  CompleteCheckoutProviderResultInput,
  ConfirmProviderPaymentInput,
  CreateCheckoutInput,
  CreateQuoteInput,
  QuoteForCheckoutRecord,
  QuoteRecord,
  StatusAttemptRecord,
  TakeoverRepository,
  TerritoryQuoteRecord,
  VerifiedProviderWebhookInput,
  RefundRequestResult,
} from './service.js';

type TakeoverPrismaClient = Pick<
  PrismaClient,
  | '$queryRaw'
  | '$transaction'
  | 'checkoutSession'
  | 'checkoutStatusToken'
  | 'ownershipCapture'
  | 'payment'
  | 'paymentReconciliationAction'
  | 'takeoverQuote'
  | 'territory'
  | 'territoryOwnership'
>;

type TakeoverTransactionClient = Prisma.TransactionClient;

type QuoteLockRow = { id: string };

type ProviderPaymentTransitionRecord = {
  amountMinor: bigint;
  checkoutId: string;
  currency: string;
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'RECONCILED';
};

const REFUND_CLAIM_PREFIX = 'CLAIMED_';
const REFUND_CLAIM_LEASE_MS = 5 * 60 * 1_000;

function isRefundClaimPlaceholder(reference: string | null): boolean {
  return typeof reference === 'string' && reference.startsWith(REFUND_CLAIM_PREFIX);
}

function staleRefundClaimCutoff(placeholder: string): string | null {
  if (!placeholder.startsWith(REFUND_CLAIM_PREFIX)) return null;
  const timestamp = Number(placeholder.slice(REFUND_CLAIM_PREFIX.length, 21));
  if (!Number.isSafeInteger(timestamp)) return null;
  return `${REFUND_CLAIM_PREFIX}${String(timestamp - REFUND_CLAIM_LEASE_MS).padStart(13, '0')}_~`;
}

function mapTerritory(row: {
  availabilityStatus: 'ACTIVE' | 'DISABLED';
  currency: string;
  id: string;
  minimumTakeoverAmountMinor: bigint;
  slug: string;
  version: bigint;
}): TerritoryQuoteRecord {
  return row;
}

function mapQuote(
  row: {
    companyId: string;
    consumedAt: Date | null;
    createdAt: Date;
    currency: string;
    expiresAt: Date;
    id: string;
    minimumAmountMinor: bigint;
    observedAt: Date;
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    territoryId: string;
    territoryVersion: bigint;
  },
  territorySlug?: string,
): QuoteRecord {
  return {
    companyId: row.companyId,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
    currency: row.currency,
    expiresAt: row.expiresAt,
    id: row.id,
    minimumAmountMinor: row.minimumAmountMinor,
    observedAt: row.observedAt,
    status: row.status,
    territoryId: row.territoryId,
    ...(territorySlug === undefined ? {} : { territorySlug }),
    territoryVersion: row.territoryVersion,
  };
}

function mapCheckout(row: {
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
}): CheckoutRecord {
  return row;
}

function isUniqueActiveQuoteError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2002';
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function requireStatusAttempt(attempt: StatusAttemptRecord | null): StatusAttemptRecord {
  if (attempt === null) throw new Error('Takeover attempt status could not be loaded');
  return attempt;
}

export class PrismaTakeoverRepository implements TakeoverRepository {
  constructor(private readonly prisma: TakeoverPrismaClient = getDatabaseClient()) {}

  async findTerritoryForQuote(slug: string): Promise<TerritoryQuoteRecord | null> {
    const territory = await this.prisma.territory.findUnique({
      select: {
        availabilityStatus: true,
        currency: true,
        id: true,
        minimumTakeoverAmountMinor: true,
        slug: true,
        version: true,
      },
      where: { slug },
    });
    return territory === null ? null : mapTerritory(territory);
  }

  async findActiveQuote(input: {
    companyId: string;
    territoryId: string;
    territoryVersion: bigint;
  }): Promise<QuoteRecord | null> {
    const quote = await this.prisma.takeoverQuote.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        companyId: input.companyId,
        status: 'ACTIVE',
        territoryId: input.territoryId,
        territoryVersion: input.territoryVersion,
      },
    });
    return quote === null ? null : mapQuote(quote);
  }

  async createQuote(input: CreateQuoteInput): Promise<QuoteRecord> {
    try {
      const quote = await this.prisma.takeoverQuote.create({
        data: {
          companyId: input.companyId,
          currency: input.currency,
          expiresAt: input.expiresAt,
          minimumAmountMinor: input.minimumAmountMinor,
          observedAt: input.observedAt,
          status: 'ACTIVE',
          territoryId: input.territoryId,
          territoryVersion: input.territoryVersion,
        },
      });
      return mapQuote(quote, input.territorySlug);
    } catch (error) {
      if (!isUniqueActiveQuoteError(error)) throw error;
      const existing = await this.findActiveQuote({
        companyId: input.companyId,
        territoryId: input.territoryId,
        territoryVersion: input.territoryVersion,
      });
      if (existing === null) throw error;
      return { ...existing, territorySlug: input.territorySlug };
    }
  }

  async findQuoteForCheckout(quoteId: string): Promise<QuoteForCheckoutRecord | null> {
    const quote = await this.prisma.takeoverQuote.findUnique({ where: { id: quoteId } });
    if (quote === null) return null;
    const territory = await this.prisma.territory.findUnique({
      select: {
        availabilityStatus: true,
        currency: true,
        id: true,
        minimumTakeoverAmountMinor: true,
        slug: true,
        version: true,
      },
      where: { id: quote.territoryId },
    });
    if (territory === null) return null;
    return { ...mapQuote(quote, territory.slug), territory: mapTerritory(territory) };
  }

  async findCheckoutByQuote(quoteId: string): Promise<CheckoutRecord | null> {
    const checkout = await this.prisma.checkoutSession.findFirst({
      orderBy: { createdAt: 'asc' },
      where: { quoteId, status: { in: ['CREATED', 'PENDING', 'COMPLETED'] } },
    });
    return checkout === null ? null : mapCheckout(checkout);
  }

  async reserveCheckout(input: CreateCheckoutInput): Promise<{
    checkout: CheckoutRecord;
    created: boolean;
    statusTokenDigest: Uint8Array;
  }> {
    return this.prisma.$transaction(async (transaction) => {
      const [locked] = await transaction.$queryRaw<QuoteLockRow[]>(Prisma.sql`
        SELECT "id"
        FROM "takeover_quotes"
        WHERE "id" = ${input.quoteId}::uuid
        FOR UPDATE
      `);
      if (locked === undefined) throw new Error('Quote was not found');

      const existing = await transaction.checkoutSession.findFirst({
        orderBy: { createdAt: 'asc' },
        where: { quoteId: input.quoteId, status: { in: ['CREATED', 'PENDING', 'COMPLETED'] } },
      });
      if (existing !== null) {
        await transaction.checkoutStatusToken.create({
          data: {
            checkoutId: existing.id,
            expiresAt: input.statusTokenExpiresAt,
            tokenDigest: Buffer.from(input.statusTokenDigest),
          },
        });
        return {
          checkout: mapCheckout(existing),
          created: false,
          statusTokenDigest: input.statusTokenDigest,
        };
      }

      const checkout = await transaction.checkoutSession.create({
        data: {
          companyId: input.companyId,
          ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
          provider: input.provider,
          providerCheckoutId: input.providerCheckoutId,
          quoteId: input.quoteId,
          status: 'CREATED',
        },
      });
      await transaction.checkoutStatusToken.create({
        data: {
          checkoutId: checkout.id,
          expiresAt: input.statusTokenExpiresAt,
          tokenDigest: Buffer.from(input.statusTokenDigest),
        },
      });
      await transaction.takeoverQuote.update({
        data: { consumedAt: new Date() },
        where: { id: input.quoteId },
      });
      return {
        checkout: mapCheckout(checkout),
        created: true,
        statusTokenDigest: input.statusTokenDigest,
      };
    });
  }

  async completeCheckoutProviderResult(
    input: CompleteCheckoutProviderResultInput,
  ): Promise<CheckoutRecord> {
    const checkout = await this.prisma.checkoutSession.update({
      data: {
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
        providerCheckoutId: input.providerCheckoutId,
        providerCheckoutUrl: input.providerCheckoutUrl,
        status: 'PENDING',
      },
      where: { id: input.checkoutId },
    });
    return mapCheckout(checkout);
  }

  async releaseCheckoutReservation(input: {
    checkoutId: string;
    quoteId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.checkoutStatusToken.deleteMany({
        where: { checkoutId: input.checkoutId },
      });
      await transaction.checkoutSession.deleteMany({
        where: {
          id: input.checkoutId,
          providerCheckoutUrl: null,
          quoteId: input.quoteId,
          status: 'CREATED',
        },
      });
    });
  }

  async confirmProviderPaymentAndCapture(
    input: ConfirmProviderPaymentInput,
  ): Promise<StatusAttemptRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.confirmProviderPaymentAndCaptureOnce(input);
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === 2) throw error;
      }
    }
    throw new Error('Unreachable payment confirmation retry state');
  }

  private async confirmProviderPaymentAndCaptureOnce(
    input: ConfirmProviderPaymentInput,
  ): Promise<StatusAttemptRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        return this.confirmProviderPaymentAndCaptureInTransaction(transaction, input);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async ingestVerifiedProviderWebhook(
    input: VerifiedProviderWebhookInput,
  ): Promise<StatusAttemptRecord | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.ingestVerifiedProviderWebhookOnce(input);
      } catch (error) {
        if (isUniqueConstraintError(error)) return null;
        if (!isRetryableTransactionError(error) || attempt === 2) throw error;
      }
    }
    throw new Error('Unreachable webhook ingestion retry state');
  }

  private async ingestVerifiedProviderWebhookOnce(
    input: VerifiedProviderWebhookInput,
  ): Promise<StatusAttemptRecord | null> {
    return this.prisma.$transaction(
      async (transaction) => {
        const event = await transaction.paymentWebhookEvent.create({
          data: {
            payload: input.payload as Prisma.InputJsonValue,
            provider: input.provider,
            providerEventId: input.providerEventId,
            signatureDigest: Buffer.from(input.signatureDigest),
          },
        });

        if (input.eventType.startsWith('refund.')) {
          return this.ingestVerifiedRefundWebhookInTransaction(transaction, event.id, input);
        }

        if (input.providerCheckoutId === undefined) {
          await transaction.paymentWebhookEvent.update({
            data: { errorCode: 'MISSING_CHECKOUT_SESSION_ID', processingStatus: 'FAILED' },
            where: { id: event.id },
          });
          return null;
        }

        const checkout = await transaction.checkoutSession.findUnique({
          where: {
            provider_providerCheckoutId: {
              provider: input.provider,
              providerCheckoutId: input.providerCheckoutId,
            },
          },
        });
        if (checkout === null) {
          await transaction.paymentWebhookEvent.update({
            data: { errorCode: 'UNKNOWN_CHECKOUT', processingStatus: 'FAILED' },
            where: { id: event.id },
          });
          return null;
        }

        const quote = await transaction.takeoverQuote.findUnique({
          where: { id: checkout.quoteId },
        });
        if (quote === null) throw new Error('Quote was not found');

        if (input.providerPaymentId === undefined) {
          await transaction.paymentWebhookEvent.update({
            data: { errorCode: 'MISSING_PAYMENT_ID', processingStatus: 'FAILED' },
            where: { id: event.id },
          });
          return null;
        }

        const existingPaymentOutcome = await this.resolveExistingProviderPaymentEvent(transaction, {
          checkoutId: checkout.id,
          eventId: event.id,
          eventType: input.eventType,
          ...(input.amountMinor === undefined ? {} : { amountMinor: input.amountMinor }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
        });
        if (existingPaymentOutcome !== null) return existingPaymentOutcome;

        if (
          input.eventType !== 'payment.succeeded' ||
          input.amountMinor === undefined ||
          input.currency === undefined
        ) {
          const payment =
            input.amountMinor === undefined || input.currency === undefined
              ? null
              : await transaction.payment.upsert({
                  create: {
                    amountMinor: input.amountMinor,
                    checkoutId: checkout.id,
                    currency: input.currency,
                    failedAt: new Date(),
                    provider: input.provider,
                    providerPaymentId: input.providerPaymentId,
                    status: 'FAILED',
                  },
                  update: {
                    failedAt: new Date(),
                    status: 'FAILED',
                  },
                  where: {
                    provider_providerPaymentId: {
                      provider: input.provider,
                      providerPaymentId: input.providerPaymentId,
                    },
                  },
                });
          await transaction.paymentWebhookEvent.update({
            data: {
              ...(payment === null ? {} : { paymentId: payment.id }),
              processedAt: new Date(),
              processingStatus: 'IGNORED',
            },
            where: { id: event.id },
          });
          return requireStatusAttempt(
            await this.findStatusAttemptByCheckoutId(transaction, checkout.id),
          );
        }

        const metadataError = this.metadataMismatch(input.metadata, {
          amountMinor: quote.minimumAmountMinor,
          checkoutId: checkout.id,
          currency: quote.currency,
          quoteId: quote.id,
        });
        const moneyError =
          input.amountMinor !== quote.minimumAmountMinor || input.currency !== quote.currency
            ? 'MONEY_MISMATCH'
            : null;
        const reconciliationReason = metadataError ?? moneyError;
        if (reconciliationReason !== null) {
          const existingPayment = await this.findProviderPayment(transaction, {
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
          });
          if (existingPayment !== null) {
            return this.reconcileExistingProviderPaymentEvent(transaction, {
              eventId: event.id,
              payment: existingPayment,
              reason: reconciliationReason,
            });
          }
          const payment = await transaction.payment.upsert({
            create: {
              amountMinor: input.amountMinor,
              checkoutId: checkout.id,
              currency: input.currency,
              provider: input.provider,
              providerPaymentId: input.providerPaymentId,
              status: 'RECONCILED',
            },
            update: {
              status: 'RECONCILED',
            },
            where: {
              provider_providerPaymentId: {
                provider: input.provider,
                providerPaymentId: input.providerPaymentId,
              },
            },
          });
          await transaction.paymentReconciliationAction.upsert({
            create: {
              action: 'RECONCILE',
              paymentId: payment.id,
              reason: reconciliationReason,
              requestedByActorType: 'SYSTEM',
              status: 'PENDING',
            },
            update: {},
            where: { paymentId_action: { action: 'RECONCILE', paymentId: payment.id } },
          });
          await transaction.paymentWebhookEvent.update({
            data: {
              errorCode: reconciliationReason,
              paymentId: payment.id,
              processedAt: new Date(),
              processingStatus: 'RECONCILED',
            },
            where: { id: event.id },
          });
          return requireStatusAttempt(
            await this.findStatusAttemptByCheckoutId(transaction, checkout.id),
          );
        }

        const attempt = await this.confirmProviderPaymentAndCaptureInTransaction(transaction, {
          amountMinor: input.amountMinor,
          checkoutId: checkout.id,
          currency: input.currency,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
        });
        const payment = await transaction.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: input.provider,
              providerPaymentId: input.providerPaymentId,
            },
          },
        });
        await transaction.paymentWebhookEvent.update({
          data: {
            ...(payment === null ? {} : { paymentId: payment.id }),
            processedAt: new Date(),
            processingStatus: 'PROCESSED',
          },
          where: { id: event.id },
        });
        return attempt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async ingestVerifiedRefundWebhookInTransaction(
    transaction: TakeoverTransactionClient,
    eventId: string,
    input: VerifiedProviderWebhookInput,
  ): Promise<StatusAttemptRecord | null> {
    if (input.providerPaymentId === undefined) {
      await transaction.paymentWebhookEvent.update({
        data: { errorCode: 'MISSING_PAYMENT_ID', processingStatus: 'FAILED' },
        where: { id: eventId },
      });
      return null;
    }
    const payment = await transaction.payment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
        },
      },
    });
    if (payment === null) {
      await transaction.paymentWebhookEvent.update({
        data: { errorCode: 'UNKNOWN_PAYMENT', processingStatus: 'FAILED' },
        where: { id: eventId },
      });
      return null;
    }
    const capture = await transaction.ownershipCapture.findUnique({
      where: { paymentId: payment.id },
    });
    if (capture?.status === 'COMPLETED') {
      await transaction.paymentWebhookEvent.update({
        data: {
          errorCode: 'REFUND_FOR_CAPTURED_PAYMENT',
          paymentId: payment.id,
          processedAt: new Date(),
          processingStatus: 'RECONCILED',
        },
        where: { id: eventId },
      });
      await transaction.paymentReconciliationAction.upsert({
        create: {
          action: 'RECONCILE',
          paymentId: payment.id,
          reason: 'REFUND_FOR_CAPTURED_PAYMENT',
          requestedByActorType: 'SYSTEM',
          status: 'PENDING',
        },
        update: {},
        where: { paymentId_action: { action: 'RECONCILE', paymentId: payment.id } },
      });
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
      );
    }

    const moneyMismatch =
      (input.amountMinor !== undefined && input.amountMinor !== payment.amountMinor) ||
      (input.currency !== undefined && input.currency !== payment.currency);
    if (moneyMismatch) {
      await transaction.paymentWebhookEvent.update({
        data: {
          errorCode: 'REFUND_MONEY_MISMATCH',
          paymentId: payment.id,
          processedAt: new Date(),
          processingStatus: 'RECONCILED',
        },
        where: { id: eventId },
      });
      await transaction.paymentReconciliationAction.upsert({
        create: {
          action: 'RECONCILE',
          paymentId: payment.id,
          reason: 'REFUND_MONEY_MISMATCH',
          requestedByActorType: 'SYSTEM',
          status: 'PENDING',
        },
        update: {},
        where: { paymentId_action: { action: 'RECONCILE', paymentId: payment.id } },
      });
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
      );
    }

    if (input.eventType === 'refund.succeeded') {
      await transaction.payment.update({
        data: { status: 'REFUNDED' },
        where: { id: payment.id },
      });
      if (capture) {
        await transaction.ownershipCapture.update({
          data: { status: 'REFUNDED' },
          where: { id: capture.id },
        });
      }
      await transaction.paymentReconciliationAction.upsert({
        create: {
          action: 'REFUND',
          paymentId: payment.id,
          ...(input.providerRefundId === undefined
            ? {}
            : { providerRefundReference: input.providerRefundId }),
          reason: 'REFUND_SUCCEEDED',
          requestedByActorType: 'SYSTEM',
          status: 'COMPLETED',
        },
        update: {
          ...(input.providerRefundId === undefined
            ? {}
            : { providerRefundReference: input.providerRefundId }),
          reason: 'REFUND_SUCCEEDED',
          status: 'COMPLETED',
        },
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      });
      await transaction.paymentWebhookEvent.update({
        data: {
          paymentId: payment.id,
          processedAt: new Date(),
          processingStatus: 'PROCESSED',
        },
        where: { id: eventId },
      });
    } else if (input.eventType === 'refund.failed') {
      await transaction.paymentReconciliationAction.upsert({
        create: {
          action: 'REFUND',
          paymentId: payment.id,
          ...(input.providerRefundId === undefined
            ? {}
            : { providerRefundReference: input.providerRefundId }),
          reason: 'REFUND_FAILED',
          requestedByActorType: 'SYSTEM',
          status: 'FAILED',
        },
        update: {
          ...(input.providerRefundId === undefined
            ? {}
            : { providerRefundReference: input.providerRefundId }),
          reason: 'REFUND_FAILED',
          status: 'FAILED',
        },
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      });
      await transaction.paymentWebhookEvent.update({
        data: {
          paymentId: payment.id,
          processedAt: new Date(),
          processingStatus: 'PROCESSED',
        },
        where: { id: eventId },
      });
    } else {
      await transaction.paymentWebhookEvent.update({
        data: {
          paymentId: payment.id,
          processedAt: new Date(),
          processingStatus: 'IGNORED',
        },
        where: { id: eventId },
      });
    }
    return requireStatusAttempt(
      await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
    );
  }

  private metadataMismatch(
    metadata: Record<string, unknown>,
    expected: { amountMinor: bigint; checkoutId: string; currency: string; quoteId: string },
  ): string | null {
    if (typeof metadata.checkout_id === 'string' && metadata.checkout_id !== expected.checkoutId) {
      return 'METADATA_MISMATCH';
    }
    if (typeof metadata.quote_id === 'string' && metadata.quote_id !== expected.quoteId) {
      return 'METADATA_MISMATCH';
    }
    if (typeof metadata.currency === 'string' && metadata.currency !== expected.currency) {
      return 'METADATA_MISMATCH';
    }
    if (
      typeof metadata.amount_minor === 'number' &&
      Number.isSafeInteger(metadata.amount_minor) &&
      BigInt(metadata.amount_minor) !== expected.amountMinor
    ) {
      return 'METADATA_MISMATCH';
    }
    return null;
  }

  private async findProviderPayment(
    transaction: TakeoverTransactionClient,
    input: { provider: string; providerPaymentId: string },
  ): Promise<ProviderPaymentTransitionRecord | null> {
    return transaction.payment.findUnique({
      select: {
        amountMinor: true,
        checkoutId: true,
        currency: true,
        id: true,
        status: true,
      },
      where: {
        provider_providerPaymentId: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
        },
      },
    });
  }

  private providerPaymentMismatch(
    payment: ProviderPaymentTransitionRecord,
    input: { amountMinor?: bigint; checkoutId: string; currency?: string },
  ): boolean {
    return (
      payment.checkoutId !== input.checkoutId ||
      (input.amountMinor !== undefined && payment.amountMinor !== input.amountMinor) ||
      (input.currency !== undefined && payment.currency !== input.currency)
    );
  }

  private async reconcileExistingProviderPaymentEvent(
    transaction: TakeoverTransactionClient,
    input: { eventId?: string; payment: ProviderPaymentTransitionRecord; reason: string },
  ): Promise<StatusAttemptRecord> {
    await transaction.paymentReconciliationAction.upsert({
      create: {
        action: 'RECONCILE',
        paymentId: input.payment.id,
        reason: input.reason,
        requestedByActorType: 'SYSTEM',
        status: 'PENDING',
      },
      update: {},
      where: { paymentId_action: { action: 'RECONCILE', paymentId: input.payment.id } },
    });
    if (input.eventId !== undefined) {
      await transaction.paymentWebhookEvent.update({
        data: {
          errorCode: input.reason,
          paymentId: input.payment.id,
          processedAt: new Date(),
          processingStatus: 'RECONCILED',
        },
        where: { id: input.eventId },
      });
    }
    return requireStatusAttempt(
      await this.findStatusAttemptByCheckoutId(transaction, input.payment.checkoutId),
    );
  }

  private async ignoreExistingProviderPaymentEvent(
    transaction: TakeoverTransactionClient,
    input: { eventId: string; payment: ProviderPaymentTransitionRecord },
  ): Promise<StatusAttemptRecord> {
    await transaction.paymentWebhookEvent.update({
      data: {
        paymentId: input.payment.id,
        processedAt: new Date(),
        processingStatus: 'IGNORED',
      },
      where: { id: input.eventId },
    });
    return requireStatusAttempt(
      await this.findStatusAttemptByCheckoutId(transaction, input.payment.checkoutId),
    );
  }

  private async resolveExistingProviderPaymentEvent(
    transaction: TakeoverTransactionClient,
    input: {
      amountMinor?: bigint;
      checkoutId: string;
      currency?: string;
      eventId: string;
      eventType: string;
      provider: string;
      providerPaymentId: string;
    },
  ): Promise<StatusAttemptRecord | null> {
    const existingPayment = await this.findProviderPayment(transaction, input);
    if (existingPayment === null) return null;
    if (this.providerPaymentMismatch(existingPayment, input)) {
      return this.reconcileExistingProviderPaymentEvent(transaction, {
        eventId: input.eventId,
        payment: existingPayment,
        reason: 'PROVIDER_PAYMENT_MISMATCH',
      });
    }
    if (existingPayment.status === 'REFUNDED' || existingPayment.status === 'RECONCILED') {
      return this.ignoreExistingProviderPaymentEvent(transaction, {
        eventId: input.eventId,
        payment: existingPayment,
      });
    }
    if (input.eventType !== 'payment.succeeded' && existingPayment.status === 'CONFIRMED') {
      return this.ignoreExistingProviderPaymentEvent(transaction, {
        eventId: input.eventId,
        payment: existingPayment,
      });
    }
    return null;
  }

  private async confirmProviderPaymentAndCaptureInTransaction(
    transaction: TakeoverTransactionClient,
    input: ConfirmProviderPaymentInput,
  ): Promise<StatusAttemptRecord> {
    const checkout = await transaction.checkoutSession.findUnique({
      where: { id: input.checkoutId },
    });
    if (checkout === null) throw new Error('Checkout was not found');
    const quote = await transaction.takeoverQuote.findUnique({ where: { id: checkout.quoteId } });
    if (quote === null) throw new Error('Quote was not found');
    const territory = await transaction.territory.findUnique({
      select: {
        availabilityStatus: true,
        currency: true,
        id: true,
        minimumTakeoverAmountMinor: true,
        version: true,
      },
      where: { id: quote.territoryId },
    });
    if (territory === null) throw new Error('Territory was not found');
    if (input.amountMinor !== quote.minimumAmountMinor || input.currency !== quote.currency) {
      throw new Error('Provider payment amount does not match quote');
    }

    const existingPayment = await this.findProviderPayment(transaction, input);
    const payment =
      existingPayment ??
      (await transaction.payment.create({
        data: {
          amountMinor: input.amountMinor,
          checkoutId: checkout.id,
          confirmedAt: new Date(),
          currency: input.currency,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          status: 'CONFIRMED',
        },
      }));
    if (existingPayment !== null) {
      if (this.providerPaymentMismatch(existingPayment, input)) {
        return this.reconcileExistingProviderPaymentEvent(transaction, {
          payment: existingPayment,
          reason: 'PROVIDER_PAYMENT_MISMATCH',
        });
      }
      if (existingPayment.status === 'REFUNDED' || existingPayment.status === 'RECONCILED') {
        return requireStatusAttempt(
          await this.findStatusAttemptByCheckoutId(transaction, existingPayment.checkoutId),
        );
      }
      if (existingPayment.status !== 'CONFIRMED') {
        await transaction.payment.update({
          data: {
            confirmedAt: new Date(),
            status: 'CONFIRMED',
          },
          where: { id: existingPayment.id },
        });
      }
    }

    const existingCapture = await transaction.ownershipCapture.findUnique({
      where: { paymentId: payment.id },
    });
    if (existingCapture?.status === 'COMPLETED') {
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, checkout.id),
      );
    }
    if (existingCapture?.status === 'FAILED') {
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, checkout.id),
      );
    }
    if (existingCapture?.status === 'REFUNDED') {
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, checkout.id),
      );
    }

    const capture =
      existingCapture ??
      (await transaction.ownershipCapture.create({
        data: {
          expectedTerritoryVersion: quote.territoryVersion,
          newOwnerCompanyId: quote.companyId,
          paymentId: payment.id,
          status: 'PENDING',
          territoryId: quote.territoryId,
        },
      }));

    try {
      const ownership = new PrismaTerritoryOwnershipRepository(
        createTerritoryOwnershipTransactionClient(transaction),
      );
      await ownership.replaceActiveOwnership({
        expectedTerritoryVersion: quote.territoryVersion,
        newOwnerCompanyId: quote.companyId,
        reason: 'phase3_payment_capture',
        source: 'PAID_CAPTURE',
        territoryId: quote.territoryId,
        transitionAt: new Date(),
      });
      await transaction.ownershipCapture.update({
        data: { completedAt: new Date(), status: 'COMPLETED' },
        where: { id: capture.id },
      });
      await transaction.checkoutSession.update({
        data: { status: 'COMPLETED' },
        where: { id: checkout.id },
      });
    } catch (error) {
      const failureCode =
        error instanceof StaleTerritoryVersionError
          ? 'STALE_TERRITORY_VERSION'
          : error instanceof TerritoryDisabledError
            ? 'TERRITORY_DISABLED'
            : error instanceof OwnershipConflictError
              ? 'OWNERSHIP_CONFLICT'
              : 'CAPTURE_FAILED';
      await transaction.ownershipCapture.update({
        data: { failureCode, status: 'FAILED' },
        where: { id: capture.id },
      });
      await transaction.paymentReconciliationAction.upsert({
        create: {
          action: 'RECONCILE',
          paymentId: payment.id,
          reason: failureCode,
          requestedByActorType: 'SYSTEM',
          status: 'PENDING',
        },
        update: {},
        where: { paymentId_action: { action: 'RECONCILE', paymentId: payment.id } },
      });
    }

    return requireStatusAttempt(await this.findStatusAttemptByCheckoutId(transaction, checkout.id));
  }

  async findStatusAttemptByTokenDigest(
    digest: Uint8Array,
    _now: Date,
  ): Promise<StatusAttemptRecord | null> {
    const token = await this.prisma.checkoutStatusToken.findUnique({
      where: { tokenDigest: Buffer.from(digest) },
    });
    if (token === null) return null;
    const attempt = await this.findStatusAttemptByCheckoutId(this.prisma, token.checkoutId);
    if (attempt === null) return null;
    return { ...attempt, token: { expiresAt: token.expiresAt, revokedAt: token.revokedAt } };
  }

  async beginRefundForReconciliation(paymentId: string): Promise<RefundRequestResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const payment = await transaction.payment.findUnique({ where: { id: paymentId } });
        if (payment === null) return { payment: null, status: null };
        const capture = await transaction.ownershipCapture.findUnique({
          where: { paymentId: payment.id },
        });
        const existingRefund = await transaction.paymentReconciliationAction.findUnique({
          where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
        });
        if (
          payment.status === 'REFUNDED' ||
          existingRefund?.status === 'COMPLETED' ||
          (existingRefund?.status === 'PENDING' &&
            existingRefund.providerRefundReference !== null &&
            !isRefundClaimPlaceholder(existingRefund.providerRefundReference))
        ) {
          return {
            payment: null,
            status: requireStatusAttempt(
              await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
            ),
          };
        }
        const hasPendingReconciliation =
          (
            await transaction.paymentReconciliationAction.findUnique({
              where: { paymentId_action: { action: 'RECONCILE', paymentId: payment.id } },
            })
          )?.status === 'PENDING';
        if (
          payment.status !== 'CONFIRMED' ||
          payment.providerPaymentId.length === 0 ||
          capture?.status === 'COMPLETED' ||
          !hasPendingReconciliation
        ) {
          return {
            payment: null,
            status: requireStatusAttempt(
              await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
            ),
          };
        }
        await transaction.paymentReconciliationAction.upsert({
          create: {
            action: 'REFUND',
            paymentId: payment.id,
            reason: 'REFUND_REQUESTED',
            requestedByActorType: 'SYSTEM',
            status: 'PENDING',
          },
          update: {
            reason: 'REFUND_REQUESTED',
            status: 'PENDING',
          },
          where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
        });
        return {
          payment: {
            amountMinor: payment.amountMinor,
            checkoutId: payment.checkoutId,
            currency: payment.currency,
            id: payment.id,
            provider: payment.provider,
            providerPaymentId: payment.providerPaymentId,
          },
          status: null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordRefundRequestResult(input: {
    paymentId: string;
    providerRefundId?: string;
    status: 'succeeded' | 'failed' | 'pending' | 'review';
  }): Promise<StatusAttemptRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUnique({ where: { id: input.paymentId } });
      if (payment === null) throw new Error('Payment was not found');
      const existingRefund = await transaction.paymentReconciliationAction.findUnique({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      });
      if (
        existingRefund?.status === 'COMPLETED' ||
        (existingRefund?.status === 'FAILED' && input.status !== 'succeeded')
      ) {
        return requireStatusAttempt(
          await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
        );
      }
      await transaction.paymentReconciliationAction.update({
        data: {
          ...(input.providerRefundId === undefined
            ? {}
            : { providerRefundReference: input.providerRefundId }),
          reason: `DODO_REFUND_${input.status.toUpperCase()}`,
          status: input.status === 'failed' ? 'FAILED' : 'PENDING',
        },
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      });
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
      );
    });
  }

  async recordRefundRequestFailure(input: {
    paymentId: string;
    reason: string;
    status: 'FAILED' | 'PENDING';
  }): Promise<StatusAttemptRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUnique({ where: { id: input.paymentId } });
      if (payment === null) throw new Error('Payment was not found');
      const existingRefund = await transaction.paymentReconciliationAction.findUnique({
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      });
      if (
        payment.status === 'REFUNDED' ||
        existingRefund?.status === 'COMPLETED' ||
        (existingRefund?.status === 'FAILED' && input.status !== 'FAILED')
      ) {
        return requireStatusAttempt(
          await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
        );
      }
      await transaction.paymentReconciliationAction.update({
        data: {
          reason: input.reason.slice(0, 3000),
          status: input.status,
        },
        where: { paymentId_action: { action: 'REFUND', paymentId: payment.id } },
      });
      return requireStatusAttempt(
        await this.findStatusAttemptByCheckoutId(transaction, payment.checkoutId),
      );
    });
  }

  // Atomic DB-level refund claim. Stale placeholders can be reclaimed by lease.
  async claimRefund(paymentId: string, placeholder: string): Promise<boolean> {
    const staleClaimCutoff = staleRefundClaimCutoff(placeholder);
    const result = await this.prisma.paymentReconciliationAction.updateMany({
      where: {
        paymentId,
        action: 'REFUND',
        OR: [
          { providerRefundReference: null },
          ...(staleClaimCutoff === null
            ? []
            : [
                {
                  providerRefundReference: {
                    lt: staleClaimCutoff,
                    startsWith: REFUND_CLAIM_PREFIX,
                  },
                },
              ]),
        ],
      },
      data: {
        providerRefundReference: placeholder,
      },
    });
    return result.count > 0;
  }

  // Clear the claim placeholder if it still matches.
  async clearRefundClaim(paymentId: string, placeholder: string): Promise<void> {
    await this.prisma.paymentReconciliationAction.updateMany({
      where: {
        paymentId,
        action: 'REFUND',
        providerRefundReference: placeholder,
      },
      data: {
        providerRefundReference: null,
      },
    });
  }

  private async findStatusAttemptByCheckoutId(
    client: TakeoverTransactionClient | TakeoverPrismaClient,
    checkoutId: string,
  ): Promise<StatusAttemptRecord | null> {
    const checkout = await client.checkoutSession.findUnique({ where: { id: checkoutId } });
    if (checkout === null) return null;
    const quote = await client.takeoverQuote.findUnique({ where: { id: checkout.quoteId } });
    if (quote === null) return null;
    const territory = await client.territory.findUnique({
      select: { id: true, version: true },
      where: { id: quote.territoryId },
    });
    if (territory === null) return null;
    const activeOwnership = await client.territoryOwnership.findFirst({
      select: { companyId: true },
      where: { endedAt: null, territoryId: territory.id },
    });
    const payment = await client.payment.findFirst({
      orderBy: { createdAt: 'desc' },
      where: { checkoutId: checkout.id },
    });
    const capture =
      payment === null
        ? null
        : await client.ownershipCapture.findUnique({ where: { paymentId: payment.id } });
    const reconciliation =
      payment === null
        ? null
        : await client.paymentReconciliationAction.findFirst({
            orderBy: { createdAt: 'desc' },
            where: { paymentId: payment.id },
          });

    return {
      capture:
        capture === null
          ? null
          : {
              completedAt: capture.completedAt,
              failureCode: capture.failureCode,
              newOwnerCompanyId: capture.newOwnerCompanyId,
              status: capture.status,
            },
      checkout: { id: checkout.id, status: checkout.status, updatedAt: checkout.updatedAt },
      payment:
        payment === null
          ? null
          : {
              amountMinor: payment.amountMinor,
              confirmedAt: payment.confirmedAt,
              currency: payment.currency,
              failedAt: payment.failedAt,
              status: payment.status,
            },
      quote: { expiresAt: quote.expiresAt, territoryVersion: quote.territoryVersion },
      reconciliation:
        reconciliation === null
          ? null
          : {
              action: reconciliation.action,
              providerRefundReference: reconciliation.providerRefundReference,
              status: reconciliation.status,
            },
      territory: {
        ownerCompanyId: activeOwnership?.companyId ?? null,
        version: territory.version,
      },
      token: { expiresAt: new Date(0), revokedAt: null },
    };
  }
}
