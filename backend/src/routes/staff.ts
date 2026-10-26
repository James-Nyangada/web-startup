import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import { PLANS, BILLING_STATUSES } from '../db/schema/index.js';
import { AppError } from '../lib/app-error.js';
import type { Auth } from '../lib/auth.js';
import { sendCsv, toCsv } from '../lib/csv.js';
import { decrypt, encrypt } from '../lib/encryption.js';
import { MemoryRateLimiter } from '../lib/rate-limiter.js';
import { generateTotpSecret, totpUri, verifyTotp } from '../lib/totp.js';
import { requireAuth } from '../middleware/auth.js';
import { loadStaff, requireStaffVerified } from '../middleware/staff.js';
import { ErrorCode } from '../shared/errors.js';
import { getSystemSnapshot, isKnownQueue, type QueueAdmin } from '../staff/queue-admin.js';

export interface StaffRouterOptions {
  queueAdmin?: QueueAdmin;
  /** Issuer shown in authenticator apps. */
  totpIssuer?: string;
}

const TOTP_ATTEMPTS = 5;
const TOTP_WINDOW_MS = 15 * 60 * 1000;
const totpLimiter = new MemoryRateLimiter();

const codeSchema = z.object({ code: z.string().trim().min(6).max(8) });

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
});

const orgListSchema = pageSchema.extend({
  plan: z.enum(PLANS).optional(),
  status: z.enum(BILLING_STATUSES).optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const leadsSchema = pageSchema.extend({
  consent: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const extendTrialSchema = z.object({
  days: z.number().int().min(1).max(60),
  reason: z.string().trim().min(3).max(500),
});

const MAX_OVERRIDE_MS = 366 * 24 * 60 * 60 * 1000;
const planOverrideSchema = z.object({
  plan: z.enum(PLANS),
  expiresAt: z.coerce.date(),
  reason: z.string().trim().min(3).max(500),
});

const impersonateSchema = z.object({ reason: z.string().trim().min(3).max(500) });

const flagSchema = z.object({
  enabled: z.boolean(),
  orgIds: z.array(z.uuid()).max(500).default([]),
});
const flagKey = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_.-]{1,63}$/,
    'Use lowercase letters, numbers, dots, dashes or underscores.',
  );

const uuidParam = z.uuid();

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function orgIdParam(req: Request) {
  const parsed = uuidParam.safeParse(param(req, 'orgId'));
  if (!parsed.success) throw AppError.notFound('Organisation not found.');
  return asOrgId(parsed.data);
}

/**
 * Internal admin (spec 7.12, S-70 – S-75). Every route needs a staff user; everything past the
 * TOTP endpoints also needs a session that passed TOTP within the last 12 hours.
 */
export function staffRouter(
  auth: Auth,
  repos: Repositories,
  options: StaffRouterOptions = {},
): Router {
  const router = Router();
  const issuer = options.totpIssuer ?? 'EveryVisitor Staff';
  router.use(requireAuth(auth), loadStaff(repos));

  const audit = (
    req: Request,
    orgId: string | null,
    action: string,
    data: Record<string, unknown> = {},
    target?: { type: string; id: string },
  ) =>
    repos.auditLog.write(orgId ? asOrgId(orgId) : null, {
      actorId: req.staff!.userId,
      actorType: 'staff',
      action,
      targetType: target?.type,
      targetId: target?.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      data,
    });

  /* ---------- P6-01: session and TOTP ---------- */

  router.get('/session', (req: Request, res: Response) => {
    const s = req.staff!;
    res.json({
      data: {
        email: s.email,
        totpEnrolled: Boolean(s.totpEnabledAt),
        verified: Boolean(s.totpEnabledAt) && Boolean(s.staffVerifiedAt),
        verifiedAt: s.staffVerifiedAt,
        impersonatingOrgId: s.impersonatingOrgId,
      },
    });
  });

  router.post('/totp/enroll', async (req: Request, res: Response) => {
    const s = req.staff!;
    if (s.totpEnabledAt) {
      throw new AppError(409, ErrorCode.CONFLICT, 'An authenticator app is already set up.');
    }
    const secret = generateTotpSecret();
    await repos.staff.setTotpSecret(s.userId, encrypt(secret));
    res.status(201).json({
      data: { secret, otpauthUrl: totpUri(secret, s.email, issuer) },
    });
  });

  const checkCode = (req: Request): boolean => {
    const s = req.staff!;
    // Per session and per user, so opening new sessions does not buy more guesses.
    const keys: Array<[string, number]> = [
      [`staff-totp:${s.sessionId}`, TOTP_ATTEMPTS],
      [`staff-totp-user:${s.userId}`, TOTP_ATTEMPTS * 2],
    ];
    for (const [key, max] of keys) {
      const limit = totpLimiter.check(key, max, TOTP_WINDOW_MS);
      if (!limit.allowed) {
        throw new AppError(429, ErrorCode.RATE_LIMITED, 'Too many attempts. Try again later.', {
          retryAfterSeconds: Math.ceil(limit.resetInMs / 1000),
        });
      }
    }
    const { code } = codeSchema.parse(req.body);
    if (!s.totpSecretEncrypted) {
      throw new AppError(409, ErrorCode.STAFF_TOTP_ENROLMENT_REQUIRED, 'Start enrolment first.');
    }
    const ok = verifyTotp(decrypt(s.totpSecretEncrypted), code);
    for (const [key] of keys) {
      if (ok) totpLimiter.reset(key);
      else totpLimiter.record(key, TOTP_WINDOW_MS);
    }
    return ok;
  };

  router.post('/totp/confirm', async (req: Request, res: Response) => {
    const s = req.staff!;
    if (s.totpEnabledAt) {
      throw new AppError(409, ErrorCode.CONFLICT, 'An authenticator app is already set up.');
    }
    if (!checkCode(req)) {
      throw new AppError(400, ErrorCode.INVALID_TOKEN, 'That code is not correct.');
    }
    await repos.staff.enableTotp(s.userId);
    await repos.staff.markSessionVerified(s.sessionId);
    await audit(req, null, 'staff.totp_enrolled');
    res.json({ data: { verified: true } });
  });

  router.post('/totp/verify', async (req: Request, res: Response) => {
    const s = req.staff!;
    if (!s.totpEnabledAt) {
      throw new AppError(
        409,
        ErrorCode.STAFF_TOTP_ENROLMENT_REQUIRED,
        'Set up an authenticator first.',
      );
    }
    if (!checkCode(req)) {
      await audit(req, null, 'staff.totp_failed');
      throw new AppError(400, ErrorCode.INVALID_TOKEN, 'That code is not correct.');
    }
    await repos.staff.markSessionVerified(s.sessionId);
    await audit(req, null, 'staff.signed_in');
    res.json({ data: { verified: true } });
  });

  router.use(requireStaffVerified);

  /* ---------- P6-02: organisations ---------- */

  router.get('/orgs', async (req: Request, res: Response) => {
    const f = orgListSchema.parse(req.query);
    const { items, nextOffset } = await repos.staff.listOrgs({
      q: f.q,
      plan: f.plan,
      billingStatus: f.status,
      includeDeleted: f.includeDeleted,
      limit: f.limit,
      offset: f.cursor,
    });
    res.json({ data: items, nextCursor: nextOffset === null ? null : String(nextOffset) });
  });

  router.get('/orgs/:orgId', async (req: Request, res: Response) => {
    const detail = await repos.staff.getOrgDetail(orgIdParam(req));
    if (!detail) throw AppError.notFound('Organisation not found.');
    res.json({ data: detail });
  });

  router.post('/orgs/:orgId/extend-trial', async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const { days, reason } = extendTrialSchema.parse(req.body);
    const org = await repos.organizations.findById(orgId);
    if (!org) throw AppError.notFound('Organisation not found.');
    const base = Math.max(Date.now(), org.trialEndsAt?.getTime() ?? 0);
    const trialEndsAt = new Date(base + days * 24 * 60 * 60 * 1000);
    const updated = await repos.staff.extendTrial(orgId, trialEndsAt);
    await audit(req, orgId, 'staff.trial_extended', {
      days,
      reason,
      previousTrialEndsAt: org.trialEndsAt,
      trialEndsAt,
    });
    res.json({ data: { org: updated } });
  });

  router.put('/orgs/:orgId/plan-override', async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const body = planOverrideSchema.parse(req.body);
    const ms = body.expiresAt.getTime() - Date.now();
    if (ms <= 0 || ms > MAX_OVERRIDE_MS) {
      throw AppError.validation('The override must expire between now and one year from now.');
    }
    const updated = await repos.staff.setPlanOverride(orgId, body);
    if (!updated) throw AppError.notFound('Organisation not found.');
    await audit(req, orgId, 'staff.plan_override_set', {
      plan: body.plan,
      expiresAt: body.expiresAt,
      reason: body.reason,
      billedPlan: updated.plan,
    });
    res.json({ data: { org: updated } });
  });

  router.delete('/orgs/:orgId/plan-override', async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const updated = await repos.staff.setPlanOverride(orgId, null);
    if (!updated) throw AppError.notFound('Organisation not found.');
    await audit(req, orgId, 'staff.plan_override_cleared');
    res.json({ data: { org: updated } });
  });

  router.post('/orgs/:orgId/impersonate', async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const { reason } = impersonateSchema.parse(req.body);
    const org = await repos.organizations.findById(orgId);
    if (!org) throw AppError.notFound('Organisation not found.');
    const previous = req.staff!.impersonatingOrgId;
    if (previous && previous !== orgId) {
      await audit(req, previous, 'staff.impersonation_stopped', { switchedTo: orgId });
    }
    await repos.staff.setImpersonation(req.staff!.sessionId, orgId);
    await audit(req, orgId, 'staff.impersonation_started', { reason, readOnly: true });
    res.json({ data: { org: { id: org.id, slug: org.slug, name: org.name }, readOnly: true } });
  });

  router.post('/impersonation/stop', async (req: Request, res: Response) => {
    const orgId = req.staff!.impersonatingOrgId;
    if (orgId) {
      await repos.staff.setImpersonation(req.staff!.sessionId, null);
      await audit(req, orgId, 'staff.impersonation_stopped');
    }
    res.json({ data: { stopped: Boolean(orgId) } });
  });

  /* ---------- P6-03: queues and system ---------- */

  const queueAdmin = () => {
    if (!options.queueAdmin) {
      throw new AppError(503, ErrorCode.FEATURE_DISABLED, 'The job queue is not connected.');
    }
    return options.queueAdmin;
  };

  const queueParam = (req: Request) => {
    const name = param(req, 'queue');
    if (!isKnownQueue(name)) throw AppError.notFound('Queue not found.');
    return name;
  };

  router.get('/queues', async (_req: Request, res: Response) => {
    res.json({ data: { queues: await queueAdmin().listQueues() } });
  });

  router.get('/queues/:queue/jobs', async (req: Request, res: Response) => {
    const name = queueParam(req);
    const state = req.query.state === 'active' ? 'active' : 'failed';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    res.json({ data: { jobs: await queueAdmin().listJobs(name, state, limit) } });
  });

  router.post('/queues/:queue/jobs/:jobId/retry', async (req: Request, res: Response) => {
    const name = queueParam(req);
    const jobId = uuidParam.parse(param(req, 'jobId'));
    await queueAdmin().retryJob(name, jobId);
    await audit(req, null, 'staff.job_retried', { queue: name, jobId });
    res.json({ data: { retried: true } });
  });

  router.delete('/queues/:queue/jobs/:jobId', async (req: Request, res: Response) => {
    const name = queueParam(req);
    const jobId = uuidParam.parse(param(req, 'jobId'));
    await queueAdmin().deleteJob(name, jobId);
    await audit(req, null, 'staff.job_deleted', { queue: name, jobId });
    res.json({ data: { deleted: true } });
  });

  router.get('/system', async (req: Request, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [metrics, system] = await Promise.all([
      repos.staff.getMetrics(since),
      getSystemSnapshot(process.env.DATA_DIR ?? process.cwd()),
    ]);
    res.json({ data: { days, metrics, system } });
  });

  /* ---------- P6-04: leads ---------- */

  router.get('/leads/free-checks', async (req: Request, res: Response) => {
    const f = leadsSchema.parse(req.query);
    const { items, nextOffset } = await repos.staff.listFreeCheckLeads({
      q: f.q,
      consentOnly: f.consent,
      limit: f.limit,
      offset: f.cursor,
    });
    res.json({ data: items, nextCursor: nextOffset === null ? null : String(nextOffset) });
  });

  router.get('/leads/waitlist', async (req: Request, res: Response) => {
    const f = leadsSchema.parse(req.query);
    const { items, nextOffset } = await repos.staff.listWaitlist({
      q: f.q,
      consentOnly: f.consent,
      limit: f.limit,
      offset: f.cursor,
    });
    res.json({ data: items, nextCursor: nextOffset === null ? null : String(nextOffset) });
  });

  // Only people who agreed to marketing email are ever exported (spec 11.5, P6-04).
  router.get('/leads/export.csv', async (req: Request, res: Response) => {
    const leads = await repos.staff.listConsentedLeads();
    await audit(req, null, 'staff.leads_exported', { count: leads.length });
    const csv = toCsv(
      ['Email', 'Source', 'Domain', 'Converted', 'First seen'],
      leads.map((l) => [l.email, l.source, l.domain, l.converted ? 'yes' : 'no', l.createdAt]),
    );
    sendCsv(res, `consented-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });

  /* ---------- P6-05: content review and feature flags ---------- */

  router.get('/ai-suggestions/flagged', async (_req: Request, res: Response) => {
    res.json({ data: { items: await repos.staff.listFlaggedSuggestions() } });
  });

  const suggestionParam = async (req: Request) => {
    const id = uuidParam.safeParse(param(req, 'id'));
    const suggestion = id.success ? await repos.staff.findSuggestion(id.data) : null;
    if (!suggestion) throw AppError.notFound('Suggestion not found.');
    return suggestion;
  };

  router.post('/ai-suggestions/:id/approve', async (req: Request, res: Response) => {
    const suggestion = await suggestionParam(req);
    const updated = await repos.staff.approveSuggestion(suggestion.id);
    await audit(
      req,
      null,
      'staff.ai_suggestion_approved',
      { ruleId: suggestion.ruleId },
      {
        type: 'ai_suggestion',
        id: suggestion.id,
      },
    );
    res.json({ data: { suggestion: updated } });
  });

  router.delete('/ai-suggestions/:id', async (req: Request, res: Response) => {
    const suggestion = await suggestionParam(req);
    await repos.staff.deleteSuggestion(suggestion.id);
    await audit(
      req,
      null,
      'staff.ai_suggestion_deleted',
      { ruleId: suggestion.ruleId },
      {
        type: 'ai_suggestion',
        id: suggestion.id,
      },
    );
    res.json({ data: { deleted: true } });
  });

  router.post('/ai-suggestions/:id/promote', async (req: Request, res: Response) => {
    const suggestion = await suggestionParam(req);
    const slug = `${suggestion.ruleId}-${suggestion.platform}-draft-${suggestion.id.slice(-6)}`;
    const guide = await repos.staff.promoteSuggestionToDraft(suggestion, {
      slug,
      title: `Fix ${suggestion.ruleId} on ${suggestion.platform} (draft)`,
    });
    if (!guide) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'A guide already exists for this rule and platform. Edit it in packages/fix-guides instead.',
      );
    }
    await audit(
      req,
      null,
      'staff.ai_suggestion_promoted',
      { ruleId: suggestion.ruleId, slug },
      {
        type: 'fix_guide',
        id: guide.id,
      },
    );
    res.status(201).json({ data: { guide } });
  });

  router.get('/feature-flags', async (_req: Request, res: Response) => {
    res.json({ data: { flags: await repos.featureFlags.list() } });
  });

  router.put('/feature-flags/:key', async (req: Request, res: Response) => {
    const key = flagKey.parse(param(req, 'key'));
    const body = flagSchema.parse(req.body);
    const before = await repos.featureFlags.find(key);
    const flag = await repos.featureFlags.upsert(key, body);
    await audit(req, null, 'staff.feature_flag_updated', {
      key,
      before: before ? { enabled: before.enabled, orgIds: before.orgIds } : null,
      after: body,
    });
    res.json({ data: { flag } });
  });

  router.delete('/feature-flags/:key', async (req: Request, res: Response) => {
    const key = flagKey.parse(param(req, 'key'));
    if (!(await repos.featureFlags.delete(key))) throw AppError.notFound('Flag not found.');
    await audit(req, null, 'staff.feature_flag_deleted', { key });
    res.json({ data: { deleted: true } });
  });

  return router;
}
