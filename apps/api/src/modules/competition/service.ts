import { type Prisma, type PrismaClient } from '@takeover/database';
import { COMPETITION_RULES, competitionStandingSchema, type ActivityPage } from '@takeover/shared';
import { rankHoldings } from './domain.js';
import { CompanyNotFoundError } from '../territories/service.js';

export type CompetitionConfig = { seasonDurationDays?: number; seasonStartsAt?: Date };
export class CompetitionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: CompetitionConfig = {},
  ) {
    const days = config.seasonDurationDays ?? 30;
    if (!Number.isInteger(days) || days < 1 || days > 366)
      throw new Error('Season duration must be 1 to 366 days');
  }

  private async standings(transaction: Prisma.TransactionClient, boundary?: Date) {
    const rows = await transaction.territoryOwnership.findMany({
      where: boundary
        ? { capturedAt: { lt: boundary }, OR: [{ endedAt: null }, { endedAt: { gte: boundary } }] }
        : { endedAt: null },
      select: {
        company: { select: { id: true, name: true, slug: true } },
        territory: { select: { categoryId: true } },
      },
    });
    return rankHoldings(
      rows.map((row) => ({
        companyId: row.company.id,
        companyName: row.company.name,
        companySlug: row.company.slug,
        categoryId: row.territory.categoryId,
      })),
    );
  }

  async leaderboard() {
    return {
      rules: COMPETITION_RULES,
      standings: (await this.standings(this.prisma)).slice(0, 100),
    };
  }

  async statistics(companyId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const company = await tx.company.findFirst({
          where: { id: companyId, status: { in: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] } },
          select: { id: true },
        });
        if (!company) throw new CompanyNotFoundError();
        const standing = (await this.standings(tx)).find((row) => row.companyId === companyId);
        const captures = await tx.ownershipCapture.findMany({
          where: { newOwnerCompanyId: companyId, status: 'COMPLETED' },
          select: { paymentId: true },
        });
        const payments = await tx.payment.findMany({
          where: { id: { in: captures.map((row) => row.paymentId) }, status: 'CONFIRMED' },
        });
        const spend = new Map<string, bigint>();
        for (const payment of payments)
          spend.set(payment.currency, (spend.get(payment.currency) ?? 0n) + payment.amountMinor);
        return {
          companyId,
          activeTerritories: standing?.territories ?? 0,
          categories: standing?.categories ?? 0,
          score: standing?.score ?? 0,
          captures: captures.length,
          spend: [...spend]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, amount]) => ({ currency, amountMinor: amount.toString() })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async activity(cursor = '0', limit = 50, latest = false): Promise<ActivityPage> {
    const rows = await this.prisma.captureActivity.findMany({
      // Removals and restorations are recorded beside captures in the same
      // table, but this feed means "territories just taken" and would read as
      // a capture for each of them. Territory history carries the full story.
      where: { eventType: 'CAPTURE', id: { gt: BigInt(cursor) } },
      orderBy: { id: latest ? 'desc' : 'asc' },
      take: latest ? limit : limit + 1,
    });
    if (latest) rows.reverse();
    const items = rows
      .slice(0, limit)
      .map((row) => ({
        id: row.id.toString(),
        companyName: row.companyName,
        companySlug: row.companySlug,
        territoryName: row.territoryName,
        territorySlug: row.territorySlug,
        capturedAt: row.capturedAt.toISOString(),
      }));
    return { items, nextCursor: items.at(-1)?.id ?? cursor, hasMore: !latest && rows.length > limit };
  }

  async seasons(now = new Date()) {
    // READ COMMITTED is intentional: after waiting on the shared capture lock,
    // subsequent reads must see every capture committed before the freeze.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(724260920)::text`;
        let current = await tx.competitionSeason.findFirst({ orderBy: { number: 'desc' } });
        if (!current) {
          const startsAt = this.config.seasonStartsAt ?? now;
          current = await tx.competitionSeason.create({
            data: {
              number: 1,
              startsAt,
              endsAt: new Date(
                startsAt.getTime() + (this.config.seasonDurationDays ?? 30) * 86_400_000,
              ),
            },
          });
        }
        let count = 0;
        while (current.endsAt <= now) {
          if (++count > 3660) throw new Error('Season catch-up exceeds supported history');
          const standings = await this.standings(tx, current.endsAt);
          await tx.competitionSeason.update({
            where: { id: current.id },
            data: { finalizedAt: now, standings },
          });
          current = await tx.competitionSeason.create({
            data: {
              number: current.number + 1,
              startsAt: current.endsAt,
              endsAt: new Date(
                current.endsAt.getTime() + (this.config.seasonDurationDays ?? 30) * 86_400_000,
              ),
            },
          });
        }
      },
      { timeout: 30_000 },
    );
    const rows = await this.prisma.competitionSeason.findMany({
      orderBy: { number: 'desc' },
      take: 101,
    });
    const mapped = rows.map((row) => ({
      id: row.id,
      number: row.number,
      scoringVersion: row.scoringVersion,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      standings:
        row.standings === null ? null : competitionStandingSchema.array().parse(row.standings),
    }));
    const current = mapped[0];
    if (!current) throw new Error('Season initialization failed');
    return { current, archives: mapped.slice(1) };
  }
}
