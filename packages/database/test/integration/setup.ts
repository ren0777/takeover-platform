// These suites mutate their fixtures. Never inherit a development/production URL.
const rawUrl = process.env.TEST_DATABASE_URL;
if (process.env.TAKEOVER_ALLOW_TEST_DATABASE_RESET !== 'true' || !rawUrl) {
  throw new Error('Integration tests require TEST_DATABASE_URL and TAKEOVER_ALLOW_TEST_DATABASE_RESET=true');
}
const url = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !decodeURIComponent(url.pathname.slice(1)).toLowerCase().includes('test')) {
  throw new Error('Integration tests require a PostgreSQL database whose name contains test');
}
process.env.DATABASE_URL = rawUrl;
