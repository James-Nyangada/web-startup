import { asOrgId } from '../../db/repositories/index.js';
import { groupIssues } from '../../scanner/results/issues.js';
import { runPages, type PageToScan } from '../../scanner/runner/page-runner.js';
import { silentLogger } from '../../scanner/types.js';
import type { IssueRecheckJobPayload, WorkerContext } from '../types.js';

/** Enough pages to be confident on a typical template, small enough to finish within 2 minutes. */
export const MAX_RECHECK_PAGES = 5;

export type RecheckOutcome = 'fixed' | 'still_open' | 'unchecked';

/**
 * Handles issue.recheck background job (Spec Section 9, P2-14).
 * Concurrency: 1, Timeout: 5 min, Retries: 1.
 * Re-tests only the pages where the issue occurred (spec 7.5). The issue is fixed when
 * none of the pages that loaded still produce its fingerprint.
 */
export async function handleIssueRecheck(
  job: IssueRecheckJobPayload,
  ctx: WorkerContext,
): Promise<{ status: RecheckOutcome }> {
  const issue = await ctx.repos.issues.findRawById(job.issueId);
  if (!issue) return { status: 'unchecked' };
  const orgId = asOrgId(issue.orgId);

  const site = await ctx.repos.sites.findRawById(issue.siteId);
  const occurrences = await ctx.repos.issues.listOccurrences(orgId, issue.id, { limit: 200 });

  const pages = new Map<string, PageToScan>();
  for (const occurrence of occurrences) {
    if (pages.size >= MAX_RECHECK_PAGES) break;
    pages.set(occurrence.url, { url: occurrence.url, templateKey: occurrence.templateKey });
  }

  let outcome: RecheckOutcome = 'unchecked';
  let pagesChecked = 0;

  if (site && pages.size > 0) {
    const result = await runPages([...pages.values()], {
      userAgent:
        ctx.userAgent ??
        process.env.SCANNER_USER_AGENT ??
        'PRODUCT_NAMEBot/1.0 (+https://example.com/bot)',
      standard: site.standard,
      concurrency: ctx.scannerConcurrency ?? 2,
      signal: ctx.abortSignal,
      policy: ctx.scannerPolicy,
      log: ctx.logger ?? silentLogger,
    });
    const loaded = result.pages.filter((page) => page.status === 'ok');
    pagesChecked = loaded.length;

    if (loaded.length > 0) {
      const stillThere = groupIssues(loaded).some(
        (found) => found.fingerprint === issue.fingerprint,
      );
      outcome = stillThere ? 'still_open' : 'fixed';
    }
  }

  if (outcome === 'fixed' && issue.status === 'open') {
    await ctx.repos.issues.markFixed(orgId, issue.id);
  }
  await ctx.repos.issues.recordRecheck(orgId, issue.id, { outcome, pagesChecked });

  return { status: outcome };
}
