import { asOrgId } from '../../db/repositories/org-scope.js';
import { createGuardedFetch } from '../../scanner/net/guarded-fetch.js';
import { verifyOwnership } from '../../scanner/verification/verify.js';
import { listOrgAdmins, notifyInApp, sendEmail } from '../notify.js';
import type { SiteReverifyJobPayload, WorkerContext } from '../types.js';
import { dispatchWebhooks } from './webhook-deliver.js';

/** Consecutive failed re-verifications before owners and admins are told (spec section 10, E-09). */
export const REVERIFY_ALERT_THRESHOLD = 3;

export type ReverifyOutcome = 'verified' | 'failed' | 'alerted' | 'skipped';

export const RECHECKABLE_METHODS = ['meta', 'dns', 'file'] as const;

function isRecheckable(method: string | null | undefined): method is 'meta' | 'dns' | 'file' {
  return (RECHECKABLE_METHODS as readonly string[]).includes(method ?? '');
}

/**
 * site.reverify (P2-07, needed by P5-05/P5-07): re-runs the site's own verification method.
 * A pass resets the failure count. The third failure in a row sends E-09, an in-app
 * notification and the site.verification_failed webhook, once per failure streak. The site
 * stays active so monitoring is not interrupted while the owner fixes it.
 */
export async function handleSiteReverify(
  job: SiteReverifyJobPayload,
  ctx: WorkerContext,
): Promise<ReverifyOutcome> {
  const site = await ctx.repos.sites.findRawById(job.siteId);
  const method = site?.verifyMethod;
  // shopify/plugin verification is owned by those integrations (Phase 7), not re-checkable here
  if (!site || site.status !== 'active' || !site.verifiedAt || !isRecheckable(method)) {
    return 'skipped';
  }

  const fetcher = createGuardedFetch({
    policy: ctx.scannerPolicy,
    userAgent:
      ctx.userAgent ?? 'Mozilla/5.0 (compatible; EveryVisitorBot/1.0; +https://everyvisitor.app/bot)',
    timeoutMs: 10_000,
    maxBytes: 2 * 1024 * 1024,
  });
  const result = await verifyOwnership(site.rootUrl, site.verifyToken, method, {
    fetcher,
  }).catch((err: unknown) => ({
    ok: false,
    reason: err instanceof Error ? err.message : 'The site could not be reached.',
  }));

  const failures = await ctx.repos.sites.recordReverifyResult(site.id, result.ok);
  if (result.ok) return 'verified';
  if (failures !== REVERIFY_ALERT_THRESHOLD) return 'failed';

  const orgId = asOrgId(site.orgId);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const reason = result.reason ?? 'The verification check did not pass.';
  const admins = await listOrgAdmins(ctx, orgId);

  for (const admin of admins) {
    await sendEmail(ctx, admin.email, 'E-09', {
      siteName: site.name,
      rootUrl: site.rootUrl,
      method,
      failureCount: failures,
      reason,
      verifyUrl: `${appUrl}/sites/${site.id}/verify`,
    });
  }
  await notifyInApp(
    ctx,
    orgId,
    admins.map((a) => a.userId),
    {
      type: 'verification_failing',
      title: `Can't verify ${site.name}`,
      body: `Ownership could not be confirmed ${failures} times in a row: ${reason}`,
      link: `/sites/${site.id}/verify`,
    },
  );
  if (ctx.repos.webhooks) {
    await dispatchWebhooks(
      orgId,
      'site.verification_failed',
      site.id,
      {
        siteId: site.id,
        siteName: site.name,
        rootUrl: site.rootUrl,
        method,
        failureCount: failures,
        reason,
      },
      ctx,
    );
  }
  await ctx.repos.auditLog.write(orgId, {
    actorType: 'system',
    action: 'site.verification_failing',
    targetType: 'site',
    targetId: site.id,
    data: { failureCount: failures, method, reason },
  });
  return 'alerted';
}

/** Weekly sweep: one site.reverify job per verified, active site. */
export async function handleSiteReverifySweep(
  ctx: WorkerContext,
  enqueue: (siteId: string) => Promise<unknown>,
): Promise<number> {
  const sites = await ctx.repos.sites.listForReverify();
  for (const site of sites) {
    await enqueue(site.id);
  }
  return sites.length;
}
