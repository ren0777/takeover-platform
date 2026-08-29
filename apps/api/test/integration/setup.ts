import { afterAll } from 'vitest';
import { disconnectDatabase } from '@takeover/database';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests');
}

process.env.DATABASE_URL = testDatabaseUrl;

afterAll(async () => {
  await disconnectDatabase();
});
