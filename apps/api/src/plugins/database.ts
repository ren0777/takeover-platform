import { getDatabaseClient, type PrismaClient } from '@takeover/database';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    database: PrismaClient;
  }
}

export async function databasePlugin(app: FastifyInstance): Promise<void> {
  app.decorate('database', getDatabaseClient());
}
