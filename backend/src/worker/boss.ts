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
import { handleBillingLifecycle } from './jobs/billing-lifecycle.js';
import { handlePaddleProcess } from './jobs/paddle-process.js';
import { handleWeeklyDigest } from './jobs/digest-weekly.js';
import { handleWebhookDeliver } from './jobs/webhook-deliver.js';
import { handleReportSchedule } from './jobs/report-schedule.js';
import { handleRetentionPrune } from './jobs/retention-prune.js';
import { handleSiteReverify, handleSiteReverifySweep } from './jobs/site-reverify.js';
import { handleDataExport } from './jobs/data-export.js';
import {
  handleContentPublishScheduled,
  handleMetricsComputeDaily,
  handleMetricsComputeToday,
  handleOrgsHealth,
  handleSiteDeployStatus,
  handleSiteRebuild,
  handleUmamiSync,
  type MetricsComputePayload,
} from './jobs/phase8.js';
import { QUEUE_SITE_DEPLOY_STATUS, QUEUE_SITE_REBUILD } from '../lib/site-rebuild.js';
import { handleLegalNotice, type LegalNoticePayload } from './jobs/legal-notice.js';
import { handleChangelogDigest, type ChangelogDigestPayload } from './jobs/changelog-digest.js';
import type {
  DataExportJobPayload,
  DigestWeeklyJobPayload,
  PaddleProcessJobPayload,
  ReportRenderJobPayload,
  RetentionPruneJobPayload,
  SiteReverifyJobPayload,
  WebhookDeliverJobPayload,
} from './types.js';

export const QUEUE_SCAN_RUN = 'scan.run';
export const QUEUE_SCAN_PROCESS = 'scan.process';
export const QUEUE_SCAN_SCHEDULE = 'scan.schedule';
export const QUEUE_ISSUE_RECHECK = 'issue.recheck';
export const QUEUE_EMAIL_SEND = 'email.send';
export const QUEUE_REPORT_RENDER = 'report.render';
export const QUEUE_REPORT_SCHEDULE = 'report.schedule';
export const QUEUE_FREE_CHECK_RUN = 'free-check.run';
export const QUEUE_TRIAL_LIFECYCLE = 'trial.lifecycle';
export const QUEUE_BILLING_LIFECYCLE = 'billing.lifecycle';
export const QUEUE_PADDLE_PROCESS = 'paddle.process';
export const QUEUE_DIGEST_WEEKLY = 'digest.weekly';
export const QUEUE_WEBHOOK_DELIVER = 'webhook.deliver';
export const QUEUE_RETENTION_PRUNE = 'retention.prune';
export const QUEUE_SITE_REVERIFY = 'site.reverify';
export const QUEUE_SITE_REVERIFY_SWEEP = 'site.reverify.sweep';
export const QUEUE_PRIVACY_EXPORT = 'privacy.export';
export const QUEUE_CONTENT_PUBLISH_SCHEDULED = 'content.publish-scheduled';
export const QUEUE_METRICS_COMPUTE_DAILY = 'metrics.compute-daily';
export const QUEUE_METRICS_COMPUTE_TODAY = 'metrics.compute-today';
export const QUEUE_UMAMI_SYNC = 'analytics.umami-sync';
export const QUEUE_ORGS_HEALTH = 'orgs.health';
export const QUEUE_LEGAL_NOTICE = 'legal.notice';
export const QUEUE_CHANGELOG_DIGEST = 'changelog.digest';
export { QUEUE_SITE_DEPLOY_STATUS, QUEUE_SITE_REBUILD };

