import type { WorkerContext } from '../types.js';
import { asOrgId } from '../../db/repositories/org-scope.js';
import { enqueueEmailSend } from '../boss.js';
import { getPlanDefinition, type PlanType } from '../../shared/plans.js';
import {
  CHECK_IN_COOLDOWN_DAYS,
  INACTIVE_AFTER_DAYS,
  sendCheckIn,
} from '../../billing/customer-outreach.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days of notice before an automatic renewal. */
export const RENEWAL_NOTICE_DAYS = { year: 7, month: 5 } as const;

export interface BillingLifecycleResult {
  renewalReminders: number;
  checkIns: number;
}

/**
 * Job handler for billing.lifecycle, run daily.
 * - Renewal reminders (E-25): 7 days before an annual renewal, 5 days before a monthly one.
 *   Each billing period is reminded once, even if the job runs late or twice.
 * - Inactive customers (E-26): a paying owner with no activity for 14 days gets one personal
 *   check-in, at most once every 30 days. Staff can send the same email by hand.
 */
export async function handleBillingLifecycle(ctx: WorkerContext): Promise<BillingLifecycleResult> {
  const now = new Date();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const result: BillingLifecycleResult = { renewalReminders: 0, checkIns: 0 };

  const due = await ctx.repos.subscriptions.listRenewingBetween(
    now,
    new Date(now.getTime() + RENEWAL_NOTICE_DAYS.year * DAY_MS),
  );
  for (const sub of due) {
    if (ctx.abortSignal?.aborted) break;
    if (!sub.currentPeriodEnd) continue;
    const interval: 'month' | 'year' = sub.interval === 'year' ? 'year' : 'month';
    const daysUntil = (sub.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS;
    if (daysUntil > RENEWAL_NOTICE_DAYS[interval]) continue;

    const orgId = asOrgId(sub.orgId);
    const key = `renewal:${sub.id}:${sub.currentPeriodEnd.toISOString()}`;
    if (await ctx.repos.auditLog.hasActionWithKey(orgId, 'billing.renewal_reminder_sent', key)) {
      continue;
    }
    const [owner, org] = await Promise.all([
      ctx.repos.memberships.findOwner(orgId),
      ctx.repos.organizations.findById(orgId),
    ]);
    if (!owner?.email || !org) continue;

    const plan = getPlanDefinition(sub.plan as PlanType);
    const price = interval === 'year' ? plan.priceAnnual : plan.priceMonthly;
    const payload = {
      orgName: org.name,
      planName: plan.name,
      interval,
      daysUntilRenewal: Math.max(1, Math.ceil(daysUntil)),
      renewsAt: sub.currentPeriodEnd.toISOString(),
      amountFormatted: price > 0 ? `$${price.toFixed(2)}` : undefined,
      billingUrl: `${appUrl}/settings/billing`,
    };
    if (ctx.boss) {
      await enqueueEmailSend(ctx.boss, { to: owner.email, templateId: 'E-25', data: payload });
    } else if (ctx.emailSender) {
      await ctx.emailSender.send({ to: owner.email, templateId: 'E-25', data: payload });
    } else {
      continue;
    }
    await ctx.repos.auditLog.write(orgId, {
      actorType: 'system',
      action: 'billing.renewal_reminder_sent',
      targetType: 'subscription',
      targetId: sub.id,
      data: {
        idempotencyKey: key,
        interval,
        renewsAt: sub.currentPeriodEnd.toISOString(),
        to: owner.email,
      },
    });
    result.renewalReminders++;
  }

  const inactive = await ctx.repos.staff.listInactivePaying(INACTIVE_AFTER_DAYS);
  for (const row of inactive) {
    if (ctx.abortSignal?.aborted) break;
    if (row.lastCheckInAt) {
      const sinceCheckIn = (now.getTime() - row.lastCheckInAt.getTime()) / DAY_MS;
      if (sinceCheckIn < CHECK_IN_COOLDOWN_DAYS || row.lastCheckInAt > row.lastActiveAt) continue;
    }
    await sendCheckIn(
      ctx.repos,
      { boss: ctx.boss, emailSender: ctx.emailSender, appUrl },
      { ...row, trigger: 'auto' },
    );
    result.checkIns++;
  }

  return result;
}
