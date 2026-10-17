import { PgBoss, type ConstructorOptions } from 'pg-boss';
import type { ScanJobPayload, WorkerContext } from './types.js';
import { handleScanRun } from './jobs/scan-run.js';
import { handleScanProcess } from './jobs/scan-process.js';

export const QUEUE_SCAN_RUN = 'scan.run';
export const QUEUE_SCAN_PROCESS = 'scan.process';

export interface CreateBossOptions {
  connectionString?: string;
  schema?: string;
  ssl?: boolean | object;
  max?: number;
}

export function createBoss(options?: CreateBossOptions): PgBoss {
  const connectionString =
    options?.connectionString ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres';
  const schema = options?.schema ?? process.env.PG_BOSS_SCHEMA ?? 'pgboss';

  const bossOptions = {
    connectionString,
    schema,
    ...(options?.ssl !== undefined ? { ssl: options.ssl } : {}),
  } as unknown as ConstructorOptions;

  return new PgBoss(bossOptions);
}

/**
 * Enqueue a scan.run job with Section 9 parameters:
 * Concurrency: 1 scan at a time per worker, Timeout: 25 min, Retries: 2 (backoff 5 min).
 */
export async function enqueueScanRun(
  boss: PgBoss,
  scanId: string,
): Promise<string | null> {
  return boss.send(
    QUEUE_SCAN_RUN,
    { scanId },
    {
      expireInSeconds: 25 * 60,
      retryLimit: 2,
      retryDelay: 300,
      retryBackoff: true,
    },
  );
}

/**
 * Enqueue a scan.process job with Section 9 parameters:
 * Concurrency: 2, Timeout: 5 min, Retries: 3.
 */
export async function enqueueScanProcess(
  boss: PgBoss,
  scanId: string,
): Promise<string | null> {
  return boss.send(
    QUEUE_SCAN_PROCESS,
    { scanId },
    {
      expireInSeconds: 5 * 60,
      retryLimit: 3,
    },
  );
}

/**
 * Registers workers for scan.run and scan.process.
 */
export async function registerWorkers(boss: PgBoss, ctx: WorkerContext): Promise<void> {
  // Concurrency 1 for scan.run
  await boss.work<ScanJobPayload>(
    QUEUE_SCAN_RUN,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.scanId) {
        await handleScanRun(job.data, ctx);
      }
    },
  );

  // Concurrency 2 for scan.process
  await boss.work<ScanJobPayload>(
    QUEUE_SCAN_PROCESS,
    { localConcurrency: 2, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.scanId) {
        await handleScanProcess(job.data, ctx);
      }
    },
  );
}
