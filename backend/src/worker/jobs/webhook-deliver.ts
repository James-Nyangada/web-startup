import crypto from 'node:crypto';
import type { WebhookDeliverJobPayload, WorkerContext } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { assertPublicUrl, type PublicTarget } from '../../scanner/net/guard.js';
import { pinnedPost } from '../../scanner/net/guarded-fetch.js';
import { signHmacSha256 } from '../../lib/encryption.js';
import type { WebhookDisabledData } from '../../emails/types.js';
import { listOrgAdmins, notifyInApp, sendEmail } from '../notify.js';

/** Slack mrkdwn treats &, < and > as control characters. */
function slackEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function str(data: Record<string, unknown>, key: string): string | undefined {
  return typeof data[key] === 'string' ? data[key] : undefined;
}

function num(data: Record<string, unknown>, key: string): number | undefined {
  return typeof data[key] === 'number' ? data[key] : undefined;
}

export function formatSlackMessage(event: string, data: Record<string, unknown>): string {
  const siteName = slackEscape(str(data, 'siteName') ?? str(data, 'siteId') ?? 'Site');
  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';
  const siteId = str(data, 'siteId');
  const sitePath = (path: string) => (siteId ? `${appUrl}/sites/${siteId}${path}` : appUrl);

  switch (event) {
    case 'scan.completed': {
      const score = num(data, 'score') ?? '—';
      const critical = num(data, 'criticalCount') ?? 0;
      const serious = num(data, 'seriousCount') ?? 0;
      const scanId = str(data, 'scanId');
      return `*Scan completed for ${siteName}*\nScore: *${score}* | Critical: ${critical} | Serious: ${serious}\n<${sitePath(scanId ? `/scans/${scanId}` : '')}|View scan results>`;
    }
    case 'issue.regressed': {
      const issues = Array.isArray(data['issues'])
        ? (data['issues'] as Array<{ ruleId?: unknown }>)
            .map((i) => (typeof i.ruleId === 'string' ? i.ruleId : null))
            .filter((r): r is string => Boolean(r))
        : [];
      const count = num(data, 'regressedCount') ?? (issues.length || 1);
      const single = str(data, 'issueTitle');
      const detail = single
        ? `Issue: *${slackEscape(single)}* (${slackEscape(str(data, 'impact') ?? 'serious')})`
        : `${count} previously fixed issue${count === 1 ? '' : 's'} came back${
            issues.length ? `: ${issues.slice(0, 5).map(slackEscape).join(', ')}` : ''
          }${issues.length > 5 ? ` and ${issues.length - 5} more` : ''}.`;
      return `:warning: *Regression detected on ${siteName}*\n${detail}\n<${sitePath('/issues?status=open')}|View regression>`;
    }
    case 'issues.new_critical': {
      const count = num(data, 'count') ?? 10;
      return `:rotating_light: *High severity spike on ${siteName}*\n${count} new critical or serious issues discovered in the latest scan.\n<${sitePath('/issues?status=open')}|Review issues>`;
    }
    case 'site.verification_failed': {
      const reason = str(data, 'reason');
      return `:x: *Site verification failed for ${siteName}*\nOwnership verification could not be confirmed${
        reason ? `: ${slackEscape(reason)}` : '.'
      }\n<${sitePath('/verify')}|Check verification settings>`;
    }
    case 'test': {
      return `:white_check_mark: *EveryVisitor Webhook Test*\nWebhook connection successfully received test event.`;
    }
    default:
      return `*EveryVisitor Event: ${slackEscape(event)}* on ${siteName}\n<${appUrl}|Open dashboard>`;
  }
}

