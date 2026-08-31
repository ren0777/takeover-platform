export function confirmedIntegrationDatabaseUrl(source: NodeJS.ProcessEnv): string {
  if (source.TAKEOVER_ALLOW_TEST_DATABASE_RESET !== 'true') {
    throw new Error('TAKEOVER_ALLOW_TEST_DATABASE_RESET must be true');
  }
  const rawUrl = source.TEST_DATABASE_URL;
  if (rawUrl === undefined || rawUrl.length === 0) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests');
  }

  const databaseUrl = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('TEST_DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
  if (!databaseName.toLowerCase().includes('test')) {
    throw new Error('TEST_DATABASE_URL database name must contain "test"');
  }
  return rawUrl;
}
