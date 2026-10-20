import type { DigestWeeklyJobPayload, WorkerContext } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { getZonedDayOfWeek, getZonedParts } from '../../lib/schedule.js';
import { enqueueEmailSend } from '../boss.js';
import type { EmailBranding, WeeklyDigestData, WeeklyDigestSite } from '../../emails/types.js';
import { EmailSender } from '../../emails/sender.js';

export async function handleWeeklyDigest(
  job: DigestWeeklyJobPayload | undefined,
  ctx: WorkerContext,
): Promise<{ processedOrgs: number; sentEmails: number }> {
  const now = new Date();
  let orgs: Array<{ id: string; name: string; timeZone: string | null }>;

  if (job?.orgId) {
    const org = await ctx.repos.organizations.findById(job.orgId);
    orgs = org ? [org] : [];
  } else {
    orgs = await ctx.repos.organizations.listAllActive();
  }

  let processedOrgs = 0;
  let sentEmails = 0;

  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';

  for (const org of orgs) {
    if (ctx.abortSignal?.aborted) break;

    const orgId = org.id as OrgId;
    const timeZone = org.timeZone || 'UTC';
    const parts = getZonedParts(now, timeZone);
    const dow = getZonedDayOfWeek(now, timeZone);

    // Unless forced, only run on Monday at 07:00 in the organisation's time zone (Spec Section 9 & P5-06)
    if (!job?.force) {
      if (dow !== 1 || parts.hour !== 7) {
        continue;
      }
    }

    const weekKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const idempotencyKey = `weekly-digest:${org.id}:${weekKey}`;

    // Prevent duplicate sends for the same week
    const alreadySent = await ctx.repos.auditLog.hasActionWithKey(
      orgId,
      'digest.weekly',
      idempotencyKey,
    );
    if (alreadySent) {
      continue;
    }

    // Check opted-in members
    const optedInMembers = await ctx.repos.notifications.listOptedInMembers(orgId, 'weeklyDigest');
    if (optedInMembers.length === 0) {
      // Record in audit log so we don't repeat checks this hour
      await ctx.repos.auditLog.write(orgId, {
        actorType: 'system',
        action: 'digest.weekly',
        data: {
          idempotencyKey,
          weekKey,
          skipped: 'no_opted_in_members',
        },
      });
      continue;
    }

    // Collect site statistics
    const orgSites = await ctx.repos.sites.list(orgId);
    if (orgSites.length === 0) {
      await ctx.repos.auditLog.write(orgId, {
        actorType: 'system',
        action: 'digest.weekly',
        data: {
          idempotencyKey,
          weekKey,
          skipped: 'no_sites',
        },
      });
      continue;
    }

    const siteSummaries = await ctx.repos.sites.listSummaries(
      orgId,
      orgSites.map((s) => s.id),
    );
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weeklySites: WeeklyDigestSite[] = [];
    for (const site of orgSites) {
      const summary = siteSummaries.get(site.id);
      const stats = await ctx.repos.issues.getWeeklyStats(orgId, site.id, sevenDaysAgo);

      weeklySites.push({
        siteName: site.name,
        currentScore: site.score,
        scoreDelta:
          site.score !== null &&
          summary?.previousScore !== null &&
          summary?.previousScore !== undefined
            ? site.score - summary.previousScore
            : null,
        newIssuesCount: stats.newCount,
        fixedIssuesCount: stats.fixedCount,
        regressedCount: summary?.regressions ?? 0,
      });
    }

    // Optional branding
    let branding: EmailBranding | undefined = undefined;
    const orgBranding = await ctx.repos.branding.findByOrgId(orgId);
    if (orgBranding) {
      branding = {
        displayName: orgBranding.displayName ?? org.name,
        primaryColor: orgBranding.primaryColor ?? undefined,
        senderName: orgBranding.emailSenderName ?? undefined,
      };
    }

    // Send personalized digest to each opted-in member
    for (const member of optedInMembers) {
      const overdueAssignedCount = await ctx.repos.issues.countOverdueAssigned(
        orgId,
        member.userId,
      );

      const emailData: WeeklyDigestData = {
        orgName: org.name,
        sites: weeklySites,
        overdueAssignedCount,
        viewUrl: `${appUrl}/overview`,
        unsubscribeUrl: `${appUrl}/settings/notifications`,
      };

      if (ctx.boss) {
        await enqueueEmailSend(ctx.boss, {
          to: member.email,
          templateId: 'E-10',
          data: emailData as unknown as Record<string, unknown>,
          branding,
        });
      } else {
        const sender = ctx.emailSender ?? new EmailSender();
        await sender.send({
          to: member.email,
          templateId: 'E-10',
          data: emailData,
          branding,
        });
      }

      sentEmails++;
    }

    // Record completed digest in audit log
    await ctx.repos.auditLog.write(orgId, {
      actorType: 'system',
      action: 'digest.weekly',
      data: {
        idempotencyKey,
        weekKey,
        recipientsCount: optedInMembers.length,
        sitesCount: weeklySites.length,
      },
    });

    processedOrgs++;
  }

  return { processedOrgs, sentEmails };
}
