import { disconnectDatabase, isDatabaseInitialized } from '@takeover/database';
import { buildApp } from './app.js';
import { parseApiConfig } from './config/env.js';

async function startServer(): Promise<void> {
  const config = parseApiConfig(process.env);
  const app = buildApp({ config });
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals | 'IPC'): Promise<void> => {
    if (shuttingDown) {
      app.log.error({ event: 'server.shutdown.forced', signal }, 'Forcing shutdown');
      process.exit(1);
    }
    shuttingDown = true;
    app.log.info({ event: 'server.shutdown.started', signal }, 'Shutdown started');

    try {
      await app.close();
      if (isDatabaseInitialized()) {
        await disconnectDatabase();
      }
      app.log.info({ event: 'server.shutdown.completed', signal }, 'Shutdown completed');
      process.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error, event: 'server.shutdown.failed', signal }, 'Shutdown failed');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  if (process.send !== undefined) {
    process.once('message', (message) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'shutdown'
      ) {
        void shutdown('IPC');
      }
    });
  }

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { event: 'server.started', host: config.host, port: config.port },
    'API server started',
  );
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`${JSON.stringify({ event: 'server.start.failed', message })}\n`);
  process.exitCode = 1;
});
