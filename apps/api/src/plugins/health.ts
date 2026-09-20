import { HEALTH_STATUS, type ApiSuccess } from '@takeover/shared';
import type { FastifyInstance } from 'fastify';

type HealthData = {
  status: typeof HEALTH_STATUS.OK;
  uptimeSeconds: number;
};

type ReadinessData = {
  status: typeof HEALTH_STATUS.READY | 'unavailable';
  checks: { application: 'ok'; database?: 'ok' | 'unavailable' };
};

export async function healthPlugin(
  app: FastifyInstance,
  options: { checkDatabase?: () => Promise<unknown> } = {},
): Promise<void> {
  app.get('/health', async (request): Promise<ApiSuccess<HealthData>> => ({
    data: {
      status: HEALTH_STATUS.OK,
      uptimeSeconds: Math.round(process.uptime()),
    },
    meta: { requestId: request.id },
  }));

  app.get('/ready', async (request, reply): Promise<ApiSuccess<ReadinessData>> => {
    const checks: ReadinessData['checks'] = { application: 'ok' };
    if (options.checkDatabase !== undefined) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          options.checkDatabase(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Readiness timeout')), 2_000);
          }),
        ]);
        checks.database = 'ok';
      } catch {
        checks.database = 'unavailable';
        reply.status(503);
      } finally { clearTimeout(timeout); }
    }
    return {
      data: { status: checks.database === 'unavailable' ? 'unavailable' : HEALTH_STATUS.READY, checks },
      meta: { requestId: request.id },
    };
  });
}
