import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { Repositories } from '../../db/repositories/index.js';
import { AppError } from '../../lib/app-error.js';
import type { TurnstileVerifier } from '../../lib/turnstile.js';
import { ErrorCode } from '../../shared/errors.js';
import { assertPublicUrl, BlockedUrlError, type GuardPolicy } from '../../scanner/net/guard.js';
import type { EmailSender } from '../../emails/sender.js';
import type { StorageService } from '../../storage/index.js';
import { scoreBand, scorePage } from '../../scanner/results/score.js';
import { ruleInfo } from '../../scanner/rules/catalog.js';
import type { FreeCheckIssue, FreeCheckResultPayload } from '../../db/schema/system.js';
import { runPages, type PageResult } from '../../scanner/runner/page-runner.js';
import { silentLogger } from '../../scanner/types.js';
import { renderFreeCheckReportPdf } from '../../reports/render.js';

export const createFreeCheckBody = z.object({
  url: z.string({ error: 'Enter a valid web address.' }).trim().min(3).max(2048),
  turnstileToken: z.string().max(2048).optional(),
});

export const emailFreeCheckBody = z.object({
  email: z
    .string({ error: 'Enter a valid email address.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address.' }).max(254)),
  marketingConsent: z.boolean().optional().default(false),
});

export type FreeCheckRunner = (checkId: string, url: string) => Promise<void>;

export interface FreeChecksRouterOptions {
  guardPolicy?: GuardPolicy;
  customRunner?: FreeCheckRunner;
}

