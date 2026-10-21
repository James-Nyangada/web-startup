import { Router } from 'express';
import { z } from 'zod';
import type { Repositories, OrgId } from '../db/repositories/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { assertWithinPlan } from '../shared/plans.js';
import { handleReportSchedule } from '../worker/jobs/report-schedule.js';
import type { PgBoss } from 'pg-boss';
import type { EmailSender } from '../emails/sender.js';

export interface ReportScheduleRouterOptions {
  boss?: PgBoss;
  emailSender?: EmailSender;
}

const createScheduleSchema = z.object({
  siteId: z.string().uuid(),
  recipients: z
    .array(z.string().email())
    .min(1, 'At least one recipient is required')
    .max(10, 'Maximum 10 recipients allowed per schedule'),
  dayOfMonth: z
    .number()
    .int()
    .min(1, 'Day of month must be between 1 and 28')
    .max(28, 'Day of month must be between 1 and 28'),
  active: z.boolean().optional(),
});

const updateScheduleSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(10).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  active: z.boolean().optional(),
});

export function orgReportSchedulesRouter(
  repos: Repositories,
  options: ReportScheduleRouterOptions = {},
) {
  const router = Router({ mergeParams: true });

  // List schedules
  router.get('/', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const siteId = req.query.siteId as string | undefined;

      const schedules = siteId
        ? await repos.reportSchedules.listBySite(orgId, siteId)
        : await repos.reportSchedules.listByOrg(orgId);

      res.json({ schedules });
    } catch (err) {
      next(err);
    }
  });

  // Create schedule
  router.post('/', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const org = await repos.organizations.findById(orgId);
      if (!org) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Organisation not found' } });
        return;
      }

      // Check plan permissions (Agency and Agency Pro only, §1.4 & §7.8)
      assertWithinPlan(org, 'scheduled_reports');

      const parsed = createScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid schedule parameters',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      // Verify site exists and belongs to org
      const site = await repos.sites.findById(orgId, parsed.data.siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found in this organisation',
          },
        });
        return;
      }

      const schedule = await repos.reportSchedules.create(orgId, parsed.data);

      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'report_schedule.created',
        targetType: 'report_schedule',
        targetId: schedule.id,
        data: {
          siteId: schedule.siteId,
          dayOfMonth: schedule.dayOfMonth,
          recipients: schedule.recipients,
        },
      });

      res.status(201).json({ schedule });
    } catch (err) {
      next(err);
    }
  });

  // Get schedule
  router.get('/:id', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const schedule = await repos.reportSchedules.findById(orgId, id);
      if (!schedule) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Schedule not found' } });
        return;
      }

      res.json({ schedule });
    } catch (err) {
      next(err);
    }
  });

  // Update schedule
  router.patch('/:id', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const parsed = updateScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid schedule update parameters',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      const updated = await repos.reportSchedules.update(orgId, id, parsed.data);
      if (!updated) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Schedule not found' } });
        return;
      }

      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'report_schedule.updated',
        targetType: 'report_schedule',
        targetId: id,
        data: { changes: parsed.data },
      });

      res.json({ schedule: updated });
    } catch (err) {
      next(err);
    }
  });

  // Delete schedule
  router.delete('/:id', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const deleted = await repos.reportSchedules.delete(orgId, id);
      if (!deleted) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Schedule not found' } });
        return;
      }

      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'report_schedule.deleted',
        targetType: 'report_schedule',
        targetId: id,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Send now (POST /orgs/:orgId/report-schedules/:id/send-now)
  router.post('/:id/send-now', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const schedule = await repos.reportSchedules.findById(orgId, id);
      if (!schedule) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Schedule not found' } });
        return;
      }

      const result = await handleReportSchedule(
        { dayOfMonth: schedule.dayOfMonth, force: true },
        {
          repos,
          storage: {} as never,
          boss: options.boss,
          emailSender: options.emailSender,
        },
      );

      res.json({
        ok: true,
        message: 'Monthly client report generated and dispatched.',
        result,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
