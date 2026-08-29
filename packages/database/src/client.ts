import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

type DisconnectableClient = {
  $disconnect(): Promise<void>;
};

export type DatabaseLifecycle<TClient extends DisconnectableClient> = {
  getDatabaseClient(): TClient;
  isDatabaseInitialized(): boolean;
  disconnectDatabase(): Promise<void>;
};

export function createDatabaseLifecycle<TClient extends DisconnectableClient>(
  factory: () => TClient,
): DatabaseLifecycle<TClient> {
  let client: TClient | undefined;

  return {
    getDatabaseClient() {
      client ??= factory();
      return client;
    },
    isDatabaseInitialized() {
      return client !== undefined;
    },
    async disconnectDatabase() {
      if (client === undefined) return;

      const currentClient = client;
      client = undefined;
      await currentClient.$disconnect();
    },
  };
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to initialize the database client');
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const lifecycle = createDatabaseLifecycle(createPrismaClient);

export const getDatabaseClient = lifecycle.getDatabaseClient;
export const isDatabaseInitialized = lifecycle.isDatabaseInitialized;
export const disconnectDatabase = lifecycle.disconnectDatabase;
