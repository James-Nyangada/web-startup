import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  QUEUE_FREE_CHECK_RUN,
  QUEUE_SCAN_RUN,
  createBoss,
  enqueueFreeCheckRun,
  enqueueScanRun,
  ensureQueues,
} from '../../src/worker/boss.js';

/**
 * P3-03 load test: 30 free checks never delay a paid scan's start by more than 1 minute.
 * Runs against a real, disposable Postgres. Set TEST_DATABASE_URL to enable.
 * The spec spreads 30 checks over 5 minutes; this test sends them as one burst, which is harder.
 */
const url = process.env.TEST_DATABASE_URL;
const schema = 'pgboss_lane_test';
const FREE_CHECK_MS = 3_000;

describe.skipIf(!url)('free-check.run lane (integration)', () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = createBoss({
      connectionString: url!,
      schema,
      ...(process.env.TEST_DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    await boss.start();
    await ensureQueues(boss);
  });

  afterAll(async () => {
    await boss?.stop({ graceful: false, timeout: 1_000 });
  });

  it('a burst of 30 free checks does not delay a paid scan by more than 1 minute', async () => {
    let freeChecksDone = 0;
    await boss.work(QUEUE_FREE_CHECK_RUN, { localConcurrency: 1, batchSize: 1 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, FREE_CHECK_MS));
      freeChecksDone += 1;
    });

    let scanStartedAt = 0;
    await boss.work(QUEUE_SCAN_RUN, { localConcurrency: 1, batchSize: 1 }, () => {
      scanStartedAt = Date.now();
      return Promise.resolve();
    });

    for (let i = 0; i < 30; i += 1) {
      await enqueueFreeCheckRun(boss, `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`);
    }
    const scanQueuedAt = Date.now();
    await enqueueScanRun(boss, '11111111-1111-4111-a111-111111111111');

    while (!scanStartedAt && Date.now() - scanQueuedAt < 60_000) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(scanStartedAt).toBeGreaterThan(0);
    expect(scanStartedAt - scanQueuedAt).toBeLessThan(60_000);
    // The free checks are still queued behind each other, so the scan really did jump them.
    expect(freeChecksDone).toBeLessThan(30);
  }, 90_000);
});
