import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { Auth } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/org.js';
import { detectPlatform } from '../scanner/platform/detect.js';
import { detectFramework, type Framework } from '../scanner/platform/framework.js';
import { refineFramework } from '../scanner/platform/probe-framework.js';
import { createGuardedFetch } from '../scanner/net/guarded-fetch.js';
import { rootUrlOf } from '../scanner/url/normalize.js';
import { PLATFORMS, STANDARDS, type Platform } from '../scanner/types.js';
import { SCAN_FREQUENCIES, type ScanFrequency, type SiteStatus } from '../db/schema/index.js';
import type { UpdateSiteInput } from '../db/repositories/sites.js';
import { verifyOwnership } from '../scanner/verification/verify.js';
import { computeNextScanAt } from '../lib/schedule.js';
import { computeTrendSummary, formatScanDate, type TrendPoint } from '../lib/trend.js';
import { scoreBand } from '../scanner/results/score.js';
import { ErrorCode } from '../shared/errors.js';
import { assertWithinPlan } from '../shared/plans.js';

const guardedFetch = createGuardedFetch({
  userAgent: 'Mozilla/5.0 (compatible; EveryVisitorBot/1.0; +https://everyvisitor.app/bot)',
  timeoutMs: 8000,
  maxBytes: 1024 * 1024,
});

const createSiteSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  rootUrl: z.string().trim().min(1, 'URL is required'),
  platform: z.enum(PLATFORMS as unknown as [Platform, ...Platform[]]).optional(),
  clientName: z.string().trim().max(255).optional().nullable(),
  freeCheckId: z.string().uuid().optional(),
  scanFrequency: z
    .enum(SCAN_FREQUENCIES as unknown as [ScanFrequency, ...ScanFrequency[]])
    .optional(),
  pageLimit: z.number().int().min(1).max(1000).optional(),
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
  method: z.enum(['meta', 'dns', 'file', 'plugin', 'shopify'] as const),
});

export const connectSiteSchema = z.object({
  url: z.string().trim().min(1, 'URL is required'),
  name: z.string().trim().min(1).max(255).optional(),
  platform: z.enum(['wordpress', 'shopify']).default('wordpress'),
  issueKey: z.boolean().optional(),
});

const pinPageSchema = z
  .object({
    pageId: z.string().trim().optional(),
    url: z.string().trim().optional(),
    isPinned: z.boolean(),
  })
  .refine((data) => Boolean(data.pageId || data.url), {
    message: 'Either pageId or url is required.',
  });

