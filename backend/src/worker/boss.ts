import { PgBoss, type ConstructorOptions, type JobWithMetadata } from 'pg-boss';
import type {
  EmailSendJobPayload,
  FreeCheckJobPayload,
  IssueRecheckJobPayload,
  ScanJobPayload,
  WorkerContext,
} from './types.js';
import { handleScanRun } from './jobs/scan-run.js';
import { handleScanProcess } from './jobs/scan-process.js';
import { handleScanSchedule } from './jobs/scan-schedule.js';
import { handleIssueRecheck } from './jobs/issue-recheck.js';
import { handleEmailSend } from './jobs/email-send.js';
import { handleReportRender } from './jobs/report-render.js';
import { handleFreeCheckRun } from './jobs/free-check-run.js';
import { handleTrialLifecycle } from './jobs/trial-lifecycle.js';
import type { ReportRenderJobPayload } from './types.js';

export const QUEUE_SCAN_RUN = 'scan.run';
export const QUEUE_SCAN_PROCESS = 'scan.process';
export const QUEUE_SCAN_SCHEDULE = 'scan.schedule';
export const QUEUE_ISSUE_RECHECK = 'issue.recheck';
export const QUEUE_EMAIL_SEND = 'email.send';
export const QUEUE_REPORT_RENDER = 'report.render';
export const QUEUE_FREE_CHECK_RUN = 'free-check.run';
export const QUEUE_TRIAL_LIFECYCLE = 'trial.lifecycle';

export const ALL_QUEUES = [
  QUEUE_SCAN_RUN,
  QUEUE_SCAN_PROCESS,
  QUEUE_SCAN_SCHEDULE,
  QUEUE_ISSUE_RECHECK,
  QUEUE_EMAIL_SEND,
  QUEUE_REPORT_RENDER,
  QUEUE_FREE_CHECK_RUN,
  QUEUE_TRIAL_LIFECYCLE,
] as const;

/** pg-boss refuses to send to or schedule on a queue that does not exist. Idempotent. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of ALL_QUEUES) {
    await boss.createQueue(name);
  }
}

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
export async function enqueueScanRun(boss: PgBoss, scanId: string): Promise<string | null> {
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
export async function enqueueScanProcess(boss: PgBoss, scanId: string): Promise<string | null> {
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
 * Enqueue an issue.recheck job with Section 9 parameters:
 * Concurrency: 1, Timeout: 5 min, Retries: 1.
 */
export async function enqueueIssueRecheck(boss: PgBoss, issueId: string): Promise<string | null> {
  return boss.send(
    QUEUE_ISSUE_RECHECK,
    { issueId },
    {
      expireInSeconds: 5 * 60,
      retryLimit: 1,
    },
  );
}

/**
 * Enqueue an email.send job with Section 9 parameters:
 * Concurrency: 5, Timeout: 30s, Retries: 3.
 */
export async function enqueueEmailSend(
  boss: PgBoss,
  payload: EmailSendJobPayload,
): Promise<string | null> {
  return boss.send(QUEUE_EMAIL_SEND, payload, {
    expireInSeconds: 30,
    retryLimit: 3,
  });
}

/**
 * Enqueue a report.render job with Section 9 parameters:
 * Concurrency: 1, Timeout: 5 min, Retries: 2.
 */
export async function enqueueReportRender(boss: PgBoss, reportId: string): Promise<string | null> {
  return boss.send(
    QUEUE_REPORT_RENDER,
    { reportId },
    {
      expireInSeconds: 5 * 60,
      retryLimit: 2,
    },
  );
}

/**
 * Enqueue a free-check.run job with Section 9 parameters:
 * Concurrency: 1 (own lane, never blocks paid scans), Timeout: 90 s, Retries: 0.
 */
export async function enqueueFreeCheckRun(boss: PgBoss, checkId: string): Promise<string | null> {
  return boss.send(QUEUE_FREE_CHECK_RUN, { checkId }, { expireInSeconds: 90, retryLimit: 0 });
}

/**
 * Registers a worker for every queue.
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

  // Concurrency 2 for scan.process. After the last retry the scan is marked failed so it
  // never sits in "processing" forever.
  await boss.work(
    QUEUE_SCAN_PROCESS,
    { localConcurrency: 2, batchSize: 1, includeMetadata: true },
    async (jobs: JobWithMetadata<ScanJobPayload>[]) => {
      const job = jobs[0];
      if (!job?.data?.scanId) return;
      try {
        await handleScanProcess(job.data, ctx);
      } catch (err) {
        if (job.retryCount >= job.retryLimit) {
          await ctx.repos.scans.markFailed(
            job.data.scanId,
            'PROCESSING_FAILED',
            'We could not process the scan results. Please run the scan again.',
          );
        }
        throw err;
      }
    },
  );

  // Concurrency 1 for scan.schedule cron
  await boss.work(QUEUE_SCAN_SCHEDULE, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleScanSchedule(ctx);
  });

  // Concurrency 1 for issue.recheck
  await boss.work<IssueRecheckJobPayload>(
    QUEUE_ISSUE_RECHECK,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.issueId) {
        await handleIssueRecheck(job.data, ctx);
      }
    },
  );

  // Concurrency 5 for email.send
  await boss.work<EmailSendJobPayload>(
    QUEUE_EMAIL_SEND,
    { localConcurrency: 5, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data) {
        await handleEmailSend(job.data, ctx);
      }
    },
  );

  // Concurrency 1 for report.render
  await boss.work<ReportRenderJobPayload>(
    QUEUE_REPORT_RENDER,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.reportId) {
        await handleReportRender(job.data, ctx);
      }
    },
  );

  // Concurrency 1 for free-check.run, on its own lane
  await boss.work<FreeCheckJobPayload>(
    QUEUE_FREE_CHECK_RUN,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.checkId) {
        await handleFreeCheckRun(job.data, ctx);
      }
    },
  );

  // Concurrency 1 for trial.lifecycle cron
  await boss.work(QUEUE_TRIAL_LIFECYCLE, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleTrialLifecycle(ctx);
  });
}

/**
 * Registers recurring schedules with pg-boss (cron jobs from spec Section 9).
 */
export async function registerSchedules(boss: PgBoss): Promise<void> {
  // scan.schedule runs every 10 minutes (cron: '*/10 * * * *')
  await boss.schedule(QUEUE_SCAN_SCHEDULE, '*/10 * * * *', {});

  // trial.lifecycle runs hourly (cron: '0 * * * *')
  await boss.schedule(QUEUE_TRIAL_LIFECYCLE, '0 * * * *', {});
}
