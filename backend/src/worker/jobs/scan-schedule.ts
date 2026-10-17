import type { WorkerContext } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { computeNextScanAt } from '../../lib/schedule.js';
import { enqueueScanRun } from '../boss.js';

/**
 * Job handler for scan.schedule.
 * Runs every 10 minutes via cron.
 * Enqueues scan.run for verified sites whose next_scan_at <= now() in orgs that are not read-only.
 * Spreads load by processing at most 20 sites per tick (spec Section 9 & P2-09).
 */
export async function handleScanSchedule(ctx: WorkerContext): Promise<number> {
  const dueItems = await ctx.repos.sites.findDueForScheduledScan(20);
  let scheduledCount = 0;

  for (const { site, orgTimeZone } of dueItems) {
    if (ctx.abortSignal?.aborted) {
      break;
    }

    const orgId = site.orgId as OrgId;

    // Check if a scan is already running on this site (concurrency safeguard)
    const runningScan = await ctx.repos.scans.findRunningScanForSite(orgId, site.id);
    if (runningScan) {
      // Don't enqueue another scan while one is already running
      continue;
    }

    try {
      // 1. Create scheduled scan
      const scan = await ctx.repos.scans.create(orgId, {
        siteId: site.id,
        trigger: 'scheduled',
        standard: site.standard,
        pagesPlanned: site.pageLimit ?? 50,
        requestedBy: null,
      });

      if (!scan) {
        continue;
      }

      // 2. Advance next_scan_at in org time zone
      const nextScanAt = computeNextScanAt({
        frequency: site.scanFrequency,
        scanDay: site.scanDay,
        scanHour: site.scanHour,
        timeZone: orgTimeZone || 'UTC',
        from: new Date(),
      });

      await ctx.repos.sites.updateNextScanAt(site.id, nextScanAt);

      // 3. Enqueue scan.run in background worker
      if (ctx.boss) {
        await enqueueScanRun(ctx.boss, scan.id);
      }

      scheduledCount++;
    } catch (err) {
      console.error(`[scan-schedule] Failed to schedule scan for site ${site.id}:`, err);
    }
  }

  return scheduledCount;
}