export async function handleWebhookDeliver(
  job: WebhookDeliverJobPayload,
  ctx: WorkerContext,
): Promise<{ ok: boolean; status: number | null }> {
  const webhook = await ctx.repos.webhooks.findRawById(job.webhookId);
  if (!webhook || !webhook.active) {
    return { ok: false, status: null };
  }

  const orgId = webhook.orgId as OrgId;
  const start = Date.now();

  // Re-validate against SSRF guard right before delivery (Spec §11.2). The connection is
  // then pinned to the validated address and redirects are not followed.
  let target: PublicTarget;
  try {
    target = await assertPublicUrl(webhook.url, ctx.scannerPolicy);
  } catch (err: unknown) {
    const errorMsg = `SSRF Guard blocked delivery: ${err instanceof Error ? err.message : String(err)}`;
    await ctx.repos.webhooks.logDelivery(orgId, webhook.id, {
      event: job.event,
      status: null,
      error: errorMsg,
      durationMs: Date.now() - start,
      payload: job.payload,
    });
    await ctx.repos.webhooks.recordDeliveryResult(webhook.id, null, errorMsg, false);
    throw err;
  }

  // Prepare payload & headers
  let body: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Plainsight-Webhooks/1.0',
  };

  if (webhook.kind === 'slack') {
    const text = formatSlackMessage(job.event, job.payload);
    body = JSON.stringify({ text });
  } else {
    const envelope = {
      id: crypto.randomUUID(),
      type: job.event,
      createdAt: new Date().toISOString(),
      data: job.payload,
    };
    body = JSON.stringify(envelope);

    if (webhook.secret) {
      headers['X-Signature'] = signHmacSha256(webhook.secret, body);
    }
  }

  let status: number | null = null;
  let errorMsg: string | null = null;
  let isSuccess = false;

  try {
    const post = ctx.webhookTransport ?? pinnedPost;
    const res = await post(target, { headers, body, timeoutMs: 10_000 }); // 10s per spec Section 9

    status = res.status;
    const durationMs = Date.now() - start;

    if (res.ok) {
      isSuccess = true;
      await ctx.repos.webhooks.logDelivery(orgId, webhook.id, {
        event: job.event,
        status,
        error: null,
        durationMs,
        payload: job.payload,
      });

      await ctx.repos.webhooks.recordDeliveryResult(webhook.id, status, null, true);
      return { ok: true, status };
    } else {
      errorMsg =
        status >= 300 && status < 400
          ? `HTTP ${status}: redirects are not followed for webhooks`
          : `HTTP ${status}: ${res.text.slice(0, 300)}`;
      throw new Error(`Webhook delivery failed with status ${status}`);
    }
  } catch (err: unknown) {
    if (isSuccess) throw err;

    const durationMs = Date.now() - start;
    const errText = err instanceof Error ? err.message : String(err);
    errorMsg = errorMsg ?? errText;

    await ctx.repos.webhooks.logDelivery(orgId, webhook.id, {
      event: job.event,
      status,
      error: errorMsg,
      durationMs,
      payload: job.payload,
    });

    const { autoDisabled } = await ctx.repos.webhooks.recordDeliveryResult(
      webhook.id,
      status,
      errorMsg,
      false,
    );

    if (autoDisabled) {
      await notifyAutoDisabled(orgId, webhook.url, ctx);
    }

    throw err;
  }
}

async function notifyAutoDisabled(
  orgId: OrgId,
  webhookUrl: string,
  ctx: WorkerContext,
): Promise<void> {
  const org = await ctx.repos.organizations.findById(orgId);
  const orgName = org?.name ?? 'your organisation';
  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';
  const admins = await listOrgAdmins(ctx, orgId);

  const emailData: WebhookDisabledData = {
    orgName,
    webhookUrl,
    failureCount: 10,
    settingsUrl: `${appUrl}/settings/integrations`,
  };
  for (const admin of admins) {
    await sendEmail(ctx, admin.email, 'E-21', emailData);
  }

  // In-app mirror of E-21 (P5-05)
  await notifyInApp(
    ctx,
    orgId,
    admins.map((a) => a.userId),
    {
      type: 'webhook_disabled',
      title: 'A webhook was turned off',
      body: `Deliveries to ${new URL(webhookUrl).host} failed 10 times in a row, so the webhook was disabled.`,
      link: '/settings/integrations',
    },
  );
}

/**
 * Finds all active webhooks subscribed to `event` and enqueues delivery for each.
 */
export async function dispatchWebhooks(
  orgId: OrgId,
  event: string,
  siteId: string | undefined,
  payload: Record<string, unknown>,
  ctx: WorkerContext,
): Promise<number> {
  try {
    const webhooks = await ctx.repos.webhooks.findActiveByEvent(orgId, event, siteId);
    let enqueued = 0;

    for (const webhook of webhooks) {
      if (ctx.boss) {
        const { enqueueWebhookDeliver } = await import('../boss.js');
        await enqueueWebhookDeliver(ctx.boss, {
          webhookId: webhook.id,
          event,
          payload,
        });
      } else {
        // Direct execution in tests or monolithic runner
        void handleWebhookDeliver(
          {
            webhookId: webhook.id,
            event,
            payload,
          },
          ctx,
        ).catch((err) => {
          console.error(`[webhooks] Delivery failed for ${webhook.id}:`, err);
        });
      }
      enqueued++;
    }

    return enqueued;
  } catch (err) {
    console.error(`[webhooks] Error dispatching event ${event}:`, err);
    return 0;
  }
}
