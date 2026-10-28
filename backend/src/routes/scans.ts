import { Router, type Request, type Response } from 'express';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { STANDARDS, type Standard } from '../scanner/types.js';
import { enqueueScanRun } from '../worker/boss.js';
import { assertWithinPlan, PlanLimitError, TRIAL_FULL_SCAN_LIMIT } from '../shared/plans.js';
import { getZonedParts, zonedWallClockToUtc } from '../lib/schedule.js';
import { getScanFailureHint } from '../shared/scan-hints.js';

export const createScanSchema = z.object({
  trigger: z.enum(['manual', 'onboarding']).default('manual'),
  standard: z.enum(STANDARDS as unknown as [Standard, ...Standard[]]).optional(),
  pagesPlanned: z.number().int().min(1).max(100).optional(),
});

/**
 * In-memory event broadcaster for live SSE scan progress.
 * Subscribes clients to scan updates.
 */
export interface ScanProgressEvent {
  phase: string;
  pagesScanned: number;
  pagesPlanned: number;
  currentUrl?: string;
  score?: number | null;
  status?: string;
  message?: string;
}

export type ProgressListener = (event: ScanProgressEvent) => void;

const scanListeners = new Map<string, Set<ProgressListener>>();

export function broadcastScanProgress(scanId: string, event: ScanProgressEvent) {
  const set = scanListeners.get(scanId);
  if (set) {
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // Ignore listener error
      }
    }
  }
}

export interface ScansRouterOptions {
  boss?: PgBoss;
  enqueueScan?: (scanId: string) => Promise<void>;
}

/**
 * Mounts org-scoped scan routes under /v1/orgs/:orgId
 */
