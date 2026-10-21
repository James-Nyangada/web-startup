import type { ScanResult } from '../../scanner/scan.js';
import { countIssues } from '../../scanner/scan.js';
import { diffScans, type ScannedPage } from '../../scanner/results/diff.js';
import { asOrgId } from '../../db/repositories/index.js';
import type { ScanJobPayload, WorkerContext } from '../types.js';
import { publishScanProgress } from '../progress.js';
import { dispatchWebhooks } from './webhook-deliver.js';
import { notifyInApp, sendEmail } from '../notify.js';
import type { OrgId } from '../../db/repositories/org-scope.js';

export async function handleScanProcess(job: ScanJobPayload, ctx: WorkerContext): Promise<void> {
  const scan = await ctx.repos.scans.findRawById(job.scanId);
  if (!scan) return;

  // Don't re-process terminal scans
  if (scan.status === 'completed' || scan.status === 'failed' || scan.status === 'canceled') {
    return;
  }

  if (!scan.rawKey) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'MISSING_SCAN_DATA',
      'Raw scan results key was not found.',
    );
    return;
  }

  const rawBuffer = await ctx.storage.getObject(scan.rawKey);
  if (!rawBuffer) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'RAW_DATA_NOT_FOUND',
      'Could not read raw scan data from storage.',
    );
    return;
  }

  let scanResult: ScanResult;
  try {
    scanResult = JSON.parse(rawBuffer.toString('utf-8')) as ScanResult;
  } catch (err: unknown) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'INVALID_RAW_JSON',
      `Failed to parse scan result JSON: ${(err as Error).message}`,
    );
    return;
  }

  const orgId = asOrgId(scan.orgId);

  // 1. Fetch previous issues for the site to apply the status machine
  const previousIssues = await ctx.repos.issues.listForDiff(orgId, scan.siteId);

  // 2. Fetch pages to map URLs to page IDs for occurrences
  const sitePages = await ctx.repos.pages.listBySite(orgId, scan.siteId, 2000);
  const pageUrlToIdMap = new Map<string, string>(sitePages.map((p) => [p.url, p.id]));

  // 3. Prepare scanned pages array for diffScans
  const scannedPages: ScannedPage[] = scanResult.pages.map((p) => ({
    url: p.url,
    templateKey: p.templateKey,
    ok: p.status === 'ok',
  }));

  // 4. Run pure status machine diffing (Section 6.7)
  const diff = diffScans(previousIssues, scanResult.issues, scannedPages, scanResult.pagesPlanned);

  // 5. Apply diff to database: issues, occurrences, and events
  const { createdCount, fixedCount, regressedCount, fixedIssues, regressedIssues } =
    await ctx.repos.issues.applyScanDiff(
      orgId,
      scan.siteId,
      scan.id,
      diff,
      scanResult.issues,
      pageUrlToIdMap,
    );

  // 6. Calculate counts and final status
  const counts = countIssues(scanResult.issues);
  const finalStatus =
    diff.partial || scanResult.status === 'partial'
      ? 'partial'
      : scanResult.pagesScanned === 0
        ? 'failed'
        : 'completed';

  // 7. Update scan with score, counts, and completion status
  await ctx.repos.scans.updateRaw(scan.id, {
    status: finalStatus,
    score: scanResult.score,
    counts: {
      ...counts,
      new: createdCount,
      fixed: fixedCount,
      regressed: regressedCount,
    },
    finishedAt: new Date(),
  });

  // 8. Publish completion event
  await publishScanProgress(ctx.pool, scan.id, {
    phase: 'completed',
    status: finalStatus,
    pagesScanned: scanResult.pagesScanned,
    pagesPlanned: scanResult.pagesPlanned,
    score: scanResult.score,
  });

  // 9. Record compliance evidence events (P5-01)
  if (ctx.repos.evidenceEvents?.record) {
    if (finalStatus === 'completed' || finalStatus === 'partial') {
      await ctx.repos.evidenceEvents.record(orgId, {
        siteId: scan.siteId,
        type: 'scan_completed',
        actorId: scan.requestedBy,
        data: {
          scanId: scan.id,
          score: scanResult.score,
          pagesScanned: scanResult.pagesScanned,
          counts: {
            ...counts,
            new: createdCount,
            fixed: fixedCount,
            regressed: regressedCount,
          },
        },
      });
    }

    for (const item of fixedIssues) {
      await ctx.repos.evidenceEvents.record(orgId, {
        siteId: scan.siteId,
        type: 'issue_fixed',
        actorId: null,
        data: {
          issueId: item.id,
          ruleId: item.ruleId,
          scanId: scan.id,
          score: scanResult.score,
        },
      });
    }

    for (const item of regressedIssues) {
      await ctx.repos.evidenceEvents.record(orgId, {
        siteId: scan.siteId,
        type: 'issue_regressed',
        actorId: null,
        data: {
          issueId: item.id,
          ruleId: item.ruleId,
          scanId: scan.id,
          score: scanResult.score,
        },
      });
    }
  }

  // 10. Alert and notification dispatch (P5-05)
  const newCriticalOrSerious = diff.created.filter(
    (i) => i.impact === 'critical' || i.impact === 'serious',
  ).length;

  const hasRegressions = regressedCount > 0;
  const hasSpike = newCriticalOrSerious >= 10;

  if (hasRegressions || hasSpike) {
    const eligibleRegressions: Array<{
      id: string;
      ruleId?: string;
      regressionCount?: number;
    }> = [];

    if (hasRegressions) {
      for (const reg of regressedIssues as Array<{
        id: string;
        ruleId?: string;
        regressionCount?: number;
      }>) {
        const key = `regression:${reg.id}:${reg.regressionCount ?? 1}`;
        const alreadyAlerted = await ctx.repos.auditLog.hasActionWithKey?.(
          orgId,
          'alert.regression',
          key,
        );
        if (!alreadyAlerted) {
          eligibleRegressions.push(reg);
        }
      }
    }

    const shouldAlert = eligibleRegressions.length > 0 || hasSpike;

    if (shouldAlert) {
      const site = await ctx.repos.sites.findRawById(scan.siteId);
      const siteName = site?.name ?? 'Site';
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const viewUrl = `${appUrl}/sites/${scan.siteId}/issues?status=open`;

      const optedMembers = ctx.repos.notifications
        ? await ctx.repos.notifications.listOptedInMembers(orgId, 'regressions')
        : [];

      const alertTitle = hasRegressions
        ? `Regression detected on ${siteName}`
        : `10+ new critical issues on ${siteName}`;

      const alertBody = hasRegressions
        ? `${regressedCount} previously fixed issue${regressedCount === 1 ? '' : 's'} reappeared in scan #${scan.id.slice(0, 8)}.`
        : `${newCriticalOrSerious} new critical or serious accessibility issues found.`;

      if (ctx.repos.notifications && optedMembers.length > 0) {
        await ctx.repos.notifications.createInAppBatch(
          orgId,
          optedMembers.map((m) => m.userId),
          {
            type: 'regression_alert',
            title: alertTitle,
            body: alertBody,
            link: `/sites/${scan.siteId}/issues?status=open`,
          },
        );
      }

      const alertItems = hasRegressions
        ? eligibleRegressions.map((r) => ({
            title: r.ruleId ?? 'Accessibility violation',
            impact: 'critical',
          }))
        : diff.created
            .filter((i) => i.impact === 'critical' || i.impact === 'serious')
            .slice(0, 10)
            .map((i) => ({
              title: i.ruleId,
              impact: i.impact,
            }));

      for (const member of optedMembers) {
        await sendEmail(ctx, member.email, 'E-08', {
          siteName,
          regressedCount: eligibleRegressions.length,
          newCriticalCount: newCriticalOrSerious,
          items: alertItems,
          viewUrl,
        }).catch((err: unknown) => {
          console.error('[scan-process] Failed to send E-08 alert email:', err);
        });
      }

      for (const reg of eligibleRegressions) {
        const key = `regression:${reg.id}:${reg.regressionCount ?? 1}`;
        await ctx.repos.auditLog.write(orgId, {
          actorType: 'system',
          action: 'alert.regression',
          targetType: 'issue',
          targetId: reg.id,
          data: {
            idempotencyKey: key,
            regressionCount: reg.regressionCount ?? 1,
            scanId: scan.id,
          },
        });
      }

      // Webhook events: issue.regressed & issues.new_critical (P5-07)
      if (ctx.repos.webhooks) {
        if (hasRegressions && eligibleRegressions.length > 0) {
          await dispatchWebhooks(
            orgId,
            'issue.regressed',
            scan.siteId,
            {
              scanId: scan.id,
              siteId: scan.siteId,
              siteName,
              regressedCount: eligibleRegressions.length,
              issues: eligibleRegressions.map((r) => ({ id: r.id, ruleId: r.ruleId })),
            },
            ctx,
          );
        }

        if (hasSpike) {
          await dispatchWebhooks(
            orgId,
            'issues.new_critical',
            scan.siteId,
            {
              scanId: scan.id,
              siteId: scan.siteId,
              siteName,
              count: newCriticalOrSerious,
            },
            ctx,
          );
        }
      }
    }
  }

  // 11. Scan finished notifications: E-06 for the onboarding scan's requester, E-07 for
  // members by preference ('issues_only' = only when the scan found new or regressed issues)
  if ((finalStatus === 'completed' || finalStatus === 'partial') && scanResult.score !== null) {
    await notifyScanFinished(ctx, orgId, scan, {
      score: scanResult.score,
      counts,
      createdCount,
      fixedCount,
      regressedCount,
    }).catch((err: unknown) => {
      console.error('[scan-process] Failed to send scan notifications:', err);
    });
  }

  // 12. Webhook event: scan.completed (P5-07), sent for every finished scan
  if (ctx.repos.webhooks && (finalStatus === 'completed' || finalStatus === 'partial')) {
    const site = await ctx.repos.sites.findRawById(scan.siteId);
    const siteName = site?.name ?? 'Site';
    await dispatchWebhooks(
      orgId,
      'scan.completed',
      scan.siteId,
      {
        scanId: scan.id,
        siteId: scan.siteId,
        siteName,
        score: scanResult.score,
        criticalCount: counts.critical,
        seriousCount: counts.serious,
      },
      ctx,
    );
  }
}

