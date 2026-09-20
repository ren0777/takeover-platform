import type { PrismaClient } from '@takeover/database';
import {
  activityPageSchema,
  competitionStatisticsSchema,
  leaderboardSchema,
  seasonsSchema,
  hallOfFameSchema,
  type ActivityPage,
} from '@takeover/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CompetitionService, type CompetitionConfig } from './service.js';

const cursorSchema = z
  .string()
  .regex(/^\d{1,19}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const activityQuery = z
  .object({
    cursor: cursorSchema.default('0'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function registerCompetition(
  app: FastifyInstance,
  options: { prisma: PrismaClient; config?: CompetitionConfig },
): Promise<void> {
  const service = new CompetitionService(options.prisma, options.config);
  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await service.seasons();
    } catch (error) {
      app.log.error({ err: error }, 'Season rollover failed; next sweep will retry');
    } finally {
      sweeping = false;
    }
  };
  let sweepTimer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    await sweep();
    sweepTimer = setInterval(() => {
      void sweep();
    }, 60_000);
    sweepTimer.unref();
  });
  app.get('/api/leaderboard', async (request) => ({
    data: leaderboardSchema.parse(await service.leaderboard()),
    meta: { requestId: request.id, limit: 100 },
  }));
  app.get('/api/companies/:companyId/statistics', async (request) => {
    const { companyId } = z.object({ companyId: z.string().uuid() }).parse(request.params);
    return {
      data: competitionStatisticsSchema.parse(await service.statistics(companyId)),
      meta: { requestId: request.id },
    };
  });
  app.get('/api/activity', async (request) => {
    const query = activityQuery.extend({ latest: z.enum(['true', 'false']).optional() })
      .refine((value) => value.latest !== 'true' || value.cursor === '0').parse(request.query);
    return {
      data: activityPageSchema.parse(await service.activity(query.cursor, query.limit, query.latest === 'true')),
      meta: { requestId: request.id },
    };
  });
  app.get('/api/seasons', async (request) => ({
    data: seasonsSchema.parse(await service.seasons()),
    meta: { requestId: request.id, archiveLimit: 100 },
  }));
  app.get('/api/hall-of-fame', async (request) => ({
    data: hallOfFameSchema.parse((await service.seasons()).archives),
    meta: { requestId: request.id, archiveLimit: 100 },
  }));

  const streams = new Set<() => void>();
  let streamCount = 0;
  app.addHook('preClose', async () => {
    if (sweepTimer) clearInterval(sweepTimer);
    for (const close of streams) close();
  });
  app.get('/api/activity/stream', async (request, reply) => {
    const query = activityQuery.parse(request.query);
    let cursor = cursorSchema.parse(request.headers['last-event-id'] ?? query.cursor);
    if (streamCount >= 100)
      return reply
        .code(503)
        .send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Activity stream capacity reached. Retry shortly.',
            requestId: request.id,
          },
        });
    streamCount++;
    // Validate/read before hijacking so database errors retain the normal envelope.
    let page: ActivityPage;
    try {
      page = await service.activity(cursor, 100);
    } catch (error) {
      streamCount--;
      throw error;
    }
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    });
    let closed = false;
    let busy = false;
    const close = () => {
      if (closed) return;
      closed = true;
      streamCount--;
      clearInterval(timer);
      clearTimeout(lifetime);
      streams.delete(close);
      reply.raw.end();
    };
    const send = () => {
      for (const item of page.items) {
        if (!reply.raw.write(`id: ${item.id}\nevent: capture\ndata: ${JSON.stringify(item)}\n\n`)) {
          close();
          return;
        }
        cursor = item.id;
      }
      if (page.hasMore) {
        reply.raw.write('event: catch-up\ndata: {}\n\n');
        close();
      }
    };
    const timer = setInterval(() => {
      if (busy || closed) return;
      busy = true;
      void service
        .activity(cursor, 100)
        .then((next) => {
          if (!closed) {
            page = next;
            send();
            if (!closed) reply.raw.write(': heartbeat\n\n');
          }
        })
        .catch((error: unknown) => {
          request.log.error({ err: error }, 'Activity stream read failed');
          close();
        })
        .finally(() => {
          busy = false;
        });
    }, 2000);
    const lifetime = setTimeout(close, 60_000);
    streams.add(close);
    reply.raw.on('close', close);
    reply.raw.write(': connected\n\n');
    send();
  });
}
