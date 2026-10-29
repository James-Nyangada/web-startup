import type { WorkerContext } from '../types.js';
import type { OrgId } from '../../db/repositories/org-scope.js';
import { assertWithinPlan } from '../../shared/plans.js';
import { enqueueEmailSend } from '../boss.js';
import { handleReportRender } from './report-render.js';
import type { EmailBranding, MonthlyClientReportData } from '../../emails/types.js';
import { EmailSender } from '../../emails/sender.js';
import { signReportDownloadToken } from '../../reports/token.js';
import type { ReportScheduleRow, sites } from '../../db/schema/index.js';
import type { OrgRow } from '../../db/repositories/organizations.js';

type SiteRow = typeof sites.$inferSelect;
type DueScheduleItem = { schedule: ReportScheduleRow; org: OrgRow; site: SiteRow };

/** Recipients are usually outside the org, so the link is a signed token, not a session route. */
const DOWNLOAD_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * A schedule is due once its day has arrived this month and it has not been sent this month.
 * Checking "on or after" (not "exactly on") the day means a failed or missed run is picked
 * up by the next daily run. A schedule created after this month's day waits for next month.
 */
export function isScheduleDue(
  schedule: Pick<ReportScheduleRow, 'dayOfMonth' | 'lastSentAt' | 'createdAt'>,
  now: Date,
): boolean {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dueAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), schedule.dayOfMonth));
  if (now < dueAt) return false;
  if (schedule.lastSentAt && schedule.lastSentAt >= monthStart) return false;
  if (schedule.createdAt && schedule.createdAt > dueAt) return false;
  return true;
}

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
  const failures: Array<{ scheduleId: string; error: string }> = [];
  const appUrl = process.env.APP_URL ?? 'https://app.brightline.dev';
  const now = new Date();

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
    const todayDay = payload?.dayOfMonth ?? now.getUTCDate();
    due = (await ctx.repos.reportSchedules.findDueSchedules(todayDay)).filter((d) =>
      isScheduleDue(d.schedule, now),
    );
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
      // 3. Create and render the R-04 client monthly report. Rendered inline (this cron runs
      // with concurrency 1) so the email only goes out once the PDF exists.
      const created = await ctx.repos.reports.create(orgId, {
        siteId: schedule.siteId,
        type: 'client_monthly',
        branded: true,
      });
      await handleReportRender({ reportId: created.id }, ctx);

      const report = await ctx.repos.reports.findById(orgId, created.id);
      if (report?.status !== 'ready') {
        throw new Error(`Report ${created.id} finished with status ${report?.status ?? 'missing'}`);
      }
      reportsGenerated++;

      // 4. Gather branding
      let branding: EmailBranding | undefined = undefined;
      const brand = await ctx.repos.branding.findByOrgId(orgId);
      if (brand) {
        branding = {
          displayName: brand.displayName ?? org.name,
          primaryColor: brand.primaryColor ?? undefined,
          senderName: brand.emailSenderName ?? undefined,
        };
      }

      // 5. Send E-12 to each recipient with a signed download link
      const token = signReportDownloadToken({
        reportId: created.id,
        orgId,
        exp: Math.floor(now.getTime() / 1000) + DOWNLOAD_LINK_TTL_SECONDS,
      });
      const reportPeriod = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

      const emailData: MonthlyClientReportData = {
        clientName: site.clientName ?? null,
        siteName: site.name,
        reportPeriod,
        downloadUrl: `${appUrl}/v1/reports/download/${token}`,
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

      // 6. Update schedule, audit log and evidence timeline
      await ctx.repos.reportSchedules.updateLastSent(schedule.id, now);

      await ctx.repos.auditLog.write(orgId, {
        actorType: 'system',
        action: 'report.schedule',
        targetType: 'report_schedule',
        targetId: schedule.id,
        data: {
          idempotencyKey,
          reportId: created.id,
          recipientsCount: schedule.recipients.length,
          period: reportPeriod,
        },
      });

      if (ctx.repos.evidenceEvents?.record) {
        await ctx.repos.evidenceEvents.record(orgId, {
          siteId: schedule.siteId,
          type: 'report_sent',
          actorId: null,
          data: {
            reportId: created.id,
            recipients: schedule.recipients,
            type: 'client_monthly',
            scheduleId: schedule.id,
          },
        });
      }

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[report.schedule] Failed processing schedule ${schedule.id}:`, err);
      failures.push({ scheduleId: schedule.id, error: message });
      await ctx.repos.auditLog
        .write(orgId, {
          actorType: 'system',
          action: 'report.schedule.failed',
          targetType: 'report_schedule',
          targetId: schedule.id,
          data: { period: yearMonth, error: message },
        })
        .catch(() => {});
    }
  }

  // Fail the job so pg-boss retries it (and dead-letters it to the staff queue screen once
  // retries run out). Schedules that already went out are skipped on retry by lastSentAt
  // and the idempotency key.
  if (failures.length > 0) {
    throw new Error(
      `report.schedule: ${failures.length} schedule(s) failed: ${failures
        .map((f) => `${f.scheduleId} (${f.error})`)
        .join('; ')}`,
    );
  }

  return { processed, reportsGenerated, emailsDispatched, skippedNonAgency };
}
