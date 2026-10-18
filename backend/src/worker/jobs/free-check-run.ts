import type { Repositories } from '../../db/repositories/index.js';
import type { FreeCheckIssue, FreeCheckResultPayload } from '../../db/schema/system.js';
import { renderFreeCheckReportPdf } from '../../reports/render.js';
import { ruleInfo } from '../../scanner/rules/catalog.js';
import { scoreBand, scorePage } from '../../scanner/results/score.js';
import { runPages, type PageResult } from '../../scanner/runner/page-runner.js';
import { silentLogger } from '../../scanner/types.js';
import type { StorageService } from '../../storage/index.js';
import type { FreeCheckJobPayload, WorkerContext } from '../types.js';

/**
 * Scans the single page of a public free check and stores the summary and R-06 PDF.
 * Shared by the free-check.run worker and the API's in-process fallback (local
 * development without a queue).
 */
export async function runFreeCheck(
  checkId: string,
  targetUrl: string,
  repos: Repositories,
  storage?: StorageService,
): Promise<void> {
  try {
    await repos.freeChecks.updateStatus(checkId, 'running');

    // 60-second cap (Spec 11.4)
    const runResult = await runPages([{ url: targetUrl, templateKey: 'home' }], {
      userAgent: 'Mozilla/5.0 (compatible; PlainsightBot/1.0; +https://plainsight.io/bot)',
      standard: 'wcag22aa',
      pageTimeoutMs: 50_000,
      navigationTimeoutMs: 30_000,
      log: silentLogger,
    });

    const page: PageResult | undefined = runResult.pages[0];
    if (!page || page.status !== 'ok') {
      const errorMsg = page?.error || `Page scan failed with status: ${page?.status || 'unknown'}`;
      await repos.freeChecks.updateStatus(checkId, 'failed', errorMsg);
      return;
    }

    const score = scorePage(page);
    const band = scoreBand(score);

    const counts = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };

    const topIssues: FreeCheckIssue[] = [];

    for (const violation of page.violations) {
      const impact = violation.impact || 'minor';
      if (impact in counts) {
        counts[impact] += violation.nodes.length;
      }

      const info = ruleInfo(violation.ruleId, violation.impact);
      const firstNode = violation.nodes[0];

      topIssues.push({
        ruleId: violation.ruleId,
        title: info.title,
        impact,
        wcagCriteria: info.wcagCriteria,
        occurrences: violation.nodes.length,
        whoIsAffected: info.whoIsAffected[0] || 'Visitors experiencing accessibility barriers.',
        selector: firstNode?.target?.join(' > '),
        htmlSnippet: firstNode?.html?.slice(0, 300),
      });
    }

    // Sort top issues by impact weight (critical > serious > moderate > minor) then occurrences
    const impactOrder: Record<string, number> = {
      critical: 4,
      serious: 3,
      moderate: 2,
      minor: 1,
    };
    topIssues.sort((a, b) => {
      const diff = (impactOrder[b.impact] || 0) - (impactOrder[a.impact] || 0);
      return diff !== 0 ? diff : b.occurrences - a.occurrences;
    });

    const resultPayload: FreeCheckResultPayload = {
      score,
      scoreBand: band,
      counts,
      topIssues: topIssues.slice(0, 10),
      pageTitle: page.title,
      checkedAt: new Date().toISOString(),
      loadMs: page.loadMs,
    };

    await repos.freeChecks.updateResult(checkId, resultPayload, 'completed');

    // Attempt background PDF rendering and R2 storage if storage service is active
    if (storage) {
      try {
        const pdfBuffer = await renderFreeCheckReportPdf({
          url: targetUrl,
          checkedAt: resultPayload.checkedAt,
          score,
          scoreBand: band,
          counts,
          topIssues: resultPayload.topIssues,
        });
        const reportKey = `free-checks/${checkId}/report.pdf`;
        await storage.putObject(reportKey, pdfBuffer, 'application/pdf');
        await repos.freeChecks.setReportKey(checkId, reportKey);
      } catch {
        // Non-fatal if PDF generation in background fails
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await repos.freeChecks.updateStatus(checkId, 'failed', msg);
  }
}

/**
 * Handles free-check.run background job (Spec Section 9, P3-03).
 * Own lane so free checks never block paid scans. Concurrency: 1, Timeout: 90 s, Retries: 0.
 */
export async function handleFreeCheckRun(
  job: FreeCheckJobPayload,
  ctx: WorkerContext,
): Promise<void> {
  const check = await ctx.repos.freeChecks.findById(job.checkId);
  if (!check || check.status !== 'pending') return;
  await runFreeCheck(check.id, check.url, ctx.repos, ctx.storage);
}
