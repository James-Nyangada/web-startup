import { getDb, closeDb } from '../db/index.js';
import { createRepositories } from '../db/repositories/index.js';
import { ensureRulesSeeded } from '../db/seed-rules.js';
import { getStorage } from '../storage/index.js';
import { createBoss, ensureQueues, registerWorkers, registerSchedules } from './boss.js';
import { recoverInterruptedScans } from './recovery.js';
import type { WorkerContext } from './types.js';

export async function startWorker() {
  const { db, pool } = getDb();
  const repos = createRepositories(db);
  const storage = getStorage();

  console.log('[worker] Ensuring rules catalog is seeded...');
  await ensureRulesSeeded(db);

  console.log('[worker] Starting pg-boss...');
  const boss = createBoss();
  await boss.start();
  await ensureQueues(boss);

  const abortController = new AbortController();

  const ctx: WorkerContext = {
    repos,
    storage,
    boss,
    pool,
    abortSignal: abortController.signal,
    scannerConcurrency: Number(process.env.SCANNER_CONCURRENCY) || 2,
    userAgent: process.env.SCANNER_USER_AGENT,
  };

  console.log('[worker] Recovering any interrupted scans...');
  const recovered = await recoverInterruptedScans(repos, boss);
  if (recovered > 0) {
    console.log(`[worker] Re-enqueued ${recovered} interrupted scan(s).`);
  }

  console.log('[worker] Registering job workers...');
  await registerWorkers(boss, ctx);

  console.log('[worker] Registering recurring cron schedules...');
  await registerSchedules(boss);

  console.log('[worker] Background worker is active and listening for jobs.');

  // Graceful shutdown handling
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[worker] Received ${signal}, draining and stopping workers...`);
    abortController.abort();

    try {
      await boss.stop({ graceful: true, timeout: 30000 });
      console.log('[worker] pg-boss stopped.');
      await closeDb();
      console.log('[worker] Database connection closed.');
      process.exit(0);
    } catch (err) {
      console.error('[worker] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return { boss, ctx };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((err) => {
    console.error('[worker] Fatal error on startup:', err);
    process.exit(1);
  });
}
