import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { Auth } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/org.js';
import { detectPlatform } from '../scanner/platform/detect.js';
import { createGuardedFetch } from '../scanner/net/guarded-fetch.js';
import { rootUrlOf } from '../scanner/url/normalize.js';
import { PLATFORMS, STANDARDS, type Platform } from '../scanner/types.js';
import { SCAN_FREQUENCIES, type SiteStatus } from '../db/schema/index.js';
import type { UpdateSiteInput } from '../db/repositories/sites.js';
import { verifyOwnership } from '../scanner/verification/verify.js';
import { ErrorCode } from '../shared/errors.js';

const guardedFetch = createGuardedFetch({
  userAgent: 'Mozilla/5.0 (compatible; PlainsightBot/1.0; +https://plainsight.app/bot)',
  timeoutMs: 8000,
  maxBytes: 1024 * 1024,
});

const createSiteSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  rootUrl: z.string().trim().min(1, 'URL is required'),
  platform: z.enum(PLATFORMS as unknown as [Platform, ...Platform[]]).optional(),
  clientName: z.string().trim().max(255).optional().nullable(),
});

const updateSiteSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  clientName: z.string().trim().max(255).optional().nullable(),
  scanFrequency: z.enum(SCAN_FREQUENCIES as unknown as [string, ...string[]]).optional(),
  scanDay: z.number().int().min(0).max(6).optional(),
  scanHour: z.number().int().min(0).max(23).optional(),
  pageLimit: z.number().int().min(1).max(1000).optional(),
  standard: z.enum(STANDARDS as unknown as [string, ...string[]]).optional(),
  pinnedUrls: z.array(z.string()).optional(),
  excludedPaths: z.array(z.string()).optional(),
});

const detectPlatformSchema = z.object({
  url: z.string().trim().min(1, 'URL is required'),
});

const verifySiteSchema = z.object({
  method: z.enum(['meta', 'dns', 'file'] as const),
});

// Default stub limit for sites per org (real limits in Phase 4)
const DEFAULT_SITE_LIMIT = 25;

/** Non-org-scoped platform detection router mounted at /v1/sites */
export function detectPlatformRouter(auth: Auth): Router {
  const router = Router();

  // POST /v1/sites/detect-platform (O A M)
  router.post(
    '/detect-platform',
    requireAuth(auth),
    async (req: Request, res: Response): Promise<void> => {
      const parse = detectPlatformSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'A valid URL is required.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const inputUrl = parse.data.url;
      const normalizedRoot = rootUrlOf(inputUrl);
      if (!normalizedRoot) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid http(s) URL provided.',
            details: {},
          },
        });
        return;
      }

      try {
        const response = await guardedFetch(normalizedRoot);
        const result = detectPlatform({
          html: response.text(),
          headers: response.headers,
        });
        res.status(200).json({
          data: {
            platform: result.platform,
            evidence: result.evidence,
          },
        });
      } catch {
        // Fallback gracefully on fetch / network / timeout error
        res.status(200).json({
          data: {
            platform: 'unknown',
            evidence: [],
          },
        });
      }
    },
  );

  return router;
}

