import { statfs } from 'node:fs/promises';
import { Router } from 'express';
import type pg from 'pg';

const DISK_WARN_RATIO = 0.1;

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

    const healthy = database.status === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      checks: {
        database,
        disk,
        // pg-boss arrives in Phase 2 (P2-08); queue lag is reported from then on.
        queue: { status: 'not_configured' },
      },
    });
  });

  return router;
}