export const ALL_QUEUES = [
  QUEUE_SCAN_RUN,
  QUEUE_SCAN_PROCESS,
  QUEUE_SCAN_SCHEDULE,
  QUEUE_ISSUE_RECHECK,
  QUEUE_EMAIL_SEND,
  QUEUE_REPORT_RENDER,
  QUEUE_REPORT_SCHEDULE,
  QUEUE_FREE_CHECK_RUN,
  QUEUE_TRIAL_LIFECYCLE,
  QUEUE_BILLING_LIFECYCLE,
  QUEUE_PADDLE_PROCESS,
  QUEUE_DIGEST_WEEKLY,
  QUEUE_WEBHOOK_DELIVER,
  QUEUE_RETENTION_PRUNE,
  QUEUE_SITE_REVERIFY,
  QUEUE_SITE_REVERIFY_SWEEP,
  QUEUE_PRIVACY_EXPORT,
  QUEUE_CONTENT_PUBLISH_SCHEDULED,
  QUEUE_METRICS_COMPUTE_DAILY,
  QUEUE_METRICS_COMPUTE_TODAY,
  QUEUE_UMAMI_SYNC,
  QUEUE_ORGS_HEALTH,
  QUEUE_LEGAL_NOTICE,
  QUEUE_CHANGELOG_DIGEST,
  QUEUE_SITE_REBUILD,
  QUEUE_SITE_DEPLOY_STATUS,
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
  // pg-boss opens its own pool (default 10). Keep it small behind Supabase's session pooler.
  const max = options?.max ?? (Number(process.env.PG_BOSS_POOL_MAX) || undefined);

  const bossOptions = {
    connectionString,
    schema,
    ...(max !== undefined ? { max } : {}),
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
 * Enqueue a paddle.process job with Section 9 parameters:
 * Concurrency: 1 (ordered per subscription), Retries: 5, Timeout: 30 s.
 */
export async function enqueuePaddleProcess(
  boss: PgBoss,
  eventId: string,
  subscriptionId?: string,
): Promise<string | null> {
  return boss.send(
    QUEUE_PADDLE_PROCESS,
    { eventId },
    {
      expireInSeconds: 30,
      retryLimit: 5,
      ...(subscriptionId ? { singletonKey: subscriptionId } : {}),
    },
  );
}

/**
 * Enqueue a digest.weekly job.
 * Concurrency: 1.
 */
export async function enqueueWeeklyDigest(
  boss: PgBoss,
  payload?: DigestWeeklyJobPayload,
): Promise<string | null> {
  return boss.send(QUEUE_DIGEST_WEEKLY, payload ?? {}, {
    expireInSeconds: 15 * 60,
    retryLimit: 1,
  });
}

/**
 * Enqueue a webhook.deliver job with Section 9 parameters:
 * Concurrency: 5, Timeout: 10 s, Retries: 5.
 */
export async function enqueueWebhookDeliver(
  boss: PgBoss,
  payload: WebhookDeliverJobPayload,
): Promise<string | null> {
  return boss.send(QUEUE_WEBHOOK_DELIVER, payload, {
    expireInSeconds: 10,
    retryLimit: 5,
  });
}

/**
 * Registers a worker for every queue.
 */
export async function registerWorkers(boss: PgBoss, ctx: WorkerContext): Promise<void> {
  // SCAN_RUN_CONCURRENCY scans at once (default 1); each opens its own browser.
  await boss.work<ScanJobPayload>(
    QUEUE_SCAN_RUN,
    { localConcurrency: ctx.scanRunConcurrency ?? 1, batchSize: 1 },
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

  // Phase 8 staff jobs (staff spec section 8)
  await boss.work(QUEUE_CONTENT_PUBLISH_SCHEDULED, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleContentPublishScheduled(ctx);
  });
  await boss.work(QUEUE_SITE_REBUILD, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleSiteRebuild(ctx);
  });
  await boss.work(QUEUE_SITE_DEPLOY_STATUS, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleSiteDeployStatus(ctx);
  });
  await boss.work<MetricsComputePayload>(
    QUEUE_METRICS_COMPUTE_DAILY,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      await handleMetricsComputeDaily(jobs[0]?.data, ctx);
    },
  );
  await boss.work(QUEUE_METRICS_COMPUTE_TODAY, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleMetricsComputeToday(ctx);
  });
  await boss.work(QUEUE_UMAMI_SYNC, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleUmamiSync(ctx);
  });
  await boss.work<LegalNoticePayload>(
    QUEUE_LEGAL_NOTICE,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      if (jobs[0]?.data) await handleLegalNotice(jobs[0].data, ctx);
    },
  );
  await boss.work<ChangelogDigestPayload>(
    QUEUE_CHANGELOG_DIGEST,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      await handleChangelogDigest(jobs[0]?.data, ctx);
    },
  );
  await boss.work(QUEUE_ORGS_HEALTH, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleOrgsHealth(ctx);
  });

  // Concurrency 1 for trial.lifecycle cron
  await boss.work(QUEUE_TRIAL_LIFECYCLE, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleTrialLifecycle(ctx);
  });

  // Concurrency 1 for billing.lifecycle cron (renewal reminders, inactive-customer check-ins)
  await boss.work(QUEUE_BILLING_LIFECYCLE, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleBillingLifecycle(ctx);
  });

  // Concurrency 1 for paddle.process, retries 5 per spec Section 9
  await boss.work<PaddleProcessJobPayload>(
    QUEUE_PADDLE_PROCESS,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.eventId) {
        await handlePaddleProcess(job.data, ctx);
      }
    },
  );

  // Concurrency 1 for digest.weekly cron (Spec Section 9 & P5-06)
  await boss.work<DigestWeeklyJobPayload>(
    QUEUE_DIGEST_WEEKLY,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      await handleWeeklyDigest(job?.data, ctx);
    },
  );

  // Concurrency 5 for webhook.deliver (Spec Section 9 & P5-07)
  await boss.work<WebhookDeliverJobPayload>(
    QUEUE_WEBHOOK_DELIVER,
    { localConcurrency: 5, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (job?.data?.webhookId) {
        await handleWebhookDeliver(job.data, ctx);
      }
    },
  );

  // Concurrency 1 for report.schedule cron (Spec Section 9 & P5-08)
  await boss.work(QUEUE_REPORT_SCHEDULE, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleReportSchedule(undefined, ctx);
  });

  // site.reverify: concurrency 4 (Spec Section 9); weekly sweep fans out one job per site
  await boss.work<SiteReverifyJobPayload>(
    QUEUE_SITE_REVERIFY,
    { localConcurrency: 4, batchSize: 1 },
    async ([job]) => {
      if (job?.data?.siteId) await handleSiteReverify(job.data, ctx);
    },
  );
  await boss.work(QUEUE_SITE_REVERIFY_SWEEP, { localConcurrency: 1, batchSize: 1 }, async () => {
    await handleSiteReverifySweep(ctx, (siteId) => enqueueSiteReverify(boss, siteId));
  });

  // privacy.export (P6-09): one at a time, exports are rare and memory-bound
  await boss.work<DataExportJobPayload>(
    QUEUE_PRIVACY_EXPORT,
    { localConcurrency: 1, batchSize: 1 },
    async ([job]) => {
      if (job?.data?.exportId) await handleDataExport(job.data, ctx);
    },
  );

  // Concurrency 1 for retention.prune cron (Spec Section 9 & P5-10)
  await boss.work<RetentionPruneJobPayload>(
    QUEUE_RETENTION_PRUNE,
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      await handleRetentionPrune(job?.data, ctx);
    },
  );
}

