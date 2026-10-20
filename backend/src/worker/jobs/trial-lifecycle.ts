import type { WorkerContext } from '../types.js';
import { asOrgId } from '../../db/repositories/org-scope.js';
import { enqueueEmailSend } from '../boss.js';
import { getPlanDefinition, getPriceIdForPlan, type PlanType } from '../../shared/plans.js';

export interface TrialLifecycleResult {
  processed: number;
  remindersDay10: number;
  remindersDay13: number;
  expiredCount: number;
  pastDueExpiredCount: number;
  warnings7d: number;
  warnings1d: number;
  downgradesApplied: number;
}

/**
 * Job handler for trial.lifecycle.
 * Runs hourly via cron (Spec Section 9 & P4-05/P4-06).
 * - Day 10 reminder (4 days remaining): sends E-14 to owner
 * - Day 13 reminder (1 day remaining): sends E-14 to owner
 * - Expiry: transitions org to read_only mode, writes audit log, sends E-15
 * - Past-due grace period: after 7 days past due, transitions org to read_only mode, sends E-15
 * - Data deletion warnings: 30-day retention countdown; sends E-20 at 7 days and 1 day before deletion
 * - Scheduled downgrades: applies the new plan once the paid period has ended (P4-04), sends E-19
 */
export async function handleTrialLifecycle(ctx: WorkerContext): Promise<TrialLifecycleResult> {
  const orgs = await ctx.repos.organizations.findDueForTrialLifecycle();
  const now = new Date();
  const result: TrialLifecycleResult = {
    processed: orgs.length,
    remindersDay10: 0,
    remindersDay13: 0,
    expiredCount: 0,
    pastDueExpiredCount: 0,
    warnings7d: 0,
    warnings1d: 0,
    downgradesApplied: 0,
  };

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  for (const org of orgs) {
    if (ctx.abortSignal?.aborted) break;
    const orgId = asOrgId(org.id);

    // 1. Process trialing orgs
    if (org.billingStatus === 'trialing' && org.trialEndsAt) {
      const trialEndsAt = new Date(org.trialEndsAt);
      const msRemaining = trialEndsAt.getTime() - now.getTime();
      const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

      // A. Trial Expired: trialEndsAt <= now()
      if (msRemaining <= 0) {
        // Transition to read_only mode
        await ctx.repos.organizations.update(orgId, { billingStatus: 'read_only' });
        await ctx.repos.auditLog.write(orgId, {
          actorType: 'system',
          action: 'trial_expired',
          targetType: 'organization',
          targetId: org.id,
          data: { trialEndsAt: org.trialEndsAt },
        });

        const owner = await ctx.repos.memberships.findOwner(orgId);
        if (owner?.email) {
          const emailPayload = {
            orgName: org.name,
            upgradeUrl: `${appUrl}/settings/billing`,
            readOnlySince: now.toISOString(),
          };
          if (ctx.boss) {
            await enqueueEmailSend(ctx.boss, {
              to: owner.email,
              templateId: 'E-15',
              data: emailPayload,
            });
          } else if (ctx.emailSender) {
            await ctx.emailSender.send({
              to: owner.email,
              templateId: 'E-15',
              data: emailPayload,
            });
          }
        }
        result.expiredCount++;
        continue;
      }

      // B. Day 13 Reminder: ~1 day remaining (between 0 and 1.5 days remaining)
      if (daysRemaining <= 1.5 && daysRemaining > 0) {
        const alreadySent = await ctx.repos.auditLog.findRecentAction(
          orgId,
          'trial.reminder_day_13',
        );
        if (!alreadySent) {
          const owner = await ctx.repos.memberships.findOwner(orgId);
          if (owner?.email) {
            const emailPayload = {
              daysLeft: 1,
              orgName: org.name,
              upgradeUrl: `${appUrl}/settings/billing`,
              trialEndsAt: org.trialEndsAt,
            };
            if (ctx.boss) {
              await enqueueEmailSend(ctx.boss, {
                to: owner.email,
                templateId: 'E-14',
                data: emailPayload,
              });
            } else if (ctx.emailSender) {
              await ctx.emailSender.send({
                to: owner.email,
                templateId: 'E-14',
                data: emailPayload,
              });
            }
          }
          await ctx.repos.auditLog.write(orgId, {
            actorType: 'system',
            action: 'trial.reminder_day_13',
            targetType: 'organization',
            targetId: org.id,
            data: { daysRemaining: Math.round(daysRemaining) },
          });
          result.remindersDay13++;
        }
        continue;
      }

      // C. Day 10 Reminder: ~4 days remaining (between 3.5 and 4.5 days remaining)
      if (daysRemaining <= 4.5 && daysRemaining > 1.5) {
        const alreadySent = await ctx.repos.auditLog.findRecentAction(
          orgId,
          'trial.reminder_day_10',
        );
        if (!alreadySent) {
          const owner = await ctx.repos.memberships.findOwner(orgId);
          if (owner?.email) {
            const emailPayload = {
              daysLeft: 4,
              orgName: org.name,
              upgradeUrl: `${appUrl}/settings/billing`,
              trialEndsAt: org.trialEndsAt,
            };
            if (ctx.boss) {
              await enqueueEmailSend(ctx.boss, {
                to: owner.email,
                templateId: 'E-14',
                data: emailPayload,
              });
            } else if (ctx.emailSender) {
              await ctx.emailSender.send({
                to: owner.email,
                templateId: 'E-14',
                data: emailPayload,
              });
            }
          }
          await ctx.repos.auditLog.write(orgId, {
            actorType: 'system',
            action: 'trial.reminder_day_10',
            targetType: 'organization',
            targetId: org.id,
            data: { daysRemaining: Math.round(daysRemaining) },
          });
          result.remindersDay10++;
        }
      }
    }

    // 2. Data deletion warnings for read_only and canceled orgs (30-day retention countdown)
    if (org.billingStatus === 'read_only' || org.billingStatus === 'canceled') {
      const expiryAudit = await ctx.repos.auditLog.findRecentAction(orgId, 'trial_expired');
      const startOfRetention = expiryAudit?.createdAt
        ? new Date(expiryAudit.createdAt)
        : new Date(org.updatedAt);
      const deletionDate = new Date(startOfRetention.getTime() + 30 * 24 * 60 * 60 * 1000);
      const msUntilDeletion = deletionDate.getTime() - now.getTime();
      const daysUntilDeletion = msUntilDeletion / (1000 * 60 * 60 * 24);

      // Warning 1: 7 days remaining (between 6.5 and 7.5 days)
      if (daysUntilDeletion <= 7.5 && daysUntilDeletion > 1.5) {
        const alreadySent = await ctx.repos.auditLog.findRecentAction(orgId, 'deletion.warning_7d');
        if (!alreadySent) {
          const owner = await ctx.repos.memberships.findOwner(orgId);
          if (owner?.email) {
            const emailPayload = {
              orgName: org.name,
              daysUntilDeletion: 7,
              reactivateUrl: `${appUrl}/settings/billing`,
              exportUrl: `${appUrl}/settings/account#export`,
              deletionDate: deletionDate.toISOString(),
            };
            if (ctx.boss) {
              await enqueueEmailSend(ctx.boss, {
                to: owner.email,
                templateId: 'E-20',
                data: emailPayload,
              });
            } else if (ctx.emailSender) {
              await ctx.emailSender.send({
                to: owner.email,
                templateId: 'E-20',
                data: emailPayload,
              });
            }
          }
          await ctx.repos.auditLog.write(orgId, {
            actorType: 'system',
            action: 'deletion.warning_7d',
            targetType: 'organization',
            targetId: org.id,
            data: { deletionDate: deletionDate.toISOString() },
          });
          result.warnings7d++;
        }
      }

      // Warning 2: 1 day remaining (between 0 and 1.5 days)
      if (daysUntilDeletion <= 1.5 && daysUntilDeletion > 0) {
        const alreadySent = await ctx.repos.auditLog.findRecentAction(orgId, 'deletion.warning_1d');
        if (!alreadySent) {
          const owner = await ctx.repos.memberships.findOwner(orgId);
          if (owner?.email) {
            const emailPayload = {
              orgName: org.name,
              daysUntilDeletion: 1,
              reactivateUrl: `${appUrl}/settings/billing`,
              exportUrl: `${appUrl}/settings/account#export`,
              deletionDate: deletionDate.toISOString(),
            };
            if (ctx.boss) {
              await enqueueEmailSend(ctx.boss, {
                to: owner.email,
                templateId: 'E-20',
                data: emailPayload,
              });
            } else if (ctx.emailSender) {
              await ctx.emailSender.send({
                to: owner.email,
                templateId: 'E-20',
                data: emailPayload,
              });
            }
          }
          await ctx.repos.auditLog.write(orgId, {
            actorType: 'system',
            action: 'deletion.warning_1d',
            targetType: 'organization',
            targetId: org.id,
            data: { deletionDate: deletionDate.toISOString() },
          });
          result.warnings1d++;
        }
      }
    }

    // 3. Process past_due orgs (7-day grace period, then transition to read_only per P4-06)
    if (org.billingStatus === 'past_due') {
      // Orgs that went past due before past_due_since existed fall back to the audit log.
      const pastDueAudit = org.pastDueSince
        ? null
        : await ctx.repos.auditLog.findRecentAction(orgId, 'subscription.past_due');
      const startOfPastDue = org.pastDueSince
        ? new Date(org.pastDueSince)
        : pastDueAudit?.createdAt
          ? new Date(pastDueAudit.createdAt)
          : new Date(org.updatedAt);
      const msPastDue = now.getTime() - startOfPastDue.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      if (msPastDue >= sevenDaysMs) {
        // Grace period expired: transition to read_only mode
        await ctx.repos.organizations.update(orgId, { billingStatus: 'read_only' });
        await ctx.repos.auditLog.write(orgId, {
          actorType: 'system',
          action: 'past_due_expired',
          targetType: 'organization',
          targetId: org.id,
          data: { pastDueSince: startOfPastDue.toISOString() },
        });

        const owner = await ctx.repos.memberships.findOwner(orgId);
        if (owner?.email) {
          const emailPayload = {
            orgName: org.name,
            upgradeUrl: `${appUrl}/settings/billing`,
            readOnlySince: now.toISOString(),
          };
          if (ctx.boss) {
            await enqueueEmailSend(ctx.boss, {
              to: owner.email,
              templateId: 'E-15',
              data: emailPayload,
            });
          } else if (ctx.emailSender) {
            await ctx.emailSender.send({
              to: owner.email,
              templateId: 'E-15',
              data: emailPayload,
            });
          }
        }
        result.expiredCount++;
        result.pastDueExpiredCount++;
      }
    }
  }

  result.downgradesApplied = await applyDueDowngrades(ctx, now, appUrl);

  return result;
}

