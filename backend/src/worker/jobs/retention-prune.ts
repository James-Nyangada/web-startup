import { logger } from '../../lib/logger.js';
import type { WorkerContext, RetentionPruneJobPayload, RetentionPruneReport } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { PLAN_DEFINITIONS, type PlanType } from '../../shared/plans.js';

export async function handleRetentionPrune(
  payload: RetentionPruneJobPayload = {},
  ctx: WorkerContext,
): Promise<RetentionPruneReport> {
  const startTime = Date.now();
  const dryRun = Boolean(payload.dryRun);

  let orgsEvaluated = 0;
  let totalOccurrencesPruned = 0;
  let totalPagesPruned = 0;
  let totalRawFilesPruned = 0;
  let deletedOrgsPurged = 0;
  const purgeFailures: string[] = [];
  const details: RetentionPruneReport['details'] = [];

  // Determine orgs to evaluate
  let targetOrgs: Array<{ id: string; name: string; plan: string | null }> = [];
  if (payload.orgId) {
    const single = await ctx.repos.organizations.findById(payload.orgId);
    if (single) {
      targetOrgs = [{ id: single.id, name: single.name, plan: single.plan }];
    }
  } else {
    const active = await ctx.repos.organizations.listAllActive();
    targetOrgs = active.map((o) => ({ id: o.id, name: o.name, plan: o.plan }));
  }

  for (const org of targetOrgs) {
    if (ctx.abortSignal?.aborted) break;

    orgsEvaluated++;
    const orgId = org.id as OrgId;
    const planName = (org.plan ?? 'trial') as PlanType;
    const planDef = PLAN_DEFINITIONS[planName] ?? PLAN_DEFINITIONS.trial;
    const retentionMonths = planDef.retentionMonths ?? 1;

    // Calculate cutoff date for this organization's plan
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - retentionMonths);

    // Retrieve stats
    const stats = await ctx.repos.retention.getPrunableStats(orgId, cutoff);

    let occurrencesPruned = stats.occurrencesCount;
    let pagesPruned = stats.pagesCount;
    const rawFilesPruned = stats.rawKeys.length;

    if (!dryRun) {
      // 1. Delete R2 raw scan files
      for (const key of stats.rawKeys) {
        try {
          await ctx.storage.deleteObject(key);
        } catch (err) {
          console.warn(`[retention.prune] Failed to delete raw scan file ${key}:`, err);
        }
      }

      // 2. Prune transient records in DB
      const result = await ctx.repos.retention.pruneTransientData(orgId, cutoff);
      occurrencesPruned = result.occurrencesDeleted;
      pagesPruned = result.pagesDeleted;
    }

    totalOccurrencesPruned += occurrencesPruned;
    totalPagesPruned += pagesPruned;
    totalRawFilesPruned += rawFilesPruned;

    details.push({
      orgId: org.id,
      orgName: org.name,
      plan: planName,
      retentionMonths,
      cutoffDate: cutoff.toISOString(),
      occurrencesPruned,
      pagesPruned,
      rawFilesPruned,
    });
  }

  // Purge soft-deleted orgs older than 30 days (Section 5.8)
  if (!payload.orgId) {
    const purgeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const purgeableOrgs = await ctx.repos.retention.findPurgeableOrgs(purgeCutoff);
    deletedOrgsPurged = purgeableOrgs.length;

    if (!dryRun) {
      for (const org of purgeableOrgs) {
        try {
          // Collect file keys first: the rows that point to them go with the org.
          const fileKeys = await ctx.repos.retention.listOrgFileKeys(org.id);
          await ctx.repos.retention.purgeOrganization(org.id);
          for (const key of fileKeys) {
            await ctx.storage.deleteObject(key).catch((err: unknown) => {
              console.warn(`[retention.prune] Failed to delete file ${key} of org ${org.id}:`, err);
            });
          }
        } catch (err) {
          purgeFailures.push(org.id);
          console.error(`[retention.prune] Failed to purge deleted org ${org.id}:`, err);
        }
      }
      deletedOrgsPurged -= purgeFailures.length;
    }
  }

  // Webhook delivery log (S-46 shows the last 20): keep 30 days
  const deliveryCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const webhookDeliveriesPruned =
    dryRun || payload.orgId || !ctx.repos.webhooks?.pruneDeliveries
      ? 0
      : await ctx.repos.webhooks.pruneDeliveries(deliveryCutoff);

  // Personal data exports (P6-09): the file goes once its download link expires.
  let dataExportsExpired = 0;
  if (!dryRun && !payload.orgId && ctx.repos.privacy?.listExpiredExports) {
    for (const row of await ctx.repos.privacy.listExpiredExports()) {
      if (!row.fileKey) continue;
      await ctx.storage.deleteObject(row.fileKey).catch((err: unknown) => {
        console.warn(`[retention.prune] Failed to delete export ${row.id}:`, err);
      });
      await ctx.repos.privacy.clearExportFile(row.id);
      dataExportsExpired++;
    }
  }

  const durationMs = Date.now() - startTime;
  const report: RetentionPruneReport = {
    orgsEvaluated,
    occurrencesPruned: totalOccurrencesPruned,
    pagesPruned: totalPagesPruned,
    rawFilesPruned: totalRawFilesPruned,
    deletedOrgsPurged,
    purgeFailures,
    webhookDeliveriesPruned,
    dataExportsExpired,
    dryRun,
    durationMs,
    details,
  };

  // Staff report: a structured system log line (and the job's return value in pg-boss).
  // Not written to any org's audit log, which customers can read.
  logger.info(
    { job: 'retention.prune', ...report, details: undefined },
    'retention.prune finished',
  );

  return report;
}
