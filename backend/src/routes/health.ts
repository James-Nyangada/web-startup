import { statfs } from 'node:fs/promises';
import { Router } from 'express';
import type pg from 'pg';

const DISK_WARN_RATIO = 0.1;
/** A job ready to run for longer than this means the worker is down or swamped (spec 13.3). */
const QUEUE_LAG_WARN_SECONDS = 15 * 60;
const BOSS_SCHEMA = /^[a-z_][a-z0-9_]*$/.test(process.env.PG_BOSS_SCHEMA ?? 'pgboss')
  ? (process.env.PG_BOSS_SCHEMA ?? 'pgboss')
  : 'pgboss';

export function healthRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/health/deep', async (_req, res) => {
    const started = performance.now();
    const database = await pool
      .query('select 1')
      .then(() => ({ status: 'ok' as const, latencyMs: Math.round(performance.now() - started) }))
      .catch((error: unknown) => ({
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'unknown error',
      }));

    const disk = await statfs('/')
      .then((s) => {
        const freeRatio = s.bavail / s.blocks;
        return {
          status: freeRatio < DISK_WARN_RATIO ? ('warn' as const) : ('ok' as const),
          freePercent: Math.round(freeRatio * 100),
        };
      })
      .catch(() => ({ status: 'unknown' as const }));

    // Age of the oldest job that is ready to run but not picked up.
    const queue = await pool
      .query<{ lag: number | null }>(
        `select extract(epoch from now() - min(created_on))::int as lag
           from ${BOSS_SCHEMA}.job
          where state in ('created', 'retry') and start_after <= now()`,
      )
      .then((r) => {
        const lag = Number(r.rows[0]?.lag ?? 0) || 0;
        return {
          status: lag > QUEUE_LAG_WARN_SECONDS ? ('warn' as const) : ('ok' as const),
          oldestReadySeconds: lag,
        };
      })
      .catch(() => ({ status: 'unknown' as const }));

    const healthy = database.status === 'ok';
    // `warn` keeps 200 (the API still serves) but is visible to keyword monitors.
    const warn = disk.status === 'warn' || queue.status === 'warn';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? (warn ? 'warn' : 'ok') : 'error',
      checks: { database, disk, queue },
    });
  });

  return router;
}
