import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { StorageService } from '../storage/index.js';
import type { EmailSender } from '../emails/sender.js';
import type { PgBoss } from 'pg-boss';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { assertWithinPlan } from '../shared/plans.js';
import { signReportDownloadToken, verifyReportDownloadToken } from '../reports/token.js';
import { enqueueReportRender } from '../worker/boss.js';
import { handleReportRender } from '../worker/jobs/report-render.js';

const createReportSchema = z.object({
  type: z
    .enum(['scan_summary', 'full', 'evidence_pack', 'client_monthly', 'agency_overview'])
    .default('scan_summary'),
  siteId: z.string().uuid().optional(),
  scanId: z.string().uuid().optional(),
  dateRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  branded: z.boolean().default(false),
});

const sendReportSchema = z.object({
  recipients: z
    .array(z.string().trim().email('Valid recipient email required'))
    .min(1, 'At least one recipient is required')
    .max(10, 'Maximum 10 recipients allowed'),
  message: z.string().trim().max(2000).optional(),
});

export interface ReportsRouterOptions {
  storage?: StorageService;
  boss?: PgBoss;
  emailSender?: EmailSender;
}

/**
 * Org-scoped reports router: mounted at /v1/orgs/:orgId/reports
 */
export function orgReportsRouter(repos: Repositories, options?: ReportsRouterOptions): Router {
  const router = Router();

  // POST /v1/orgs/:orgId/reports - Generate report (O A M)
  router.post('/', requireOrgRole('member'), async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId!;
    const parse = createReportSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid report parameters.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { type, scanId, branded } = parse.data;
    let { siteId } = parse.data;

    if (branded) {
      assertWithinPlan(req.org, 'white_label');
    }
    if (type === 'client_monthly') {
      assertWithinPlan(req.org, 'scheduled_reports');
    }

    if (!siteId && !scanId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Either siteId or scanId must be provided to generate a report.',
          details: {},
        },
      });
      return;
    }

    // If scanId is provided, verify scan belongs to this org
    if (scanId) {
      const scan = await repos.scans.findById(orgId, scanId);
      if (!scan) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Scan not found.',
            details: {},
          },
        });
        return;
      }
      if (!siteId) {
        siteId = scan.siteId;
      }
    }

    // If siteId is provided, verify site belongs to this org
    if (siteId) {
      const site = await repos.sites.findById(orgId, siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }
    }

    const report = await repos.reports.create(orgId, {
      siteId: siteId ?? null,
      scanId: scanId ?? null,
      type,
      branded,
      requestedBy: req.auth?.user?.id ?? null,
    });

    // Enqueue worker job or execute handler
    if (options?.boss) {
      await enqueueReportRender(options.boss, report.id);
    } else if (options?.storage) {
      handleReportRender(
        { reportId: report.id },
        {
          repos,
          storage: options.storage,
          emailSender: options.emailSender,
        },
      ).catch((err) => {
        console.error('[report-render] Immediate rendering failed:', err);
      });
    }

    res.status(201).json({ data: report });
  });

  // GET /v1/orgs/:orgId/reports - List reports (O A M C)
  router.get(
    '/',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const siteIdQuery = req.query.siteId;
      const siteId = typeof siteIdQuery === 'string' ? siteIdQuery : undefined;
      const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 50;
      const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;

      if (req.clientSiteIds) {
        if (siteId && !req.clientSiteIds.includes(siteId)) {
          res.status(404).json({
            error: {
              code: ErrorCode.NOT_FOUND,
              message: 'Site not found.',
              details: {},
            },
          });
          return;
        }
      }

      const result = await repos.reports.listByOrg(orgId, {
        siteId,
        limit,
        offset,
      });

      const filteredReports = req.clientSiteIds
        ? result.reports.filter((r) => Boolean(r.siteId && req.clientSiteIds!.includes(r.siteId)))
        : result.reports;

      res.status(200).json({
        data: filteredReports,
        total: req.clientSiteIds ? filteredReports.length : result.total,
      });
    },
  );

  // GET /v1/orgs/:orgId/reports/:id - Get report details (O A M C)
  router.get(
    '/:id',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const paramId = req.params.id;
      const reportId = Array.isArray(paramId) ? paramId[0] : paramId;

      if (!reportId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Report ID is required.',
            details: {},
          },
        });
        return;
      }

      const report = await repos.reports.findById(orgId, reportId);
      if (!report) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Report not found.',
            details: {},
          },
        });
        return;
      }

      if (req.clientSiteIds && (!report.siteId || !req.clientSiteIds.includes(report.siteId))) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Report not found.',
            details: {},
          },
        });
        return;
      }

      res.status(200).json({ data: report });
    },
  );

  // GET /v1/orgs/:orgId/reports/:id/download - Get signed download URL (15 min) (O A M C)
  router.get(
    '/:id/download',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const paramId = req.params.id;
      const reportId = Array.isArray(paramId) ? paramId[0] : paramId;

      if (!reportId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Report ID is required.',
            details: {},
          },
        });
        return;
      }

      const report = await repos.reports.findById(orgId, reportId);
      if (!report) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Report not found.',
            details: {},
          },
        });
        return;
      }

      if (req.clientSiteIds && (!report.siteId || !req.clientSiteIds.includes(report.siteId))) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Report not found.',
            details: {},
          },
        });
        return;
      }

      if (report.status !== 'ready' || !report.fileKey) {
        res.status(409).json({
          error: {
            code: ErrorCode.REPORT_NOT_READY,
            message: 'Report is still being generated. Please try again shortly.',
            details: { status: report.status },
          },
        });
        return;
      }

      const exp = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
      const token = signReportDownloadToken({
        reportId: report.id,
        orgId,
        exp,
      });

      res.status(200).json({
        data: {
          downloadUrl: `/v1/reports/download/${token}`,
          expiresAt: new Date(exp * 1000).toISOString(),
        },
      });
    },
  );

  // POST /v1/orgs/:orgId/reports/:id/send - Email report to ≤ 10 recipients (O A M)
  router.post(
    '/:id/send',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const paramId = req.params.id;
      const reportId = Array.isArray(paramId) ? paramId[0] : paramId;

      if (!reportId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Report ID is required.',
            details: {},
          },
        });
        return;
      }

      const parse = sendReportSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid recipients or message.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const report = await repos.reports.findById(orgId, reportId);
      if (!report) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Report not found.',
            details: {},
          },
        });
        return;
      }

      if (report.status !== 'ready' || !report.fileKey) {
        res.status(409).json({
          error: {
            code: ErrorCode.REPORT_NOT_READY,
            message: 'Report is still generating and cannot be emailed yet.',
            details: { status: report.status },
          },
        });
        return;
      }

      // 7-day token for email recipient download
      const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const token = signReportDownloadToken({
        reportId: report.id,
        orgId,
        exp,
      });

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const downloadUrl = `${appUrl}/v1/reports/download/${token}`;

      const reportTitle =
        report.type === 'scan_summary'
          ? 'Accessibility Scan Summary'
          : report.type === 'full'
            ? 'Full Accessibility Audit Report'
            : 'Accessibility Report';

      const siteName = report.siteName || 'Website';
      const senderName = req.auth?.user?.name || req.auth?.user?.email || 'A team member';

      if (options?.emailSender) {
        for (const recipient of parse.data.recipients) {
          await options.emailSender.send({
            templateId: 'E-11',
            to: recipient,
            data: {
              reportTitle,
              siteName,
              senderName,
              message: parse.data.message ?? null,
              downloadUrl,
              expiresInHours: 168,
            },
          });
        }
      }

      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user?.id,
        actorType: 'user',
        action: 'report.sent',
        targetType: 'report',
        targetId: report.id,
        data: {
          recipients: parse.data.recipients,
          count: parse.data.recipients.length,
          reportType: report.type,
          siteId: report.siteId,
        },
      });

      res.status(200).json({
        data: {
          sent: true,
          recipientCount: parse.data.recipients.length,
        },
      });
    },
  );

  return router;
}

/**
 * Public router for token-signed downloads: mounted at /v1/reports
 */
export function reportsPublicRouter(repos: Repositories, storage: StorageService): Router {
  const router = Router();

  // GET /v1/reports/download/:token - Download report PDF with signed token
  router.get('/download/:token', async (req: Request, res: Response): Promise<void> => {
    const paramToken = req.params.token;
    const token = Array.isArray(paramToken) ? paramToken[0] : paramToken;

    if (!token) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Download token is required.',
          details: {},
        },
      });
      return;
    }

    const payload = verifyReportDownloadToken(token);
    if (!payload) {
      res.status(401).json({
        error: {
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'The download link is invalid or has expired.',
          details: {},
        },
      });
      return;
    }

    const report = await repos.reports.findRawById(payload.reportId);
    if (!report || report.orgId !== payload.orgId || !report.fileKey) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Report file was not found.',
          details: {},
        },
      });
      return;
    }

    const pdfBuffer = await storage.getObject(report.fileKey);
    if (!pdfBuffer) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Report file could not be read from storage.',
          details: {},
        },
      });
      return;
    }

    const filename = `accessibility-report-${report.type}-${report.id.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).send(pdfBuffer);
  });

  return router;
}