async function notifyScanFinished(
  ctx: WorkerContext,
  orgId: OrgId,
  scan: { id: string; siteId: string; trigger: string; requestedBy: string | null },
  result: {
    score: number;
    counts: { critical: number; serious: number; moderate: number; minor: number };
    createdCount: number;
    fixedCount: number;
    regressedCount: number;
  },
): Promise<void> {
  const site = await ctx.repos.sites.findRawById(scan.siteId);
  const siteName = site?.name ?? 'Site';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const scanPath = `/sites/${scan.siteId}/scans/${scan.id}`;
  const isOnboarding = scan.trigger === 'onboarding' && Boolean(scan.requestedBy);

  if (isOnboarding) {
    const requester = await ctx.repos.users.findById(scan.requestedBy!);
    if (requester?.email) {
      await sendEmail(ctx, requester.email, 'E-06', {
        siteName,
        rootUrl: site?.rootUrl ?? '',
        score: result.score,
        criticalCount: result.counts.critical,
        seriousCount: result.counts.serious,
        moderateCount: result.counts.moderate,
        reportUrl: `${appUrl}/sites/${scan.siteId}`,
      });
    }
    await notifyInApp(ctx, orgId, [scan.requestedBy!], {
      type: 'first_scan_ready',
      title: `First scan of ${siteName} is ready`,
      body: `Score ${result.score}, with ${result.counts.critical} critical and ${result.counts.serious} serious issues to review.`,
      link: `/sites/${scan.siteId}`,
    });
  }

  if (!ctx.repos.notifications) return;
  const foundIssues = result.createdCount > 0 || result.regressedCount > 0;
  const members = (await ctx.repos.notifications.listOptedInMembers(orgId, 'scanCompleted'))
    .filter((m) => m.scanCompleted !== 'issues_only' || foundIssues)
    // The onboarding requester already got E-06 for this scan
    .filter((m) => !(isOnboarding && m.userId === scan.requestedBy));
  if (members.length === 0) return;

  const [, previous] = await ctx.repos.scans.listBySite(orgId, scan.siteId, 2);
  for (const member of members) {
    await sendEmail(ctx, member.email, 'E-07', {
      siteName,
      score: result.score,
      previousScore: previous?.score ?? null,
      newCount: result.createdCount,
      fixedCount: result.fixedCount,
      regressedCount: result.regressedCount,
      scanUrl: `${appUrl}${scanPath}`,
      unsubscribeUrl: `${appUrl}/settings/notifications`,
    }).catch((err: unknown) => {
      console.error('[scan-process] Failed to send E-07 email:', err);
    });
  }
  await notifyInApp(
    ctx,
    orgId,
    members.map((m) => m.userId),
    {
      type: 'scan_completed',
      title: `Scan of ${siteName} finished`,
      body: `Score ${result.score}: ${result.createdCount} new, ${result.fixedCount} fixed, ${result.regressedCount} regressed.`,
      link: scanPath,
    },
  );
}