/**
 * Enqueue a site.reverify job with Section 9 parameters:
 * Concurrency: 4, Timeout: 1 min, Retries: 2.
 */
export async function enqueueSiteReverify(boss: PgBoss, siteId: string): Promise<string | null> {
  return boss.send(QUEUE_SITE_REVERIFY, { siteId } satisfies SiteReverifyJobPayload, {
    expireInSeconds: 60,
    retryLimit: 2,
    retryDelay: 300,
    singletonKey: `site.reverify:${siteId}`,
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

  // billing.lifecycle runs daily at 09:00 UTC
  await boss.schedule(QUEUE_BILLING_LIFECYCLE, '0 9 * * *', {});

  // digest.weekly runs hourly to catch Mon 07:00 in each org's time zone (Spec Section 9 & P5-06)
  await boss.schedule(QUEUE_DIGEST_WEEKLY, '0 * * * *', {});

  // report.schedule runs daily at 06:00 UTC (Spec Section 9 & P5-08). The job throws when a
  // schedule fails, so retry it; already-sent schedules are skipped on retry.
  await boss.schedule(
    QUEUE_REPORT_SCHEDULE,
    '0 6 * * *',
    {},
    { retryLimit: 3, retryDelay: 15 * 60, retryBackoff: true },
  );

  // site.reverify sweep runs weekly, Monday 03:00 UTC (Spec Section 9)
  await boss.schedule(QUEUE_SITE_REVERIFY_SWEEP, '0 3 * * 1', {});

  // retention.prune runs daily at 02:00 UTC (Spec Section 9 & P5-10)
  await boss.schedule(QUEUE_RETENTION_PRUNE, '0 2 * * *', {});

  // Staff spec section 8
  const retry = { retryLimit: 3, retryDelay: 5 * 60, retryBackoff: true };
  await boss.schedule(QUEUE_CONTENT_PUBLISH_SCHEDULED, '*/5 * * * *', {});
  // Sweeps queued rebuilds once the 2-minute debounce has passed, and keeps status polling alive.
  await boss.schedule(QUEUE_SITE_REBUILD, '* * * * *', {});
  await boss.schedule(QUEUE_SITE_DEPLOY_STATUS, '*/5 * * * *', {});
  await boss.schedule(QUEUE_METRICS_COMPUTE_DAILY, '0 1 * * *', {}, retry);
  await boss.schedule(QUEUE_METRICS_COMPUTE_TODAY, '5 * * * *', {}, retry);
  await boss.schedule(QUEUE_UMAMI_SYNC, '10 * * * *', {}, retry);
  await boss.schedule(QUEUE_ORGS_HEALTH, '30 2 * * *', {}, retry);
  // Monthly product-updates email: the 1st at 10:00 UTC, covering last month's changelog.
  await boss.schedule(QUEUE_CHANGELOG_DIGEST, '0 10 1 * *', {}, retry);
}

/** Queue a history backfill of metrics_daily (used by the backfill script). */
export async function enqueueMetricsBackfill(
  boss: PgBoss,
  backfillDays: number,
): Promise<string | null> {
  return boss.send(QUEUE_METRICS_COMPUTE_DAILY, { backfillDays } satisfies MetricsComputePayload, {
    expireInSeconds: 30 * 60,
  });
}

export async function enqueueRetentionPrune(
  boss: PgBoss,
  payload: RetentionPruneJobPayload = {},
): Promise<string | null> {
  return boss.send(QUEUE_RETENTION_PRUNE, payload);
}

/** privacy.export (P6-09): Timeout 5 min, Retries 2. */
export async function enqueueDataExport(boss: PgBoss, exportId: string): Promise<string | null> {
  return boss.send(QUEUE_PRIVACY_EXPORT, { exportId } satisfies DataExportJobPayload, {
    expireInSeconds: 5 * 60,
    retryLimit: 2,
    retryDelay: 60,
  });
}

/** legal.notice: resumable, so retry generously. */
export async function enqueueLegalNotice(boss: PgBoss, noticeId: string): Promise<string | null> {
  return boss.send(QUEUE_LEGAL_NOTICE, { noticeId } satisfies LegalNoticePayload, {
    retryLimit: 5,
    retryDelay: 120,
    retryBackoff: true,
    expireInSeconds: 6 * 60 * 60,
  });
}
