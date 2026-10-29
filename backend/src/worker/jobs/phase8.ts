import type { WorkerContext } from '../types.js';
import { fetchTrafficReport, umamiConfig } from '../../lib/umami.js';
import {
  QUEUE_SITE_DEPLOY_STATUS,
  pollDeployStatus,
  requestSiteRebuild,
  runQueuedRebuild,
} from '../../lib/site-rebuild.js';
import { todayUtc } from '../../db/repositories/staff-analytics.js';

const DAY_MS = 86_400_000;

const shift = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** content.publish-scheduled (every 5 min): publishes due posts and triggers one rebuild. */
export async function handleContentPublishScheduled(ctx: WorkerContext): Promise<number> {
  const due = await ctx.repos.staff.listDueScheduledPosts(new Date());
  let published = 0;
  for (const post of due) {
    if (ctx.abortSignal?.aborted) break;
    await ctx.repos.staff.publishContentPost(post.id, post.publishAt ?? new Date());
    published++;
  }
  if (published > 0) {
    await requestSiteRebuild(ctx.repos.staff, 'schedule', null, ctx.boss);
  }
  return published;
}

/** site.rebuild: calls the deploy hook for the queued deploy, then starts status polling. */
export async function handleSiteRebuild(ctx: WorkerContext): Promise<boolean> {
  const started = await runQueuedRebuild(ctx.repos.staff);
  if (started && ctx.boss) {
    await ctx.boss.send(QUEUE_SITE_DEPLOY_STATUS, {}, { startAfter: 30 });
  }
  return started;
}

/** site.deploy-status: polls Cloudflare and re-queues itself every 30 s while a build runs. */
export async function handleSiteDeployStatus(ctx: WorkerContext): Promise<number> {
  const stillBuilding = await pollDeployStatus(ctx.repos.staff);
  if (stillBuilding > 0 && ctx.boss) {
    await ctx.boss.send(QUEUE_SITE_DEPLOY_STATUS, {}, { startAfter: 30 });
  }
  return stillBuilding;
}

export interface MetricsComputePayload {
  /** YYYY-MM-DD to compute; defaults to yesterday (daily) or today (hourly). */
  date?: string;
  /** Also compute this many days before `date` (history backfill). */
  backfillDays?: number;
}

/** metrics.compute-daily (01:00 UTC): yesterday's rows, all metrics and dimensions. */
export async function handleMetricsComputeDaily(
  payload: MetricsComputePayload | undefined,
  ctx: WorkerContext,
): Promise<number> {
  const date = payload?.date ?? shift(todayUtc(), -1);
  const days = Math.max(0, payload?.backfillDays ?? 0);
  let rows = 0;
  for (let i = days; i >= 0; i--) {
    if (ctx.abortSignal?.aborted) break;
    rows += await ctx.repos.staff.computeMetricsForDate(shift(date, -i));
  }
  return rows;
}

/** metrics.compute-today (hourly): keeps today's row current. */
export async function handleMetricsComputeToday(ctx: WorkerContext): Promise<number> {
  return ctx.repos.staff.computeMetricsForDate(todayUtc());
}

/** orgs.health (02:30 UTC): scores every live organisation. */
export async function handleOrgsHealth(ctx: WorkerContext): Promise<number> {
  return ctx.repos.staff.computeAllOrgHealth((orgId, score, band, reasons) =>
    ctx.repos.staff.setOrgHealth(orgId, score, band, reasons),
  );
}

export const UMAMI_DEFAULT_RANGES = [7, 30, 90] as const;

export function umamiCacheKey(from: string, to: string): string {
  return `umami:report:${from}:${to}`;
}

/** analytics.umami-sync (hourly): refreshes cached reports and stores daily visitor totals. */
export async function handleUmamiSync(ctx: WorkerContext, f: typeof fetch = fetch): Promise<boolean> {
  const cfg = umamiConfig();
  if (!cfg) return false;
  const to = todayUtc();
  for (const days of UMAMI_DEFAULT_RANGES) {
    const from = shift(to, -(days - 1));
    const report = await fetchTrafficReport(from, to, cfg, f);
    await ctx.repos.staff.setAnalyticsCache(umamiCacheKey(from, to), report, 3600);
    if (days === Math.max(...UMAMI_DEFAULT_RANGES)) {
      for (const d of report.daily) {
        await ctx.repos.staff.recordTrafficDay(d.date, d.visitors, d.pageViews);
      }
    }
  }
  return true;
}
