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
import type { PgBoss } from 'pg-boss';
import { enqueueFreeCheckRun } from '../../worker/boss.js';
import { runFreeCheck } from '../../worker/jobs/free-check-run.js';

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
  /** Queue free checks on the free-check.run lane. Without it they run in-process (local dev). */
  boss?: PgBoss;
}

export function freeChecksPublicRouter(
  repos: Repositories,
  verifyTurnstile: TurnstileVerifier,
  emailSender?: EmailSender,
  storage?: StorageService,
  options?: FreeChecksRouterOptions,
): Router {
  const router = Router();

  const runner: FreeCheckRunner =
    options?.customRunner ??
    (options?.boss
      ? async (checkId) => {
          await enqueueFreeCheckRun(options.boss!, checkId);
        }
      : (checkId, url) => runFreeCheck(checkId, url, repos, storage));

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
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Enter a valid web address, e.g. yourstore.com',
      );
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
    const salt = process.env.IP_HASH_SALT || 'everyvisitor-salt-2026';
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ipHash = crypto
      .createHash('sha256')
      .update(clientIp + salt)
      .digest('hex');

    // Rate Limits (Section 11.4)
    // 1. IP hash: max 3 per hour
    const ipLastHour = await repos.freeChecks.countRecentByIpHash(ipHash, 3600);
    if (ipLastHour >= 3) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'Free check limit reached for this IP. Max 3 checks per hour.',
      );
    }

    // 2. IP hash: max 10 per day
    const ipLastDay = await repos.freeChecks.countRecentByIpHash(ipHash, 86400);
    if (ipLastDay >= 10) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'Daily free check limit reached for this IP. Max 10 checks per day.',
      );
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

    // Turnstile bot protection check. A missing token fails too once a secret is set.
    if (!(await verifyTurnstile(input.turnstileToken, clientIp))) {
      throw new AppError(
        400,
        ErrorCode.BOT_CHECK_FAILED,
        'Bot check failed. Please refresh and try again.',
      );
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
      const appUrl = process.env.APP_URL || process.env.SITE_URL || 'https://everyvisitor.app';
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
