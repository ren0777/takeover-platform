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

        const payment = await transaction.payment.upsert({
          create: {
            amountMinor: input.amountMinor,
            checkoutId: checkout.id,
            confirmedAt: new Date(),
            currency: input.currency,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
            status: 'CONFIRMED',
          },
          update: {
            confirmedAt: new Date(),
            status: 'CONFIRMED',
          },
          where: {
            provider_providerPaymentId: {
              provider: input.provider,
              providerPaymentId: input.providerPaymentId,
            },
          },
        });

        const existingCapture = await transaction.ownershipCapture.findUnique({
          where: { paymentId: payment.id },
        });
        if (existingCapture?.status === 'COMPLETED') {
          return requireStatusAttempt(await this.findStatusAttemptByCheckoutId(transaction, checkout.id));
        }
        if (existingCapture?.status === 'FAILED') {
          return requireStatusAttempt(await this.findStatusAttemptByCheckoutId(transaction, checkout.id));
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
          : { action: reconciliation.action, status: reconciliation.status },
      territory: {
        ownerCompanyId: activeOwnership?.companyId ?? null,
        version: territory.version,
      },
      token: { expiresAt: new Date(0), revokedAt: null },
    };
  }
}