const previewExclusionsSchema = z.object({
  patterns: z.array(z.string()).default([]),
});

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
        const html = response.text();
        const result = detectPlatform({ html, headers: response.headers });
        const framework =
          result.platform === 'custom' || result.platform === 'unknown'
            ? await refineFramework(
                detectFramework({ html, headers: response.headers }),
                html,
                response.url,
              )
            : null;
        res.status(200).json({
          data: {
            platform: result.platform,
            evidence: result.evidence,
            framework: framework?.framework ?? null,
            frameworkConfidence: framework?.confidence ?? null,
            frameworkEvidence: framework?.evidence ?? [],
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

  // GET /v1/orgs/:orgId/sites - List sites (O A M C)
  router.get(
    '/',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const { status, platform, client, q, sort } = req.query;

      let sitesList = await repos.sites.list(req.orgId!, {
        status: typeof status === 'string' ? (status as SiteStatus) : undefined,
        platform: typeof platform === 'string' ? (platform as Platform) : undefined,
        client: typeof client === 'string' ? client : undefined,
        q: typeof q === 'string' ? q : undefined,
        sort:
          typeof sort === 'string'
            ? (sort as 'score' | 'name' | 'lastScan' | 'openCritical')
            : undefined,
      });

      if (req.membership?.role === 'client_viewer') {
        const allowed = new Set(req.clientSiteIds ?? []);
        sitesList = sitesList.filter((s) => allowed.has(s.id));
      }

      const summaries = await repos.sites.listSummaries(
        req.orgId!,
        sitesList.map((site) => site.id),
      );
      const withSummaries = sitesList.map(({ verifyToken: _verifyToken, ...site }) => ({
        ...site,
        ...summaries.get(site.id),
      }));
      if (sort === 'openCritical') {
        withSummaries.sort(
          (a, b) =>
            (b.openCritical ?? 0) - (a.openCritical ?? 0) || (a.score ?? 101) - (b.score ?? 101),
        );
      }

      res.status(200).json({ data: { sites: withSummaries } });
    },
  );

  // POST /v1/orgs/:orgId/sites - Add site (O A M)
  router.post('/', requireOrgRole('member'), async (req: Request, res: Response): Promise<void> => {
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

    // Plan limit checks (P4-01 & Section 12.3)
    const currentCount = await repos.sites.count(req.orgId!);
    assertWithinPlan(req.org, 'sites', currentCount + 1);

    if (parse.data.pageLimit !== undefined) {
      assertWithinPlan(req.org, 'pages', parse.data.pageLimit);
    }

    if (parse.data.scanFrequency === 'daily') {
      const dailyCount = await repos.sites.countDailySites(req.orgId!);
      assertWithinPlan(req.org, 'daily_scans', dailyCount + 1);
    }

    // Auto-detect platform if omitted or unknown
    let finalPlatform: Platform = platform ?? 'unknown';
    let framework: Framework | null = null;
    try {
      const probe = await guardedFetch(normalizedRoot);
      const html = probe.text();
      if (finalPlatform === 'unknown') {
        finalPlatform = detectPlatform({ html, headers: probe.headers }).platform;
      }
      if (finalPlatform === 'custom' || finalPlatform === 'unknown') {
        framework = (
          await refineFramework(
            detectFramework({ html, headers: probe.headers }),
            html,
            probe.url,
          )
        ).framework;
      }
    } catch {
      // Keep as unknown
    }

    const org = await repos.organizations.findById(req.orgId!);
    const site = await repos.sites.create(req.orgId!, {
      name,
      rootUrl: normalizedRoot,
      platform: finalPlatform,
      framework,
      clientName: clientName ?? null,
      scanFrequency: parse.data.scanFrequency,
      pageLimit: parse.data.pageLimit,
      timeZone: org?.timeZone ?? 'UTC',
    });

    if (parse.data.freeCheckId) {
      await repos.freeChecks.markConverted(parse.data.freeCheckId, req.orgId!);
    }

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

    // Evidence event (P5-01)
    await repos.evidenceEvents.record(req.orgId!, {
      siteId: site.id,
      type: 'site_added',
      actorId: req.auth!.user.id,
      data: { name: site.name, rootUrl: site.rootUrl, platform: site.platform },
    });

    res.status(201).json({ data: { site } });
  });

  // GET /v1/orgs/:orgId/sites/:siteId - Site detail + trend (O A M C)
  router.get(
    '/:siteId',
    requireOrgRole('client_viewer'),
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

      if (req.membership?.role === 'client_viewer' && !req.clientSiteIds?.includes(siteId)) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
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

      // Fetch latest completed/partial scan if available
      const latestScan = site.lastScanId
        ? await repos.scans.findById(req.orgId!, site.lastScanId)
        : null;

      // Fetch last 12 completed or partial scans
      const trendScans = await repos.scans.listTrendScans(req.orgId!, siteId, 12);

      const trend: TrendPoint[] = trendScans.map((s) => {
        const dateLabel = formatScanDate(s.finishedAt ?? s.queuedAt);
        const score = s.score ?? 0;
        const openProblems =
          ((s.counts as Record<string, unknown> | undefined)?.total as number) ??
          ((s.counts as Record<string, unknown> | undefined)?.open as number) ??
          0;
        const isPartial = s.status === 'partial';
        return [dateLabel, score, openProblems, isPartial];
      });

      const trendSummary =
        trend.length > 0 ? computeTrendSummary(trend) : 'No completed scans yet.';

      // Top 5 issues ordered by (impact × occurrences) DESC
      const topIssues = await repos.issues.listTopIssues(req.orgId!, siteId, 5);

      // Open issues counts by severity
      const severityCounts = await repos.issues.getSeverityCounts(req.orgId!, siteId);

      // Diff summary since last scan (new, fixed, regressed)
      const diffSummary = await repos.issues.getDiffSummary(req.orgId!, siteId, site.lastScanId);

      // Recently fixed issues
      const recentlyFixed = await repos.issues.listRecentlyFixed(req.orgId!, siteId, 5);

      const org = await repos.organizations.findById(req.orgId!);
      const timeZone = org?.timeZone ?? 'UTC';

      // Calculate next scheduled scan
      const nextScanDate =
        site.nextScanAt ??
        computeNextScanAt({
          frequency: site.scanFrequency,
          scanDay: site.scanDay,
          scanHour: site.scanHour,
          timeZone,
        });

      const currentScore = site.score ?? latestScan?.score ?? null;
      const scoreBandValue = currentScore !== null ? scoreBand(currentScore) : null;

      res.status(200).json({
        data: {
          site,
          score: currentScore,
          scoreBand: scoreBandValue,
          scoreExplanation:
            scoreBandValue === 'Good'
              ? 'Few or minor accessibility issues detected by automated testing.'
              : scoreBandValue === 'Needs work'
                ? 'Multiple accessibility barriers were found that require attention.'
                : scoreBandValue === 'Poor'
                  ? 'Significant accessibility barriers block users.'
                  : null,
          trend,
          trendSummary,
          topIssues,
          severityCounts,
          diffSummary: {
            ...diffSummary,
            sinceLabel: diffSummary.sinceDate ? formatScanDate(diffSummary.sinceDate) : null,
          },
          recentlyFixed,
          coverage: {
            pagesScanned: latestScan?.pagesScanned ?? 0,
            pagesPlanned: latestScan?.pagesPlanned ?? site.pageLimit ?? 10,
            templatesFound: latestScan?.templatesFound ?? 0,
            standard: latestScan?.standard ?? site.standard ?? 'wcag22aa',
            nextScanAt: nextScanDate ? nextScanDate.toISOString() : null,
            nextScanFormatted: nextScanDate
              ? new Intl.DateTimeFormat('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone,
                }).format(nextScanDate) + ` ${timeZone}`
              : site.scanFrequency === 'manual'
                ? 'Manual scans only'
                : null,
          },
          latestScanSummary: latestScan
            ? {
                scanId: latestScan.id,
                score: latestScan.score,
                status: latestScan.status,
                finishedAt: latestScan.finishedAt,
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

      if (parse.data.pageLimit !== undefined) {
        assertWithinPlan(req.org, 'pages', parse.data.pageLimit);
      }

      if (parse.data.scanFrequency === 'daily' && existing.scanFrequency !== 'daily') {
        const dailyCount = await repos.sites.countDailySites(req.orgId!);
        assertWithinPlan(req.org, 'daily_scans', dailyCount + 1);
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

      if (existing.status === 'paused') {
        const activeCount = await repos.sites.countActive(req.orgId!);
        assertWithinPlan(req.org, 'sites', activeCount + 1);
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

      const metaTag = `<meta name="everyvisitor-verify" content="${site.verifyToken}">`;
      const txtRecord = `everyvisitor-verify=${site.verifyToken}`;
      const filePath = '/.well-known/everyvisitor-verify.txt';
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
              metaName: 'everyvisitor-verify',
              token: site.verifyToken,
              instructions: 'Add this meta tag inside the <head> section of your homepage HTML.',
            },
            dns: {
              name: 'DNS TXT Record',
              type: 'TXT',
              host: `_everyvisitor.${new URL(site.rootUrl).hostname.replace(/^www\./, '')}`,
              value: txtRecord,
              token: site.verifyToken,
              instructions:
                'Add a TXT record on your apex domain or _everyvisitor subdomain with this value.',
            },
            file: {
              name: 'File Upload',
              path: filePath,
              url: fileUrl,
              content: site.verifyToken,
              instructions:
                'Create a plain text file at /.well-known/everyvisitor-verify.txt containing only your token.',
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

      if (method === 'plugin' || method === 'shopify') {
        const updated = await repos.sites.setVerified(req.orgId!, siteId, method);
        const actorId = req.auth?.user?.id ?? req.apiKey?.id ?? 'integration';
        await repos.auditLog.write(req.orgId!, {
          actorId,
          actorType: req.auth?.user ? 'user' : 'system',
          action: 'site.verified',
          targetId: siteId,
          targetType: 'site',
          data: { method, verifiedAt: new Date().toISOString() },
          ip: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        });
        await repos.evidenceEvents.record(req.orgId!, {
          siteId,
          type: 'site_verified',
          actorId,
          data: { method, verifiedAt: new Date().toISOString() },
        });
        res.status(200).json({
          data: {
            ok: true,
            verified: true,
            site: updated,
            method,
          },
        });
        return;
      }

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

      // Evidence event (P5-01)
      await repos.evidenceEvents.record(req.orgId!, {
        siteId,
        type: 'site_verified',
        actorId: req.auth!.user.id,
        data: { method, verifiedAt: new Date().toISOString() },
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

  // GET /v1/orgs/:orgId/sites/:siteId/pages - Discovered pages grouped by template (O A M)
  router.get(
    '/:siteId/pages',
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

      const templates = await repos.pages.listGroupedByTemplate(req.orgId!, siteId);

      res.status(200).json({
        data: {
          siteId: site.id,
          pinnedUrls: site.pinnedUrls || [],
          templates,
        },
      });
    },
  );

  // POST /v1/orgs/:orgId/sites/:siteId/pages/pin - Pin or unpin a page (O A M)
  router.post(
    '/:siteId/pages/pin',
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

      const parse = pinPageSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid pin payload.',
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

      const { pageId, url, isPinned } = parse.data;
      const target = (pageId ?? url)!;
      const updatedPage = await repos.pages.setPin(req.orgId!, siteId, target, isPinned);

      if (!updatedPage) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Page not found.',
            details: {},
          },
        });
        return;
      }

      res.status(200).json({
        data: {
          page: updatedPage,
          isPinned,
        },
      });
    },
  );

  // POST /v1/orgs/:orgId/sites/:siteId/preview-exclusions - Preview excluded path globs match count (O A M)
  router.post(
    '/:siteId/preview-exclusions',
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

      const parse = previewExclusionsSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid preview exclusions payload.',
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

      const preview = await repos.pages.previewExclusions(req.orgId!, siteId, parse.data.patterns);

      res.status(200).json({
        data: preview,
      });
    },
  );

  return router;
}