/** Org-scoped sites router mounted inside orgScoped at /sites */
export function orgSitesRouter(repos: Repositories): Router {
  const router = Router();

  // GET /v1/orgs/:orgId/sites - List sites (O A M)
  router.get(
    '/',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const { status, platform, client, q, sort } = req.query;

      const sitesList = await repos.sites.list(req.orgId!, {
        status: typeof status === 'string' ? (status as SiteStatus) : undefined,
        platform: typeof platform === 'string' ? (platform as Platform) : undefined,
        client: typeof client === 'string' ? client : undefined,
        q: typeof q === 'string' ? q : undefined,
        sort: typeof sort === 'string' ? (sort as 'score' | 'name' | 'lastScan' | 'openCritical') : undefined,
      });

      res.status(200).json({ data: { sites: sitesList } });
    },
  );

  // POST /v1/orgs/:orgId/sites - Add site (O A M)
  router.post(
    '/',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const parse = createSiteSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid site payload.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const { name, rootUrl, platform, clientName } = parse.data;

      // Normalization requirement: `https://www.example.com/shop?x=1` stores `https://www.example.com`
      const normalizedRoot = rootUrlOf(rootUrl);
      if (!normalizedRoot) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid site URL. Please enter a valid http(s) address.',
            details: {},
          },
        });
        return;
      }

      // Duplicate detection within org
      const duplicate = await repos.sites.findByRootUrl(req.orgId!, normalizedRoot);
      if (duplicate) {
        res.status(409).json({
          error: {
            code: ErrorCode.DUPLICATE_SITE,
            message: `A site with root URL "${normalizedRoot}" already exists in this organisation.`,
            details: { existingSiteId: duplicate.id },
          },
        });
        return;
      }

      // Plan limit check stub
      const currentCount = await repos.sites.count(req.orgId!);
      if (currentCount >= DEFAULT_SITE_LIMIT) {
        res.status(422).json({
          error: {
            code: ErrorCode.PLAN_LIMIT,
            message: `You have reached your plan limit of ${DEFAULT_SITE_LIMIT} monitored sites.`,
            details: {
              limit: DEFAULT_SITE_LIMIT,
              current: currentCount,
              upgradeTo: 'agency_plus',
            },
          },
        });
        return;
      }

      // Auto-detect platform if omitted or unknown
      let finalPlatform: Platform = platform ?? 'unknown';
      if (finalPlatform === 'unknown') {
        try {
          const probe = await guardedFetch(normalizedRoot);
          const detected = detectPlatform({
            html: probe.text(),
            headers: probe.headers,
          });
          finalPlatform = detected.platform;
        } catch {
          // Keep as unknown
        }
      }

      const org = await repos.organizations.findById(req.orgId!);
      const site = await repos.sites.create(req.orgId!, {
        name,
        rootUrl: normalizedRoot,
        platform: finalPlatform,
        clientName: clientName ?? null,
        timeZone: org?.timeZone ?? 'UTC',
      });

      // Audit log
      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'site.created',
        targetId: site.id,
        targetType: 'site',
        data: { name: site.name, rootUrl: site.rootUrl, platform: site.platform },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({ data: { site } });
    },
  );

  // GET /v1/orgs/:orgId/sites/:siteId - Site detail + trend (O A M)
  router.get(
    '/:siteId',
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

      // Trend data (stubs/placeholder for last 12 scans)
      const trend = [
        ['5 Aug', 61, 24],
        ['12 Aug', 63, 22],
        ['19 Aug', 62, 23],
        ['26 Aug', 66, 20],
        ['2 Sep', 64, 21, true],
        ['9 Sep', 68, 18],
        ['16 Sep', 70, 17],
        ['23 Sep', 69, 17],
        ['30 Sep', 72, 15],
        ['7 Oct', 74, 13],
        ['12 Oct', 72, 14],
        ['14 Oct', site.score ?? 78, 11],
      ];

      res.status(200).json({
        data: {
          site,
          trend,
          latestScanSummary: site.lastScanId
            ? {
                scanId: site.lastScanId,
                score: site.score,
                status: 'completed',
              }
            : null,
        },
      });
    },
  );

  // PATCH /v1/orgs/:orgId/sites/:siteId - Update site (O A)
  router.patch(
    '/:siteId',
    requireOrgRole('admin'),
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

      const parse = updateSiteSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid update payload.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const existing = await repos.sites.findById(req.orgId!, siteId);
      if (!existing) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const org = await repos.organizations.findById(req.orgId!);
      const updated = await repos.sites.update(req.orgId!, siteId, {
        ...(parse.data as UpdateSiteInput),
        timeZone: org?.timeZone ?? 'UTC',
      });

      // Audit log
      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'site.updated',
        targetId: siteId,
        targetType: 'site',
        data: parse.data,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { site: updated } });
    },
  );

  // POST /v1/orgs/:orgId/sites/:siteId/pause - Pause site (O A)
  router.post(
    '/:siteId/pause',
    requireOrgRole('admin'),
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

      const existing = await repos.sites.findById(req.orgId!, siteId);
      if (!existing) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const updated = await repos.sites.pause(req.orgId!, siteId);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'site.paused',
        targetId: siteId,
        targetType: 'site',
        data: {},
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { site: updated } });
    },
  );

  // POST /v1/orgs/:orgId/sites/:siteId/resume - Resume site (O A)
  router.post(
    '/:siteId/resume',
    requireOrgRole('admin'),
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

      const existing = await repos.sites.findById(req.orgId!, siteId);
      if (!existing) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const updated = await repos.sites.resume(req.orgId!, siteId);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'site.resumed',
        targetId: siteId,
        targetType: 'site',
        data: {},
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { site: updated } });
    },
  );

  // DELETE /v1/orgs/:orgId/sites/:siteId - Soft delete site (O A)
  router.delete(
    '/:siteId',
    requireOrgRole('admin'),
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

      const existing = await repos.sites.findById(req.orgId!, siteId);
      if (!existing) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      await repos.sites.softDelete(req.orgId!, siteId);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'site.deleted',
        targetId: siteId,
        targetType: 'site',
        data: { name: existing.name, rootUrl: existing.rootUrl },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { ok: true } });
    },
  );

  // GET /v1/orgs/:orgId/sites/:siteId/verification - Token + instructions for each method (O A M)
  router.get(
    '/:siteId/verification',
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

      const metaTag = `<meta name="plainsight-verify" content="${site.verifyToken}">`;
      const txtRecord = `plainsight-verify=${site.verifyToken}`;
      const filePath = '/.well-known/plainsight-verify.txt';
      const fileUrl = `${site.rootUrl}${filePath}`;

      res.status(200).json({
        data: {
          siteId: site.id,
          name: site.name,
          rootUrl: site.rootUrl,
          verifyToken: site.verifyToken,
          status: site.status,
          verifiedAt: site.verifiedAt,
          verifyMethod: site.verifyMethod,
          methods: {
            meta: {
              name: 'HTML Meta Tag',
              tag: metaTag,
              metaName: 'plainsight-verify',
              token: site.verifyToken,
              instructions: 'Add this meta tag inside the <head> section of your homepage HTML.',
            },
            dns: {
              name: 'DNS TXT Record',
              type: 'TXT',
              host: '@ (or _plainsight)',
              value: txtRecord,
              token: site.verifyToken,
              instructions: 'Add a TXT record on your apex domain or _plainsight subdomain with this value.',
            },
            file: {
              name: 'File Upload',
              path: filePath,
              url: fileUrl,
              content: site.verifyToken,
              instructions: 'Create a plain text file at /.well-known/plainsight-verify.txt containing only your token.',
            },
          },
        },
      });
    },
  );

  // POST /v1/orgs/:orgId/sites/:siteId/verify - Run ownership verification check now (O A M)
  router.post(
    '/:siteId/verify',
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

      const parse = verifySiteSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid verification method. Allowed methods: meta, dns, file.',
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

      const { method } = parse.data;

      // Run verification check
      const result = await verifyOwnership(site.rootUrl, site.verifyToken, method, {
        fetcher: guardedFetch,
      });

      if (!result.ok) {
        res.status(400).json({
          error: {
            code: ErrorCode.VERIFICATION_FAILED,
            message: result.reason ?? 'Verification check failed.',
            details: result.details ?? {},
          },
        });
        return;
      }

      const updated = await repos.sites.setVerified(req.orgId!, siteId, method);

      // Audit log
      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'site.verified',
        targetId: siteId,
        targetType: 'site',
        data: { method, verifiedAt: new Date().toISOString() },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({
        data: {
          ok: true,
          verified: true,
          site: updated,
          method,
        },
      });
    },
  );

  return router;
}
