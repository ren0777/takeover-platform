import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.TAKEOVER_ALLOW_TEST_DATABASE_RESET !== 'true') {
  throw new Error('Refusing test database reset: TAKEOVER_ALLOW_TEST_DATABASE_RESET must be true');
}

const rawUrl = process.env.TEST_DATABASE_URL;
if (rawUrl === undefined || rawUrl.length === 0) {
  throw new Error('TEST_DATABASE_URL is required');
}

const databaseUrl = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
  throw new Error('TEST_DATABASE_URL must use PostgreSQL');
}

const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
if (databaseName.length === 0 || !databaseName.toLowerCase().includes('test')) {
  throw new Error('Refusing reset: test database name must contain "test"');
}

const prismaCli = fileURLToPath(new URL('./index.js', import.meta.resolve('prisma')));
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'reset', '--force'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, DATABASE_URL: rawUrl },
  stdio: 'inherit',
});

if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