async function applyDueDowngrades(ctx: WorkerContext, now: Date, appUrl: string): Promise<number> {
  const due = await ctx.repos.subscriptions.listDueScheduledDowngrades(now);
  let applied = 0;

  for (const sub of due) {
    if (ctx.abortSignal?.aborted) break;
    const orgId = asOrgId(sub.orgId);
    const change = sub.scheduledChange as { plan?: string; interval?: string } | null;
    if (!change?.plan) continue;

    const plan = change.plan as PlanType;
    const interval = change.interval === 'year' ? 'year' : 'month';

    await ctx.repos.subscriptions.upsert({
      ...sub,
      orgId,
      paddlePriceId: getPriceIdForPlan(plan, interval),
      plan,
      interval,
      scheduledChange: null,
    });
    await ctx.repos.organizations.update(orgId, { plan });
    await ctx.repos.auditLog.write(orgId, {
      actorType: 'system',
      action: 'plan_changed',
      targetType: 'organization',
      targetId: sub.orgId,
      data: { plan, interval, oldPlan: sub.plan, reason: 'scheduled_downgrade' },
    });

    const owner = await ctx.repos.memberships.findOwner(orgId);
    const org = await ctx.repos.organizations.findById(orgId);
    if (owner?.email && org) {
      const emailPayload = {
        orgName: org.name,
        oldPlanName: getPlanDefinition(sub.plan as PlanType).name,
        newPlanName: getPlanDefinition(plan).name,
        interval,
        billingUrl: `${appUrl}/settings/billing`,
      } as const;
      if (ctx.boss) {
        await enqueueEmailSend(ctx.boss, {
          to: owner.email,
          templateId: 'E-19',
          data: emailPayload,
        });
      } else if (ctx.emailSender) {
        await ctx.emailSender.send({ to: owner.email, templateId: 'E-19', data: emailPayload });
      }
    }
    applied++;
  }

  return applied;
}
