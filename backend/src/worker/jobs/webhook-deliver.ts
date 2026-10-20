import crypto from 'node:crypto';
import type { WebhookDeliverJobPayload, WorkerContext } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { assertPublicUrl } from '../../scanner/net/guard.js';
import { signHmacSha256 } from '../../lib/encryption.js';
import { enqueueEmailSend } from '../boss.js';
import type { WebhookDisabledData } from '../../emails/types.js';
import { EmailSender } from '../../emails/sender.js';

export function formatSlackMessage(event: string, data: Record<string, unknown>): string {
  const siteName = String(data.siteName ?? data.siteId ?? 'Site');
  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';

  switch (event) {
    case 'scan.completed': {
      const score = data.score !== undefined && data.score !== null ? data.score : '—';
      const critical = data.criticalCount ?? 0;
      const serious = data.seriousCount ?? 0;
      return `*Scan completed for ${siteName}*\nScore: *${score}* | Critical: ${critical} | Serious: ${serious}\n<${appUrl}|View scan results>`;
    }
    case 'issue.regressed': {
      const title = data.issueTitle ?? 'Accessibility issue';
      const impact = data.impact ?? 'serious';
      return `:warning: *Regression detected on ${siteName}*\nIssue: *${title}* (${impact})\n<${appUrl}|View regression>`;
    }
    case 'issues.new_critical': {
      const count = data.count ?? 10;
      return `:rotating_light: *High severity spike on ${siteName}*\n${count} new critical or serious issues discovered in the latest scan.\n<${appUrl}|Review issues>`;
    }
    case 'site.verification_failed': {
      return `:x: *Site verification failed for ${siteName}*\nOwnership verification could not be confirmed.\n<${appUrl}|Check verification settings>`;
    }
    case 'test': {
      return `:white_check_mark: *Plainsight Webhook Test*\nWebhook connection successfully received test event.`;
    }
    default:
      return `*Plainsight Event: ${event}* on ${siteName}\n<${appUrl}|Open dashboard>`;
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

  // Re-validate against SSRF guard right before delivery (Spec §11.2)
  try {
    await assertPublicUrl(webhook.url, ctx.scannerPolicy);
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
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout per spec Section 9
    });

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
      const responseText = await res.text().catch(() => '');
      errorMsg = `HTTP ${status}: ${responseText.slice(0, 300)}`;
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

async function notifyAutoDisabled(orgId: OrgId, webhookUrl: string, ctx: WorkerContext): Promise<void> {
  const org = await ctx.repos.organizations.findById(orgId);
  const orgName = org?.name ?? 'your organisation';
  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';

  const members = await ctx.repos.memberships.list(orgId);
  const admins = members.filter((m) => m.role === 'owner' || m.role === 'admin');

  for (const admin of admins) {
    const user = await ctx.repos.users.findById(admin.userId);
    if (!user?.email) continue;

    const emailData: WebhookDisabledData = {
      orgName,
      webhookUrl,
      failureCount: 10,
      settingsUrl: `${appUrl}/settings/integrations`,
    };

    if (ctx.boss) {
      await enqueueEmailSend(ctx.boss, {
        to: user.email,
        templateId: 'E-21',
        data: emailData as unknown as Record<string, unknown>,
      });
    } else {
      const sender = ctx.emailSender ?? new EmailSender();
      await sender.send({
        to: user.email,
        templateId: 'E-21',
        data: emailData,
      });
    }
  }
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
