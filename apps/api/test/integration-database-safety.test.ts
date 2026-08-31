import { describe, expect, it } from 'vitest';
import { confirmedIntegrationDatabaseUrl } from './integration/database-safety.js';

describe('confirmedIntegrationDatabaseUrl', () => {
  it('requires explicit reset confirmation and a PostgreSQL database named for testing', () => {
    expect(() => confirmedIntegrationDatabaseUrl({})).toThrow('TAKEOVER_ALLOW_TEST_DATABASE_RESET');
    expect(() =>
      confirmedIntegrationDatabaseUrl({
        TAKEOVER_ALLOW_TEST_DATABASE_RESET: 'true',
        TEST_DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/takeover',
      }),
    ).toThrow('must contain "test"');
    expect(() =>
      confirmedIntegrationDatabaseUrl({
        TAKEOVER_ALLOW_TEST_DATABASE_RESET: 'true',
        TEST_DATABASE_URL: 'mysql://user:password@127.0.0.1:5432/takeover_test',
      }),
    ).toThrow('must use PostgreSQL');
  });

  it('returns only a confirmed dedicated PostgreSQL test URL', () => {
    const url = 'postgresql://user:password@127.0.0.1:5432/takeover_runtime_test';

    expect(
      confirmedIntegrationDatabaseUrl({
        TAKEOVER_ALLOW_TEST_DATABASE_RESET: 'true',
        TEST_DATABASE_URL: url,
      }),
    ).toBe(url);
  });
});
