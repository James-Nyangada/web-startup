import type { WorkerContext } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { assertWithinPlan } from '../../shared/plans.js';
import { enqueueEmailSend, enqueueReportRender } from '../boss.js';
import { handleReportRender } from './report-render.js';
import type { EmailBranding, MonthlyClientReportData } from '../../emails/types.js';
import { EmailSender } from '../../emails/sender.js';
import type { ReportScheduleRow, organizations, sites } from '../../db/schema/index.js';

type OrgRow = typeof organizations.$inferSelect;
type SiteRow = typeof sites.$inferSelect;
type DueScheduleItem = { schedule: ReportScheduleRow; org: OrgRow; site: SiteRow };

export async function handleReportSchedule(
  payload: { scheduleId?: string; dayOfMonth?: number; force?: boolean } | undefined,
  ctx: WorkerContext,
): Promise<{
  processed: number;
  reportsGenerated: number;
  emailsDispatched: number;
  skippedNonAgency: number;
}> {
  let processed = 0;
  let reportsGenerated = 0;
  let emailsDispatched = 0;
  let skippedNonAgency = 0;
  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';

  let due: DueScheduleItem[] = [];

  if (payload?.scheduleId) {
    const allDue = await ctx.repos.reportSchedules.findDueSchedules(payload?.dayOfMonth ?? 0);
    const found = allDue.find((d) => d.schedule.id === payload.scheduleId);
    if (found) {
      due = [found];
    } else {
      const orgs = await ctx.repos.organizations.listAllActive();
      for (const org of orgs) {
        const s = await ctx.repos.reportSchedules.findById(org.id as OrgId, payload.scheduleId);
        if (s) {
          const site = await ctx.repos.sites.findById(org.id as OrgId, s.siteId);
          if (site) {
            due = [{ schedule: s, org, site }];
          }
          break;
        }
      }
    }
  } else {
    const todayDay = payload?.dayOfMonth ?? new Date().getUTCDate();
    due = await ctx.repos.reportSchedules.findDueSchedules(todayDay);
  }

  for (const { schedule, org, site } of due) {
    if (ctx.abortSignal?.aborted) break;

    const orgId = org.id as OrgId;

    // 1. Verify agency plan feature
    try {
      assertWithinPlan(org, 'scheduled_reports');
    } catch {
      // Org downgraded to a plan without scheduled reports
      skippedNonAgency++;
      continue;
    }

    // 2. Idempotency check for current month
    const now = new Date();
    const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const idempotencyKey = `report-schedule:${schedule.id}:${yearMonth}`;

    if (!payload?.force) {
      const alreadyRun = await ctx.repos.auditLog.hasActionWithKey(
        orgId,
        'report.schedule',
        idempotencyKey,
      );
      if (alreadyRun) {
        continue;
      }
    }

    try {
      // 3. Create R-04 client monthly report
      const report = await ctx.repos.reports.create(orgId, {
        siteId: schedule.siteId,
        type: 'client_monthly',
        branded: true,
      });

      // 4. Render report
      if (ctx.boss) {
        await enqueueReportRender(ctx.boss, report.id);
      } else {
        await handleReportRender({ reportId: report.id }, ctx);
      }

      // 5. Gather branding
      let branding: EmailBranding | undefined = undefined;
      const brand = await ctx.repos.branding.findByOrgId(orgId);
      if (brand) {
        branding = {
          displayName: brand.displayName ?? org.name,
          primaryColor: brand.primaryColor ?? undefined,
          senderName: brand.emailSenderName ?? undefined,
        };
      }

      // 6. Send E-12 to each recipient
      const reportPeriod = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const downloadUrl = `${appUrl}/v1/orgs/${org.id}/reports/${report.id}/download`;

      const emailData: MonthlyClientReportData = {
        clientName: site.clientName ?? null,
        siteName: site.name,
        reportPeriod,
        downloadUrl,
        score: site.score,
      };

      for (const recipient of schedule.recipients) {
        if (ctx.boss) {
          await enqueueEmailSend(ctx.boss, {
            to: recipient,
            templateId: 'E-12',
            data: emailData as unknown as Record<string, unknown>,
            branding,
          });
        } else {
          const sender = ctx.emailSender ?? new EmailSender();
          await sender.send({
            to: recipient,
            templateId: 'E-12',
            data: emailData,
            branding,
          });
        }
        emailsDispatched++;
      }

      // 7. Update schedule & audit log
      await ctx.repos.reportSchedules.updateLastSent(schedule.id, now);

      await ctx.repos.auditLog.write(orgId, {
        actorType: 'system',
        action: 'report.schedule',
        targetType: 'report_schedule',
        targetId: schedule.id,
        data: {
          idempotencyKey,
          reportId: report.id,
          recipientsCount: schedule.recipients.length,
          period: reportPeriod,
        },
      });

      processed++;
      reportsGenerated++;
    } catch (err) {
      console.error(`[report.schedule] Failed processing schedule ${schedule.id}:`, err);
    }
  }

  return { processed, reportsGenerated, emailsDispatched, skippedNonAgency };
}