export function orgScansRouter(repos: Repositories, options?: ScansRouterOptions): Router {
  const router = Router();

  // POST /v1/orgs/:orgId/sites/:siteId/scans - Trigger a scan (O A M)
  router.post(
    '/sites/:siteId/scans',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const parse = createScanSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid scan parameters.',
            details: parse.error.flatten(),
          },
        });
        return;
      }

      const site = await repos.sites.findById(req.orgId!, siteId);
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

      const { standard, pagesPlanned } = parse.data;
      // Scans started with an API key (P6-06) are recorded as such, never as onboarding.
      const trigger = req.apiKey ? 'api' : parse.data.trigger;

      // Ownership verification check:
      // Spec Section 6.9: "Unverified sites: user may run one onboarding scan limited to 10 pages
      // so they see value immediately; scheduled scans require verification."
      if (site.status === 'pending_verification') {
        if (trigger !== 'onboarding') {
          res.status(422).json({
            error: {
              code: ErrorCode.FORBIDDEN,
              message:
                'Unverified sites can only run one onboarding scan. Please verify ownership to run manual scans.',
              details: { status: site.status },
            },
          });
          return;
        }

        const count = await repos.scans.countOnboardingScansForSite(req.orgId!, siteId);
        if (count >= 1) {
          res.status(422).json({
            error: {
              code: ErrorCode.FORBIDDEN,
              message:
                'This site has already completed its unverified onboarding scan. Please verify ownership to continue.',
              details: { existingScans: count },
            },
          });
          return;
        }
      }

      // Check if a scan is already running on this site
      const runningScan = await repos.scans.findRunningScanForSite(req.orgId!, siteId);
      if (runningScan) {
        res.status(409).json({
          error: {
            code: ErrorCode.SCAN_IN_PROGRESS,
            message: 'A scan is already running for this site.',
            details: { scanId: runningScan.id },
          },
        });
        return;
      }

      const org = await repos.organizations.findById(req.orgId!);

      // A trial includes two full scans in total; the onboarding quick scan is free.
      if (org?.billingStatus === 'trialing' && trigger !== 'onboarding') {
        const used = await repos.scans.countFullScans(req.orgId!);
        if (used >= TRIAL_FULL_SCAN_LIMIT) {
          throw new PlanLimitError(
            `Your trial includes ${TRIAL_FULL_SCAN_LIMIT} full scans and you have used them. Choose a plan to keep scanning and monitoring weekly.`,
            { limit: TRIAL_FULL_SCAN_LIMIT, current: used, upgradeTo: 'store' },
          );
        }
      }

      // Enforce daily manual scan limit per site based on org plan (API scans count too)
      if (trigger === 'manual' || trigger === 'api') {
        const timeZone = org?.timeZone ?? 'UTC';

        const currentParts = getZonedParts(new Date(), timeZone);
        const startOfDay = zonedWallClockToUtc(
          currentParts.year,
          currentParts.month,
          currentParts.day,
          0,
          0,
          timeZone,
        );

        const manualCountToday = await repos.scans.countManualScansSince(
          req.orgId!,
          siteId,
          startOfDay,
        );

        assertWithinPlan(org, 'manual_scans', manualCountToday + 1);
      }

      if (pagesPlanned !== undefined) {
        assertWithinPlan(org, 'pages', pagesPlanned);
      }

      const effectivePagesPlanned =
        trigger === 'onboarding' ? 10 : (pagesPlanned ?? site.pageLimit ?? 50);

      const scan = await repos.scans.create(req.orgId!, {
        siteId,
        trigger,
        standard: standard ?? site.standard,
        pagesPlanned: effectivePagesPlanned,
        requestedBy: req.apiKey ? null : req.auth!.user.id,
      });

      if (!scan) {
        res.status(500).json({
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Failed to create scan record.',
            details: {},
          },
        });
        return;
      }

      // Audit log
      await repos.auditLog.write(req.orgId!, {
        actorId: req.apiKey ? null : req.auth!.user.id,
        actorType: req.apiKey ? 'api_key' : 'user',
        action: 'scan.triggered',
        targetId: scan.id,
        targetType: 'scan',
        data: {
          siteId,
          trigger,
          pagesPlanned: effectivePagesPlanned,
          ...(req.apiKey ? { apiKeyId: req.apiKey.id, apiKeyPrefix: req.apiKey.prefix } : {}),
        },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      // Enqueue scan execution in the background worker
      if (options?.enqueueScan) {
        try {
          await options.enqueueScan(scan.id);
        } catch {
          // Worker enqueue error handled by scheduler/retries
        }
      } else if (options?.boss) {
        try {
          await enqueueScanRun(options.boss, scan.id);
        } catch {
          // Worker enqueue error
        }
      }

      res.status(201).json({ data: { scan } });
    },
  );

  // GET /v1/orgs/:orgId/sites/:siteId/scans - List scans for a site (O A M C)
  router.get(
    '/sites/:siteId/scans',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(req.orgId!, siteId);
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

      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Number(req.query.offset) || 0;

      const items = await repos.scans.listBySite(req.orgId!, siteId, limit, offset);
      const total = await repos.scans.countBySite(req.orgId!, siteId);

      const scansWithHints = items.map((scan) => ({
        ...scan,
        hint: getScanFailureHint(
          scan.status,
          scan.errorCode,
          scan.errorMessage,
          scan.pagesFailed,
          scan.pagesPlanned,
        ),
      }));

      res.status(200).json({
        data: {
          scans: scansWithHints,
          pagination: { total, limit, offset },
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/scans/:scanId - Scan detail with diff vs previous and failure hint (O A M C)
  router.get(
    '/scans/:scanId',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const scanIdParam = req.params.scanId;
      const scanId = Array.isArray(scanIdParam) ? scanIdParam[0] : scanIdParam;

      if (!scanId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Scan ID is required.',
            details: {},
          },
        });
        return;
      }

      const scan = await repos.scans.findById(req.orgId!, scanId);
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

      const diff = await repos.issues.getScanDiff(req.orgId!, scanId);
      const hint = getScanFailureHint(
        scan.status,
        scan.errorCode,
        scan.errorMessage,
        scan.pagesFailed,
        scan.pagesPlanned,
      );

      res.status(200).json({
        data: {
          scan: {
            ...scan,
            hint,
          },
          diff,
          hint,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/scans/:scanId/pages - Per-page scan results (O A M C)
  router.get(
    '/scans/:scanId/pages',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const scanIdParam = req.params.scanId;
      const scanId = Array.isArray(scanIdParam) ? scanIdParam[0] : scanIdParam;

      if (!scanId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Scan ID is required.',
            details: {},
          },
        });
        return;
      }

      const scan = await repos.scans.findById(req.orgId!, scanId);
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

      const pages = await repos.pages.listResultsByScan(req.orgId!, scanId);

      res.status(200).json({
        data: {
          pages,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/scans/:scanId/raw - Short-lived signed URL or raw JSON info (O A)
  router.get(
    '/scans/:scanId/raw',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const scanIdParam = req.params.scanId;
      const scanId = Array.isArray(scanIdParam) ? scanIdParam[0] : scanIdParam;

      if (!scanId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Scan ID is required.',
            details: {},
          },
        });
        return;
      }

      const scan = await repos.scans.findById(req.orgId!, scanId);
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

      res.status(200).json({
        data: {
          rawKey: scan.rawKey,
          downloadUrl: scan.rawKey ? `/v1/orgs/${req.orgId}/storage/${scan.rawKey}` : null,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/scans/:scanId/events - Server-Sent Events progress stream (O A M)
  router.get(
    '/scans/:scanId/events',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const scanIdParam = req.params.scanId;
      const scanId = Array.isArray(scanIdParam) ? scanIdParam[0] : scanIdParam;

      if (!scanId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Scan ID is required.',
            details: {},
          },
        });
        return;
      }

      const scan = await repos.scans.findById(req.orgId!, scanId);
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

      // Setup SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Keep-alive heartbeat ping every 15s to prevent proxy timeouts
      const pingInterval = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      // Send initial state immediately
      res.write(
        `data: ${JSON.stringify({
          scanId: scan.id,
          status: scan.status,
          phase: scan.status,
          pagesScanned: scan.pagesScanned,
          pagesPlanned: scan.pagesPlanned,
          score: scan.score,
        })}\n\n`,
      );

      if (['completed', 'failed', 'canceled'].includes(scan.status)) {
        clearInterval(pingInterval);
        res.write(`event: complete\ndata: ${JSON.stringify(scan)}\n\n`);
        res.end();
        return;
      }

      const listener: ProgressListener = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.status && ['completed', 'failed', 'canceled'].includes(event.status)) {
          clearInterval(pingInterval);
          res.write(`event: complete\ndata: ${JSON.stringify(event)}\n\n`);
          res.end();
        }
      };

      if (!scanListeners.has(scanId)) {
        scanListeners.set(scanId, new Set());
      }
      scanListeners.get(scanId)!.add(listener);

      req.on('close', () => {
        clearInterval(pingInterval);
        const set = scanListeners.get(scanId);
        if (set) {
          set.delete(listener);
          if (set.size === 0) {
            scanListeners.delete(scanId);
          }
        }
      });
    },
  );

  // POST /v1/orgs/:orgId/scans/:scanId/cancel - Cancel queued/running scan (O A M)
  router.post(
    '/scans/:scanId/cancel',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const scanIdParam = req.params.scanId;
      const scanId = Array.isArray(scanIdParam) ? scanIdParam[0] : scanIdParam;

      if (!scanId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Scan ID is required.',
            details: {},
          },
        });
        return;
      }

      const scan = await repos.scans.findById(req.orgId!, scanId);
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

      if (['completed', 'failed', 'canceled'].includes(scan.status)) {
        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: `Cannot cancel a scan that has already ${scan.status}.`,
            details: { scanId, status: scan.status },
          },
        });
        return;
      }

      const canceled = await repos.scans.cancelScan(req.orgId!, scanId);
      if (!canceled) {
        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: 'Unable to cancel this scan. It may have already finished.',
            details: { scanId },
          },
        });
        return;
      }

      broadcastScanProgress(scanId, {
        phase: 'canceled',
        status: 'canceled',
        pagesScanned: canceled.pagesScanned,
        pagesPlanned: canceled.pagesPlanned,
        score: canceled.score,
      });

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'scan.canceled',
        targetId: scan.id,
        targetType: 'scan',
        data: { siteId: scan.siteId },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { scan: canceled } });
    },
  );

  return router;
}
