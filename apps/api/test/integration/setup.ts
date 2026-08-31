import { afterAll } from 'vitest';
import { disconnectDatabase } from '@takeover/database';
import { confirmedIntegrationDatabaseUrl } from './database-safety.js';

const testDatabaseUrl = confirmedIntegrationDatabaseUrl(process.env);

process.env.DATABASE_URL = testDatabaseUrl;

afterAll(async () => {
  await disconnectDatabase();
});
