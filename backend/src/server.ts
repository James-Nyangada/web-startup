import './instrument.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDb, getDb } from './db/index.js';
import { createRepositories } from './db/repositories/index.js';
import { logger } from './lib/logger.js';
import { createTurnstileVerifier } from './lib/turnstile.js';
import { startNotifyBridge, stopNotifyBridge } from './lib/notify-bridge.js';
import { createBoss, ensureQueues } from './worker/boss.js';

const config = env();
const { pool, db } = getDb();

// Start Postgres NOTIFY bridge for cross-process SSE events
void startNotifyBridge(pool);

// Send-only pg-boss client: the API enqueues jobs, apps/worker consumes them.
const boss = createBoss();
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
await boss.start();
await ensureQueues(boss);

const app = createApp({
  config,
  pool,
  repos: createRepositories(db),
  verifyTurnstile: createTurnstileVerifier(config.TURNSTILE_SECRET_KEY),
  scansOptions: { boss },
  freeChecksOptions: { boss },
});

const server = app.listen(config.PORT, () => {
  logger.info(`API listening on http://localhost:${config.PORT}`);
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'Server failed to start');
  process.exit(1);
});

// Check the database once at boot so a bad DATABASE_URL is obvious immediately.
pool
  .query('select 1')
  .then(() => logger.info('Database connection OK'))
  .catch((error: unknown) => logger.error({ err: error }, 'Database connection FAILED'));

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void Promise.all([stopNotifyBridge(), boss.stop({ graceful: true, timeout: 5_000 })])
      .catch((err) => logger.warn({ err }, 'Error stopping notify bridge or queue'))
      .finally(() => {
        void closeDb().finally(() => process.exit(0));
      });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
