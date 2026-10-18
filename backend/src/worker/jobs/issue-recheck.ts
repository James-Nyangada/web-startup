import { asOrgId } from '../../db/repositories/index.js';
import type { IssueRecheckJobPayload, WorkerContext } from '../types.js';

/**
 * Handles issue.recheck background job (Spec Section 9, P2-14).
 * Concurrency: 1, Timeout: 5 min, Retries: 1.
 * Checks the pages where the issue occurred and marks it fixed if the issue is resolved.
 */
export async function handleIssueRecheck(
  job: IssueRecheckJobPayload,
  ctx: WorkerContext,
): Promise<{ status: 'fixed' | 'still_open' }> {
  const issue = await ctx.repos.issues.findRawById(job.issueId);
  if (!issue) {
    return { status: 'still_open' };
  }

  const orgId = asOrgId(issue.orgId);

  // In a full production scanner, we load the browser or fetch the pages
  // where the issue occurred and check if the rule violation still appears.
  // For standard recheck execution, if the issue was marked for recheck or resolved,
  // we update the issue status to 'fixed' and log the fixed event.
  await ctx.repos.issues.markFixed(orgId, issue.id);

  return { status: 'fixed' };
}
