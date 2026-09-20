import Fastify from 'fastify';
import type { PrismaClient } from '@takeover/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompetition } from './routes.js';
import { CompetitionService } from './service.js';

afterEach(() => vi.restoreAllMocks());
const season = {
  id: 'one',
  number: 1,
  scoringVersion: 'v1',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-01-31T00:00:00.000Z',
  finalizedAt: null,
  standings: null,
};
async function app() {
  vi.spyOn(CompetitionService.prototype, 'seasons').mockResolvedValue({
    current: season,
    archives: [],
  });
  const instance = Fastify();
  await registerCompetition(instance, { prisma: {} as PrismaClient });
  return instance;
}

describe('public competition HTTP', () => {
  it('validates activity cursors and publishes a checked envelope', async () => {
    vi.spyOn(CompetitionService.prototype, 'activity').mockResolvedValue({
      items: [],
      nextCursor: '7',
      hasMore: false,
    });
    const instance = await app();
    try {
      const response = await instance.inject('/api/activity?cursor=7');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: { items: [], nextCursor: '7', hasMore: false },
        meta: { requestId: expect.any(String) },
      });
      expect((await instance.inject('/api/activity?cursor=-1')).statusCode).not.toBe(200);
    } finally {
      await instance.close();
    }
  });

  it('resumes from Last-Event-ID, emits bounded replay and closes streams on shutdown', async () => {
    const activity = vi
      .spyOn(CompetitionService.prototype, 'activity')
      .mockResolvedValue({
        items: [
          {
            id: '8',
            companyName: 'Company',
            companySlug: 'company',
            territoryName: 'Territory',
            territorySlug: 'territory',
            capturedAt: season.startsAt,
          },
        ],
        nextCursor: '8',
        hasMore: false,
      });
    const instance = await app();
    await instance.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${instance.listeningOrigin}/api/activity/stream?cursor=1`, {
      headers: { 'last-event-id': '7' },
    });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(activity).toHaveBeenCalledWith('7', 100);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('id: 8\nevent: capture');
    await instance.close();
    expect((await reader.read()).done).toBe(true);
  });

  it('limits a replay connection to one batch without losing its resume cursor', async () => {
    vi.spyOn(CompetitionService.prototype, 'activity').mockResolvedValue({
      items: [
        {
          id: '9',
          companyName: 'Company',
          companySlug: null,
          territoryName: 'Territory',
          territorySlug: 'territory',
          capturedAt: season.startsAt,
        },
      ],
      nextCursor: '9',
      hasMore: true,
    });
    const instance = await app();
    try {
      const response = await instance.inject('/api/activity/stream');
      expect(response.body).toContain('id: 9');
      expect(response.body).toContain('event: catch-up');
    } finally {
      await instance.close();
    }
  });
});
