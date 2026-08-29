import { HEALTH_STATUS, type ApiSuccess } from '@takeover/shared';
import type { FastifyInstance } from 'fastify';

type HealthData = {
  status: typeof HEALTH_STATUS.OK;
  uptimeSeconds: number;
};

type ReadinessData = {
  status: typeof HEALTH_STATUS.READY;
  checks: { application: 'ok' };
};

export async function healthPlugin(app: FastifyInstance): Promise<void> {
  app.get('/health', async (request): Promise<ApiSuccess<HealthData>> => ({
    data: {
      status: HEALTH_STATUS.OK,
      uptimeSeconds: Math.round(process.uptime()),
    },
    meta: { requestId: request.id },
  }));

  app.get('/ready', async (request): Promise<ApiSuccess<ReadinessData>> => ({
    data: {
      status: HEALTH_STATUS.READY,
      checks: { application: 'ok' },
    },
    meta: { requestId: request.id },
  }));
}
