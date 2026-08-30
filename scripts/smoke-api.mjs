import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Operating system did not allocate a TCP port'));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response;
    } catch {
      // The compiled server has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become healthy at ${baseUrl}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitForExit(child, timeoutMilliseconds) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMilliseconds);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, timedOut: false });
    });
  });
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    API_HOST: '127.0.0.1',
    API_PORT: String(port),
    DEV_EMAIL_CAPTURE_ENABLED: 'false',
    EMAIL_PROVIDER: 'unavailable',
    LOG_LEVEL: 'warn',
    NODE_ENV: 'production',
    TOKEN_HMAC_SECRET: Buffer.from('takeover-smoke-only-secret-32bytes!').toString('base64url'),
    WEB_APP_ORIGIN: 'https://takeover.example',
  },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  windowsHide: true,
});

let failed = false;

try {
  const healthResponse = await waitForHealth(baseUrl);
  const health = await healthResponse.json();
  assert(healthResponse.status === 200, `/health returned ${healthResponse.status}`);
  assert(health.data.status === 'ok', '/health did not report ok');

  const readyResponse = await fetch(`${baseUrl}/ready`);
  const ready = await readyResponse.json();
  assert(readyResponse.status === 200, `/ready returned ${readyResponse.status}`);
  assert(ready.data.status === 'ready', '/ready did not report ready');
  assert(ready.data.checks.application === 'ok', '/ready omitted the application check');
  assert(ready.data.checks.database === undefined, '/ready claimed an unperformed database check');

  const missingResponse = await fetch(`${baseUrl}/missing`);
  const missing = await missingResponse.json();
  assert(missingResponse.status === 404, `unknown route returned ${missingResponse.status}`);
  assert(missing.error.code === 'NOT_FOUND', 'unknown route did not use the error envelope');

  child.send({ type: 'shutdown' });
  const exit = await waitForExit(child, 5_000);
  assert(!exit.timedOut, 'API did not shut down within five seconds');
  assert(exit.code === 0, `API exited with code ${exit.code} and signal ${exit.signal}`);

  process.stdout.write('API smoke check passed: startup, health, readiness, 404, and shutdown.\n');
} catch (error) {
  failed = true;
  process.stderr.write(
    `API smoke check failed: ${error instanceof Error ? error.message : error}\n`,
  );
} finally {
  if (child.exitCode === null) child.kill();
}

process.exitCode = failed ? 1 : 0;