export function freeChecksPublicRouter(
  repos: Repositories,
  verifyTurnstile: TurnstileVerifier,
  emailSender?: EmailSender,
  storage?: StorageService,
  options?: FreeChecksRouterOptions,
): Router {
  const router = Router();

  const defaultRunner: FreeCheckRunner = async (checkId: string, targetUrl: string) => {
    try {
      await repos.freeChecks.updateStatus(checkId, 'running');

      // 60-second cap (Spec 11.4)
      const runResult = await runPages(
        [{ url: targetUrl, templateKey: 'home' }],
        {
          userAgent: 'Mozilla/5.0 (compatible; PlainsightBot/1.0; +https://plainsight.io/bot)',
          standard: 'wcag22aa',
          pageTimeoutMs: 50_000,
          navigationTimeoutMs: 30_000,
          log: silentLogger,
        },
      );

      const page: PageResult | undefined = runResult.pages[0];
      if (!page || page.status !== 'ok') {
        const errorMsg = page?.error || `Page scan failed with status: ${page?.status || 'unknown'}`;
        await repos.freeChecks.updateStatus(checkId, 'failed', errorMsg);
        return;
      }

      const score = scorePage(page);
      const band = scoreBand(score);

      const counts = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
      };

      const topIssues: FreeCheckIssue[] = [];

      for (const violation of page.violations) {
        const impact = violation.impact || 'minor';
        if (impact in counts) {
          counts[impact] += violation.nodes.length;
        }

        const info = ruleInfo(violation.ruleId, violation.impact);
        const firstNode = violation.nodes[0];

        topIssues.push({
          ruleId: violation.ruleId,
          title: info.title,
          impact,
          wcagCriteria: info.wcagCriteria,
          occurrences: violation.nodes.length,
          whoIsAffected: info.whoIsAffected[0] || 'Visitors experiencing accessibility barriers.',
          selector: firstNode?.target?.join(' > '),
          htmlSnippet: firstNode?.html?.slice(0, 300),
        });
      }

      // Sort top issues by impact weight (critical > serious > moderate > minor) then occurrences
      const impactOrder: Record<string, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };
      topIssues.sort((a, b) => {
        const diff = (impactOrder[b.impact] || 0) - (impactOrder[a.impact] || 0);
        return diff !== 0 ? diff : b.occurrences - a.occurrences;
      });

      const resultPayload: FreeCheckResultPayload = {
        score,
        scoreBand: band,
        counts,
        topIssues: topIssues.slice(0, 10),
        pageTitle: page.title,
        checkedAt: new Date().toISOString(),
        loadMs: page.loadMs,
      };

      await repos.freeChecks.updateResult(checkId, resultPayload, 'completed');

      // Attempt background PDF rendering and R2 storage if storage service is active
      if (storage) {
        try {
          const pdfBuffer = await renderFreeCheckReportPdf({
            url: targetUrl,
            checkedAt: resultPayload.checkedAt,
            score,
            scoreBand: band,
            counts,
            topIssues: resultPayload.topIssues,
          });
          const reportKey = `free-checks/${checkId}/report.pdf`;
          await storage.putObject(reportKey, pdfBuffer, 'application/pdf');
          await repos.freeChecks.setReportKey(checkId, reportKey);
        } catch {
          // Non-fatal if PDF generation in background fails
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await repos.freeChecks.updateStatus(checkId, 'failed', msg);
    }
  };

  const runner = options?.customRunner ?? defaultRunner;

  // POST /public/free-checks
  router.post('/free-checks', async (req, res) => {
    const input = createFreeCheckBody.parse(req.body);

    let rawUrl = input.url;
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Enter a valid web address, e.g. yourstore.com');
    }

    // SSRF Guard Check (Section 11.2)
    try {
      await assertPublicUrl(parsedUrl, options?.guardPolicy);
    } catch (err) {
      if (err instanceof BlockedUrlError) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `Blocked address: internal or private addresses cannot be scanned (${err.reason})`,
        );
      }
      throw err;
    }

    // Salted IP hash (Section 11.4)
    const salt = process.env.IP_HASH_SALT || 'plainsight-salt-2026';
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ipHash = crypto.createHash('sha256').update(clientIp + salt).digest('hex');

    // Rate Limits (Section 11.4)
    // 1. IP hash: max 3 per hour
    const ipLastHour = await repos.freeChecks.countRecentByIpHash(ipHash, 3600);
    if (ipLastHour >= 3) {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Free check limit reached for this IP. Max 3 checks per hour.');
    }

    // 2. IP hash: max 10 per day
    const ipLastDay = await repos.freeChecks.countRecentByIpHash(ipHash, 86400);
    if (ipLastDay >= 10) {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Daily free check limit reached for this IP. Max 10 checks per day.');
    }

    // 3. Domain: max 5 per day
    const domainLastDay = await repos.freeChecks.countRecentByDomain(parsedUrl.hostname, 86400);
    if (domainLastDay >= 5) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        `Daily free check limit reached for ${parsedUrl.hostname}. Max 5 checks per day.`,
      );
    }

    // 4. Global cap
    const globalToday = await repos.freeChecks.countGlobalToday();
    const globalCap = Number(process.env.FREE_CHECK_DAILY_CAP) || 500;
    if (globalToday >= globalCap) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'The free checker has reached its daily global capacity. Please start a 14-day free trial or try again tomorrow.',
      );
    }

    // Turnstile bot protection check
    if (verifyTurnstile && input.turnstileToken) {
      const turnstileOk = await verifyTurnstile(input.turnstileToken, clientIp);
      if (!turnstileOk) {
        throw new AppError(400, ErrorCode.BOT_CHECK_FAILED, 'Bot check failed. Please refresh and try again.');
      }
    }

    const check = await repos.freeChecks.create({
      url: parsedUrl.toString(),
      domain: parsedUrl.hostname,
      ipHash,
    });

    if (!check) {
      throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Failed to create free check');
    }

    // Execute check runner asynchronously
    void runner(check.id, check.url);

    res.status(201).json({
      data: {
        checkId: check.id,
        status: check.status,
        url: check.url,
      },
    });
  });

  // GET /public/free-checks/:checkId
  router.get('/free-checks/:checkId', async (req, res) => {
    const checkId = req.params.checkId;
    const check = await repos.freeChecks.findById(checkId);

    if (!check) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Free check not found or has expired.');
    }

    res.json({
      data: {
        id: check.id,
        url: check.url,
        domain: check.domain,
        status: check.status,
        result: check.result,
        errorMessage: check.errorMessage,
        hasEmail: Boolean(check.email),
        createdAt: check.createdAt,
      },
    });
  });

  // POST /public/free-checks/:checkId/email
  router.post('/free-checks/:checkId/email', async (req, res) => {
    const checkId = req.params.checkId;
    const input = emailFreeCheckBody.parse(req.body);

    const check = await repos.freeChecks.findById(checkId);
    if (!check) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Free check not found or has expired.');
    }

    await repos.freeChecks.attachEmail(checkId, input.email, input.marketingConsent);

    if (emailSender && check.result) {
      const appUrl = process.env.APP_URL || process.env.SITE_URL || 'https://plainsight.io';
      await emailSender.sendFreeCheckReport(input.email, {
        url: check.url,
        score: check.result.score,
        scoreBand: check.result.scoreBand,
        criticalCount: check.result.counts.critical,
        seriousCount: check.result.counts.serious,
        reportUrl: `${appUrl}/check/${checkId}`,
        checkId,
      });
    }

    res.json({
      data: {
        success: true,
        message: `Report sent to ${input.email}.`,
      },
    });
  });

  return router;
}
