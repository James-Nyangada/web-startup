import { FRAMEWORKS } from '../scanner/platform/framework.js';
import { PLATFORMS, type Platform } from '../scanner/types.js';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import {
  PLANS,
  BILLING_STATUSES,
  STAFF_ROLES,
  CONTENT_POST_TYPES,
  CONTENT_POST_STATUSES,
  CHANGELOG_TYPES,
  BANNER_SURFACES,
  BANNER_STYLES,
  type ContentPostType,
  type ContentPostStatus,
  type BannerSurface,
} from '../db/schema/index.js';
import { AppError } from '../lib/app-error.js';
import type { Auth } from '../lib/auth.js';
import { sendCsv, toCsv } from '../lib/csv.js';
import { decrypt, encrypt } from '../lib/encryption.js';
import { MemoryRateLimiter } from '../lib/rate-limiter.js';
import { generateTotpSecret, totpUri, verifyTotp } from '../lib/totp.js';
import { requireAuth } from '../middleware/auth.js';
import { loadStaff, requireStaffVerified, requireStaffPermission } from '../middleware/staff.js';
import { ErrorCode } from '../shared/errors.js';
import type { PgBoss } from 'pg-boss';
import { INACTIVE_AFTER_DAYS, sendCheckIn } from '../billing/customer-outreach.js';
import type { EmailSender } from '../emails/sender.js';
import type { StorageService } from '../storage/index.js';
import { getSystemSnapshot, isKnownQueue, type QueueAdmin } from '../staff/queue-admin.js';
import { validatePageContent } from '../shared/content-schemas.js';
import { hasPermission } from '../shared/staff-permissions.js';
import { METRIC_KEYS, REVENUE_METRICS, aggregatePoints, previousPeriod } from '../shared/metrics.js';
import { fetchTrafficReport, isUmamiConfigured, umamiConfig, type TrafficReport } from '../lib/umami.js';
import { requestSiteRebuild } from '../lib/site-rebuild.js';
import { enqueueLegalNotice } from '../worker/boss.js';
import { todayUtc } from '../db/repositories/staff-analytics.js';
import { umamiCacheKey } from '../worker/jobs/phase8.js';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  MEDIA_LIMITS,
  assertSafeSvg,
  detectMime,
  extensionFor,
  isImage,
  isRasterImage,
  processRasterImage,
  sizeLimitFor,
} from '../lib/media-processing.js';

export interface StaffRouterOptions {
  queueAdmin?: QueueAdmin;
  /** Issuer shown in authenticator apps. */
  totpIssuer?: string;
  /** Used by the "send check-in" button; without either, that button reports an error. */
  boss?: PgBoss;
  emailSender?: EmailSender;
  storage?: StorageService;
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
  healthBand: z.enum(['good', 'at_risk', 'poor']).optional(),
  platform: z.enum(PLATFORMS as unknown as [Platform, ...Platform[]]).optional(),
  framework: z.enum(FRAMEWORKS as unknown as [string, ...string[]]).optional(),
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** A query-string value as a plain string; arrays and objects are ignored. */
function queryString(req: Request, name: string): string | undefined {
  const v = req.query[name];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function orgIdParam(req: Request) {
  const parsed = uuidParam.safeParse(param(req, 'orgId'));
  if (!parsed.success) throw AppError.notFound('Organisation not found.');
  return asOrgId(parsed.data);
}

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
        role: s.role,
        displayName: s.displayName,
        staffMemberId: s.staffMemberId,
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

  /* ---------- P8-01: Staff & roles (S-102) ---------- */

  const staffMemberCreateSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    role: z.enum(STAFF_ROLES),
    displayName: z.string().trim().max(100).optional(),
    jobTitle: z.string().trim().max(100).optional(),
    bio: z.string().trim().max(500).optional(),
  });

  const staffMemberUpdateSchema = z.object({
    role: z.enum(STAFF_ROLES).optional(),
    displayName: z.string().trim().max(100).nullable().optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    avatarKey: z.string().nullable().optional(),
    active: z.boolean().optional(),
  });

  router.get('/members', requireStaffPermission('manage_staff'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.listStaffMembers() });
  });

  const staffInviteUrl = (rawToken: string) =>
    `${process.env.APP_URL || 'http://localhost:3000'}/staff-invite/${rawToken}`;

  const sendStaffInvite = async (
    req: Request,
    email: string,
    role: string,
    rawToken: string,
  ) => {
    await options.emailSender?.send({
      to: email,
      templateId: 'E-04',
      data: {
        inviterName: req.staff!.displayName || req.staff!.email,
        orgName: '',
        role: 'member',
        staffRole: role,
        inviteUrl: staffInviteUrl(rawToken),
        expiresInDays: 7,
      },
    });
  };

  // Invites someone by email; their account and staff record are created when they accept.
  router.post('/members', requireStaffPermission('manage_staff'), async (req: Request, res: Response) => {
    const body = staffMemberCreateSchema.parse(req.body);
    const user = await repos.users.findByEmail(body.email);
    if (user && (await repos.staff.findStaffMemberByUserId(user.id))) {
      throw new AppError(409, ErrorCode.CONFLICT, 'This person is already a staff member.');
    }
    const { invitation, rawToken } = await repos.staff.createStaffInvitation({
      ...body,
      invitedBy: req.staff!.userId,
    });
    await sendStaffInvite(req, invitation.email, invitation.role, rawToken);
    await audit(req, null, 'staff.member_invited', { email: body.email, role: body.role });
    res.status(201).json({
      data: { id: invitation.id, email: invitation.email, role: invitation.role, invited: true },
    });
  });

  router.get('/member-invitations', requireStaffPermission('manage_staff'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.listPendingStaffInvitations() });
  });

  router.post('/member-invitations/:id/resend', requireStaffPermission('manage_staff'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const current = await repos.staff.findStaffInvitationById(id);
    if (!current || current.acceptedAt) throw AppError.notFound('Invitation not found.');
    const { invitation, rawToken } = await repos.staff.createStaffInvitation({
      email: current.email,
      role: current.role,
      displayName: current.displayName ?? undefined,
      jobTitle: current.jobTitle ?? undefined,
      bio: current.bio ?? undefined,
      invitedBy: req.staff!.userId,
    });
    await sendStaffInvite(req, invitation.email, invitation.role, rawToken);
    await audit(req, null, 'staff.member_invite_resent', { email: invitation.email });
    res.json({ data: { id: invitation.id, invited: true } });
  });

  router.delete('/member-invitations/:id', requireStaffPermission('manage_staff'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const revoked = await repos.staff.revokeStaffInvitation(id);
    if (!revoked) throw AppError.notFound('Invitation not found.');
    await audit(req, null, 'staff.member_invite_revoked', { id });
    res.json({ data: { revoked: true } });
  });

  router.patch('/members/:id', requireStaffPermission('manage_staff'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const body = staffMemberUpdateSchema.parse(req.body);
    const current = await repos.staff.findStaffMemberById(id);
    if (!current) throw AppError.notFound('Staff member not found.');

    if (current.role === 'owner' && ((body.role && body.role !== 'owner') || body.active === false)) {
      const canDemote = await repos.staff.canDemoteOrRemoveOwner(id);
      if (!canDemote) {
        throw AppError.validation('Cannot demote or deactivate the last active owner.');
      }
    }

    const updated = await repos.staff.updateStaffMember(id, body);
    if (!updated) throw AppError.notFound('Staff member not found.');
    await audit(req, null, 'staff.member_updated', { id, ...body });
    res.json({ data: updated });
  });

  router.delete('/members/:id', requireStaffPermission('manage_staff'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const current = await repos.staff.findStaffMemberById(id);
    if (!current) throw AppError.notFound('Staff member not found.');

    if (current.role === 'owner') {
      const canRemove = await repos.staff.canDemoteOrRemoveOwner(id);
      if (!canRemove) {
        throw AppError.validation('Cannot delete the last active owner.');
      }
    }

    const ok = await repos.staff.deleteStaffMember(id);
    if (!ok) throw AppError.notFound('Staff member not found.');
    await audit(req, null, 'staff.member_deleted', { id });
    res.json({ data: { deleted: true } });
  });

  /* ---------- P8-04, P8-13 to P8-16: Dashboards and Analytics ---------- */

  router.get('/dashboard', requireStaffPermission('view_dashboards'), async (_req: Request, res: Response) => {
    const today = todayUtc();
    // First load after deploy: the nightly job has not run yet, so compute today's row now.
    if (!(await repos.staff.hasMetricsForDate(today))) {
      await repos.staff.computeMetricsForDate(today);
    }
    const [summary, needsAttention, recentActivity] = await Promise.all([
      repos.staff.dashboard(today),
      repos.staff.listInactivePaying(14, 5).then((inactive) => repos.staff.needsAttention(inactive)),
      repos.staff.recentActivity(),
    ]);
    res.json({
      data: {
        ...summary,
        needsAttention,
        recentActivity,
        trafficConnected: isUmamiConfigured(),
      },
    });
  });

  const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.');
  const metricsQuery = z.object({
    metric: z.enum(METRIC_KEYS),
    from: dateParam.optional(),
    to: dateParam.optional(),
    granularity: z.enum(['day', 'week', 'month']).default('day'),
    dimension: z.string().max(80).optional(),
    compare: z.enum(['true', 'false']).optional(),
  });

  function canViewMetric(req: Request, metric: string): boolean {
    const role = req.staff?.role;
    if (!role) return false;
    return hasPermission(role, REVENUE_METRICS.has(metric) ? 'view_revenue' : 'view_dashboards');
  }

  router.get('/metrics', async (req: Request, res: Response) => {
    const q = metricsQuery.parse(req.query);
    if (!canViewMetric(req, q.metric)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have permission to view this metric.');
    }
    const to = q.to ?? todayUtc();
    const from = q.from ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const dimension = q.dimension ?? null;

    const load = async (f: string, t: string) =>
      aggregatePoints(
        (await repos.staff.queryMetrics(q.metric, f, t, dimension)).map((r) => ({
          date: r.date,
          value: Number(r.value),
        })),
        q.granularity,
        q.metric,
      );
    const points = await load(from, to);
    const prev = previousPeriod(from, to);
    res.json({
      data: {
        metric: q.metric,
        from,
        to,
        points,
        ...(q.compare === 'true' ? { comparison: await load(prev.from, prev.to) } : {}),
      },
    });
  });

  const rangeQuery = z.object({
    from: dateParam.optional(),
    to: dateParam.optional(),
    report: z.string().optional(),
    by: z.string().optional(),
  });
  const rangeOf = (req: Request) => {
    const q = rangeQuery.parse(req.query);
    const to = q.to ?? todayUtc();
    const from = q.from ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    return { from, to };
  };

  /** Umami-backed report, cached for an hour. `configured: false` when Umami is not connected. */
  router.get('/analytics/traffic', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const cfg = umamiConfig();
    if (!cfg) {
      res.json({ data: { configured: false } });
      return;
    }
    const { from, to } = rangeOf(req);
    const key = umamiCacheKey(from, to);
    let report = await repos.staff.getAnalyticsCache<TrafficReport>(key);
    if (!report) {
      try {
        report = await fetchTrafficReport(from, to, cfg);
      } catch (err) {
        throw new AppError(
          502,
          ErrorCode.INTERNAL_ERROR,
          `Umami could not be reached: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
      await repos.staff.setAnalyticsCache(key, report, 3600);
    }
    const checks = await repos.staff.checkerUsage(from, to);
    res.json({ data: { ...report, checker: checks } });
  });

  router.get('/analytics/funnel', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const { from, to } = rangeOf(req);
    res.json({ data: await repos.staff.funnel(from, to) });
  });

  router.get('/analytics/cohorts', requireStaffPermission('view_revenue'), async (_req: Request, res: Response) => {
    res.json({ data: { cohorts: await repos.staff.cohorts() } });
  });

  router.get('/analytics/business', requireStaffPermission('view_revenue'), async (req: Request, res: Response) => {
    const { from, to } = rangeOf(req);
    const [cancellations, plans, topCustomers] = await Promise.all([
      repos.staff.cancellationBreakdown(from, to),
      repos.staff.planMix(),
      repos.staff.topCustomers(10),
    ]);
    res.json({ data: { cancellations, plans, topCustomers } });
  });

  router.get('/analytics/product', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const { from, to } = rangeOf(req);
    const [adoption, issueTrend, aiTrend, platforms] = await Promise.all([
      repos.staff.featureAdoption(),
      repos.staff.issueTrend(from, to),
      repos.staff.aiSuggestionTrend(from, to),
      repos.staff.platformBreakdown(),
    ]);
    res.json({ data: { adoption, issueTrend, aiTrend, platforms } });
  });

  router.get('/analytics/activation', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const { from, to } = rangeOf(req);
    res.json({ data: await repos.staff.activationDistribution(from, to) });
  });

  router.get('/metrics/export.csv', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const q = metricsQuery.parse(req.query);
    if (!canViewMetric(req, q.metric)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have permission to export this metric.');
    }
    const metric = q.metric;
    const to = q.to ?? todayUtc();
    const from = q.from ?? new Date(Date.now() - 364 * 86_400_000).toISOString().slice(0, 10);
    const rows = await repos.staff.queryMetrics(metric, from, to, q.dimension ?? null);
    const csv = toCsv(
      ['Date', 'Metric', 'Dimension', 'Value'],
      rows.map((r) => [r.date, r.metric, r.dimension ?? '', r.value]),
    );
    sendCsv(res, `${metric}-${from}-to-${to}.csv`, csv);
  });

  router.get('/tools/utm', (req: Request, res: Response) => {
    const url = queryString(req, 'url') ?? 'https://everyvisitor.app';
    const source = queryString(req, 'source') ?? 'linkedin';
    const medium = queryString(req, 'medium') ?? 'social';
    const campaign = queryString(req, 'campaign') ?? 'launch';
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw AppError.validation('Enter a full web address, starting with https://');
    }
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', campaign);
    res.json({ data: { taggedUrl: u.toString() } });
  });

  /* ---------- P8-05 to P8-12: Content Management (CMS) ---------- */

  const contentPostSchema = z.object({
    type: z.enum(CONTENT_POST_TYPES).default('blog'),
    title: z.string().trim().min(1).max(90),
    slug: z.string().trim().min(1).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and dashes.'),
    excerpt: z.string().trim().max(200).optional(),
    bodyMd: z.string().default(''),
    coverMediaId: z.uuid().nullable().optional(),
    coverAlt: z.string().nullable().optional(),
    authorStaffId: z.uuid(),
    tags: z.array(z.string().trim()).default([]),
    seoTitle: z.string().trim().max(60).optional(),
    seoDescription: z.string().trim().max(160).optional(),
    ogMediaId: z.uuid().nullable().optional(),
    canonicalUrl: z.string().url().nullable().optional(),
    noindex: z.boolean().default(false),
    status: z.enum(CONTENT_POST_STATUSES).default('draft'),
    publishAt: z.coerce.date().nullable().optional(),
    ruleId: z.string().nullable().optional(),
    // `generic` was the old name for Custom code guides; store them as `custom` (docs/adr/0001).
    platform: z
      .string()
      .nullable()
      .optional()
      .transform((p) => (p === 'generic' ? 'custom' : p)),
    sections: z
      .object({
        whatsWrong: z.string().default(''),
        whoItAffects: z.string().default(''),
        howToFix: z.string().default(''),
        codeExample: z
          .object({
            incorrect: z.string().optional(),
            correct: z.string().optional(),
            language: z.string().max(30).optional(),
          })
          .optional(),
        extraExamples: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(60),
              language: z.string().max(30).optional(),
              code: z.string(),
            }),
          )
          .max(10)
          .optional(),
        howToCheck: z.string().default(''),
      })
      .nullable()
      .optional(),
  });

  router.get('/content/posts', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const type = req.query.type as ContentPostType | undefined;
    const status = req.query.status as ContentPostStatus | undefined;
    const tag = queryString(req, 'tag');
    const q = queryString(req, 'q');
    const limit = Number(req.query.limit) || 50;
    const cursor = Number(req.query.cursor) || 0;

    const { items, nextOffset } = await repos.staff.listContentPosts({
      type,
      status,
      tag,
      q,
      limit,
      offset: cursor,
    });
    res.json({ data: items, nextCursor: nextOffset !== null ? String(nextOffset) : null });
  });

  /** A cover image needs alt text: its own, or the media library's, unless the image is decorative. */
  async function assertCoverAlt(coverMediaId: string | null | undefined, coverAlt: string | null | undefined) {
    if (!coverMediaId) return;
    const media = await repos.staff.findMediaById(coverMediaId);
    if (!media) throw AppError.validation('The cover image was not found in the media library.');
    if (!media.isDecorative && !coverAlt?.trim() && !media.altText?.trim()) {
      throw AppError.validation('The cover image needs alt text. Add it here or in the media library, or mark the image as decorative.');
    }
  }

  // Real staff who can be named as an author. Readable by content roles (the members list is owner-only).
  router.get('/content/authors', requireStaffPermission('write_content'), async (_req: Request, res: Response) => {
    const members = await repos.staff.listStaffMembers();
    res.json({
      data: members
        .filter((m) => m.active)
        .map((m) => ({ id: m.id, displayName: m.displayName ?? m.name ?? m.email, jobTitle: m.jobTitle ?? null })),
    });
  });

  // Live check used by the editor while typing a slug.
  router.get('/content/posts/slug-available', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const q = z
      .object({ type: z.enum(CONTENT_POST_TYPES).default('blog'), slug: z.string().min(1).max(120), excludeId: z.uuid().optional() })
      .parse(req.query);
    const existing = await repos.staff.findContentPostBySlug(q.type, q.slug);
    res.json({ data: { available: !existing || existing.id === q.excludeId } });
  });

  router.post('/content/posts', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const body = contentPostSchema.parse(req.body);
    await assertCoverAlt(body.coverMediaId, body.coverAlt);
    const existing = await repos.staff.findContentPostBySlug(body.type, body.slug);
    if (existing) {
      throw new AppError(409, ErrorCode.CONFLICT, `A ${body.type} post with slug "${body.slug}" already exists.`);
    }
    const created = await repos.staff.createContentPost({
      ...body,
      updatedBy: req.staff!.userId,
    });
    await audit(req, null, 'content.post_created', { id: created?.id, type: body.type, slug: body.slug });
    res.status(201).json({ data: created });
  });

  router.get('/content/posts/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const post = await repos.staff.findContentPostById(id);
    if (!post) throw AppError.notFound('Post not found.');
    res.json({ data: post });
  });

  router.patch('/content/posts/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const body = contentPostSchema.partial().parse(req.body);
    if (body.coverMediaId !== undefined) await assertCoverAlt(body.coverMediaId, body.coverAlt);
    if (body.slug) {
      const type = body.type ?? (await repos.staff.findContentPostById(id))?.type ?? 'blog';
      const clash = await repos.staff.findContentPostBySlug(type, body.slug);
      if (clash && clash.id !== id) {
        throw new AppError(409, ErrorCode.CONFLICT, `A ${type} post with slug "${body.slug}" already exists.`);
      }
    }
    const updated = await repos.staff.updateContentPost(id, body, req.staff!.userId);
    if (!updated) throw AppError.notFound('Post not found.');
    await audit(req, null, 'content.post_updated', { id, slug: updated.slug });
    // Edits to a live post go out with the next rebuild.
    if (updated.status === 'published') triggerSiteRebuild('publish', req.staff!.userId);
    res.json({ data: updated });
  });

  router.delete('/content/posts/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const ok = await repos.staff.deleteContentPost(id);
    if (!ok) throw AppError.notFound('Post not found.');
    await audit(req, null, 'content.post_deleted', { id });
    res.json({ data: { deleted: true } });
  });

  router.post('/content/posts/:id/publish', requireStaffPermission('publish_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const post = await repos.staff.publishContentPost(id);
    if (!post) throw AppError.notFound('Post not found.');
    await audit(req, null, 'content.post_published', { id, slug: post.slug });
    triggerSiteRebuild('publish', req.staff!.userId);
    res.json({ data: post });
  });

  // Spec 3.3: an Admin (or the Owner) marks a guide reviewed; who and when are recorded.
  router.post('/content/posts/:id/review', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const post = await repos.staff.findContentPostById(id);
    if (!post) throw AppError.notFound('Post not found.');
    if (post.type !== 'guide') throw AppError.validation('Only fix guides have a review status.');
    const updated = await repos.staff.updateContentPost(id, { reviewedAt: new Date(), reviewedBy: req.staff!.userId }, req.staff!.userId);
    await audit(req, null, 'content.guide_reviewed', { id, slug: post.slug });
    res.json({ data: updated });
  });

  router.post('/content/posts/:id/unpublish', requireStaffPermission('publish_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const post = await repos.staff.unpublishContentPost(id);
    if (!post) throw AppError.notFound('Post not found.');
    await audit(req, null, 'content.post_unpublished', { id, slug: post.slug });
    triggerSiteRebuild('publish', req.staff!.userId);
    res.json({ data: post });
  });

  router.post('/content/posts/:id/schedule', requireStaffPermission('publish_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const { publishAt } = z.object({ publishAt: z.coerce.date() }).parse(req.body);
    if (publishAt.getTime() <= Date.now()) throw AppError.validation('Choose a time in the future to schedule this post.');
    const post = await repos.staff.scheduleContentPost(id, publishAt);
    if (!post) throw AppError.notFound('Post not found.');
    await audit(req, null, 'content.post_scheduled', { id, publishAt });
    res.json({ data: post });
  });

  router.get('/content/posts/:id/revisions', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    res.json({ data: await repos.staff.listRevisions(id) });
  });

  router.post('/content/posts/:id/restore/:version', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const version = Number(param(req, 'version'));
    const post = await repos.staff.restoreRevision(id, version, req.staff!.userId);
    if (!post) throw AppError.notFound('Revision not found.');
    await audit(req, null, 'content.post_revision_restored', { id, version });
    res.json({ data: post });
  });

  router.post('/content/posts/:id/preview-link', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const post = await repos.staff.findContentPostById(id);
    if (!post) throw AppError.notFound('Post not found.');
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    await repos.staff.setAnalyticsCache(`preview:${token}`, { postId: id, type: post.type, slug: post.slug }, 7 * 86_400);
    const previewUrl = `/preview/${token}`;
    res.json({ data: { token, previewUrl, expiresAt } });
  });

  router.post('/content/check', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const checkSchema = z.object({
      title: z.string().default(''),
      bodyMd: z.string().default(''),
      excerpt: z.string().optional(),
    });
    const { title, bodyMd, excerpt = '' } = checkSchema.parse(req.body);
    const settings = await repos.staff.getSiteSettings();
    const bannedWords = settings.bannedWords || [];

    const warnings: { type: string; message: string; detail?: string }[] = [];
    const fullText = `${title} ${excerpt} ${bodyMd}`.toLowerCase();

    // 1. Banned words
    for (const word of bannedWords) {
      if (fullText.includes(word.toLowerCase())) {
        warnings.push({
          type: 'banned_word',
          message: `Avoid banned phrase: "${word}". EveryVisitor never makes absolute accessibility compliance claims.`,
        });
      }
    }

    // 2. Images without alt text
    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
    let match;
    while ((match = imgRegex.exec(bodyMd)) !== null) {
      if (!match[1]?.trim()) {
        warnings.push({
          type: 'image_alt_missing',
          message: `Image found without alt text: "${match[2]}". Provide descriptive alt text or mark decorative.`,
        });
      }
    }

    // 3. Heading level skipping
    const headingMatches = [...bodyMd.matchAll(/^(#{1,6})\s+(.*)$/gm)];
    let prevLevel = 1;
    for (const h of headingMatches) {
      const level = h[1]!.length;
      if (level > prevLevel + 1) {
        warnings.push({
          type: 'heading_hierarchy',
          message: `Heading level skipped: H${prevLevel} jumps directly to H${level} ("${h[2]}"). Maintain sequential headings.`,
        });
      }
      prevLevel = level;
    }

    // 4. Bad link text
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    while ((match = linkRegex.exec(bodyMd)) !== null) {
      const linkText = match[1]?.trim().toLowerCase() ?? '';
      if (['click here', 'read more', 'here', 'link', 'this link'].includes(linkText)) {
        warnings.push({
          type: 'vague_link_text',
          message: `Vague link text found: "${match[1]}". Use descriptive link text indicating destination.`,
        });
      }
      if (!linkText) {
        warnings.push({
          type: 'empty_link',
          message: `Empty link found pointing to "${match[2]}". Links must have accessible names.`,
        });
      }
    }

    // 5. Statistics without source
    const paragraphs = bodyMd.split(/\n\s*\n/);
    for (const p of paragraphs) {
      if (/\d+%\s*/.test(p) || /\$\d[\d,]*/.test(p)) {
        if (!/\[.*?\]\(.*?\)/.test(p)) {
          warnings.push({
            type: 'unsourced_statistic',
            message: `Paragraph contains statistical figures without a citation link: "${p.slice(0, 80)}…". Add a source link nearby.`,
          });
        }
      }
    }

    // 6. Past event as future
    if (/(before|by|until)\s+june\s+2025/i.test(fullText) || /(before|by)\s+2024/i.test(fullText)) {
      warnings.push({
        type: 'past_event_claim',
        message: 'Content references a past date (e.g. 2024 or June 2025) as if it is in the future. Update phrasing.',
      });
    }

    res.json({ data: { warnings } });
  });

  router.get('/content/coverage', requireStaffPermission('write_content'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.getGuideCoverage() });
  });

  /* ---------- Content Pages (S-98) ---------- */

  router.get('/content/pages', requireStaffPermission('write_content'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.listPages() });
  });

  router.get('/content/pages/:pageKey', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const pageKey = param(req, 'pageKey');
    const page = await repos.staff.getPage(pageKey);
    if (!page) {
      res.json({ data: null });
      return;
    }
    const published = await repos.staff.getPublishedPage(pageKey);
    res.json({
      data: {
        ...page,
        hasUnpublishedChanges: !published || JSON.stringify(published.data) !== JSON.stringify(page.data),
      },
    });
  });

  router.get('/content/pages/:pageKey/versions', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    res.json({ data: await repos.staff.listPageVersions(param(req, 'pageKey')) });
  });

  /** Legal pages are owner-only; everything else needs write/publish content permission. */
  function assertPageAccess(req: Request, pageKey: string, action: 'edit' | 'publish') {
    if (pageKey.startsWith('legal.') && req.staff?.role !== 'owner') {
      throw new AppError(403, ErrorCode.FORBIDDEN, `Only the owner can ${action} legal pages.`);
    }
    if (!['owner', 'admin', 'editor'].includes(req.staff?.role ?? '')) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Content permission required.');
    }
  }

  router.put('/content/pages/:pageKey', async (req: Request, res: Response) => {
    const pageKey = param(req, 'pageKey');
    assertPageAccess(req, pageKey, 'edit');
    const validated = validatePageContent(pageKey, (req.body as { data?: unknown } | undefined)?.data);
    if (!validated.success) {
      throw AppError.validation(`Invalid content for ${pageKey}: ${validated.error.issues[0]?.message ?? 'check the fields'}`);
    }
    // Saves the draft only; the live version is unchanged until the next publish.
    const saved = await repos.staff.savePageDraft(pageKey, validated.data as Record<string, unknown>, req.staff!.userId);
    await audit(req, null, 'content.page_saved', { pageKey });
    res.json({ data: saved });
  });

  const LEGAL_NOTICE_PAGES = new Set(['legal.terms', 'legal.privacy', 'legal.refunds']);
  const publishPageSchema = z.object({
    effectiveDate: z.coerce.date().optional(),
    changeSummary: z.string().trim().max(1000).optional(),
    customerNotice: z
      .object({ notifyAllCustomers: z.boolean(), summary: z.string().trim().max(1000).optional() })
      .optional(),
  });

  router.post('/content/pages/:pageKey/publish', async (req: Request, res: Response) => {
    const pageKey = param(req, 'pageKey');
    assertPageAccess(req, pageKey, 'publish');
    const body = publishPageSchema.parse(req.body ?? {});
    const notice = body.customerNotice?.notifyAllCustomers ? body.customerNotice : null;
    if (notice) {
      if (!LEGAL_NOTICE_PAGES.has(pageKey)) {
        throw AppError.validation('Customer notices can only be sent for Terms, Privacy and Refunds.');
      }
      if (!notice.summary) throw AppError.validation('Write a short summary of what changed for the customer notice.');
      if (!options.boss) {
        throw new AppError(503, ErrorCode.INTERNAL_ERROR, 'The background worker is not available, so the notice cannot be sent.');
      }
    }

    const page = await repos.staff.getPage(pageKey);
    if (!page) throw AppError.notFound('Page section not found.');
    const published = await repos.staff.publishPage(pageKey, req.staff!.userId, {
      effectiveDate: body.effectiveDate,
      changeSummary: body.changeSummary ?? notice?.summary,
    });
    if (!published) throw AppError.notFound('Page section not found.');
    await audit(req, null, 'content.page_published', { pageKey, version: published.publishedVersion });

    let noticeId: string | null = null;
    if (notice && options.boss) {
      const siteUrl = process.env.SITE_URL || process.env.APP_URL || 'http://localhost:3000';
      const created = await repos.staff.createLegalNotice({
        pageKey,
        version: published.publishedVersion,
        summary: notice.summary!,
        linkUrl: `${siteUrl}/legal/${pageKey.slice('legal.'.length)}`,
        createdBy: req.staff!.userId,
      });
      if (created) {
        noticeId = created.id;
        await enqueueLegalNotice(options.boss, created.id);
        await audit(req, null, 'legal.notice_queued', { pageKey, version: published.publishedVersion, noticeId });
      }
    }
    triggerSiteRebuild('publish', req.staff!.userId);
    res.json({ data: { ...published, noticeId } });
  });

  /* ---------- Changelog (S-97) ---------- */

  const changelogSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.'),
    title: z.string().trim().min(1).max(150),
    type: z.enum(CHANGELOG_TYPES).default('new'),
    bodyMd: z.string().default(''),
    showInApp: z.boolean().default(false),
    status: z.enum(['draft', 'published']).default('draft'),
  });

  router.get('/content/changelog', requireStaffPermission('write_content'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.listChangelog(false) });
  });

  router.post('/content/changelog', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const body = changelogSchema.parse(req.body);
    const created = await repos.staff.createChangelog(body);
    await audit(req, null, 'content.changelog_created', { id: created?.id, title: body.title });
    res.status(201).json({ data: created });
  });

  router.patch('/content/changelog/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const body = changelogSchema.partial().parse(req.body);
    const updated = await repos.staff.updateChangelog(id, body);
    if (!updated) throw AppError.notFound('Changelog entry not found.');
    await audit(req, null, 'content.changelog_updated', { id });
    res.json({ data: updated });
  });

  router.delete('/content/changelog/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const ok = await repos.staff.deleteChangelog(id);
    if (!ok) throw AppError.notFound('Changelog entry not found.');
    await audit(req, null, 'content.changelog_deleted', { id });
    res.json({ data: { deleted: true } });
  });

  /* ---------- Media Library (S-99) ---------- */

  /** Adds the public `url` the screens use (the original file's URL). */
  const withUrl = <T extends { variants?: unknown } | null>(row: T) =>
    row ? { ...row, url: (row.variants as { url?: string } | null)?.url ?? null } : row;

  const mediaMetaSchema = z.object({
    altText: z.string().trim().max(500).optional(),
    isDecorative: z.boolean().default(false),
    caption: z.string().trim().max(500).optional(),
    credit: z.string().trim().max(200).optional(),
  });

  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MEDIA_LIMITS.video, files: 1, fields: 10 },
  }).single('file');

  router.get('/media', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const q = queryString(req, 'q');
    const mime = queryString(req, 'mime');
    const limit = Number(req.query.limit) || 50;
    const cursor = Number(req.query.cursor) || 0;
    const result = await repos.staff.listMedia({ q, mime, limit, offset: cursor });
    res.json({ data: result.items.map(withUrl), nextCursor: result.nextOffset !== null ? String(result.nextOffset) : null });
  });

  router.get('/media/:id/usage', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    res.json({ data: await repos.staff.checkMediaUsage(id) });
  });

  router.post(
    '/media',
    requireStaffPermission('write_content'),
    (req: Request, res: Response, next: NextFunction) => {
      mediaUpload(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          next(
            err.code === 'LIMIT_FILE_SIZE'
              ? new AppError(413, ErrorCode.VALIDATION_ERROR, 'That file is too large (50 MB at most).')
              : AppError.validation('The upload could not be read.'),
          );
          return;
        }
        next(err);
      });
    },
    async (req: Request, res: Response) => {
      const storage = options.storage;
      if (!storage?.publicFiles || !storage.putPublicFile) {
        throw new AppError(
          503,
          ErrorCode.INTERNAL_ERROR,
          'The media library needs public file storage (set R2_PUBLIC_URL for R2, or use Cloudinary).',
        );
      }
      const file = req.file;
      if (!file) throw AppError.validation('Choose a file to upload.');

      const fields = (req.body ?? {}) as Record<string, unknown>;
      const text = (k: string) => (typeof fields[k] === 'string' && fields[k] !== '' ? (fields[k]) : undefined);
      const meta = mediaMetaSchema.parse({
        altText: text('altText'),
        isDecorative: fields.isDecorative === 'true' || fields.isDecorative === true,
        caption: text('caption'),
        credit: text('credit'),
      });

      const mime = detectMime(file.buffer);
      if (!mime) {
        throw AppError.validation('Unsupported file. Use PNG, JPG, WebP, GIF, SVG, MP4 or PDF.');
      }
      if (file.size > sizeLimitFor(mime)) {
        throw new AppError(413, ErrorCode.VALIDATION_ERROR, `That file is too large for its type (${Math.round(sizeLimitFor(mime) / 1048576)} MB at most).`);
      }
      if (isImage(mime) && !meta.isDecorative && !meta.altText) {
        throw AppError.validation('Alt text is required for images unless you mark the image as decorative.');
      }

      const baseKey = `media/${randomUUID()}`;
      const items: { width: number; height: number; format: string; url: string; key: string }[] = [];
      let width: number | null = null;
      let height: number | null = null;
      const written: { key: string; mime: string }[] = [];
      try {
        let body = file.buffer;
        if (mime === 'image/svg+xml') {
          body = Buffer.from(assertSafeSvg(file.buffer), 'utf8');
        } else if (isRasterImage(mime)) {
          const processed = await processRasterImage(file.buffer, mime);
          width = processed.width;
          height = processed.height;
          for (const v of processed.variants) {
            const key = `${baseKey}/${v.width}.${v.format}`;
            const vmime = `image/${v.format}`;
            const url = await storage.putPublicFile(key, v.data, vmime);
            written.push({ key, mime: vmime });
            items.push({ width: v.width, height: v.height, format: v.format, url, key });
          }
        }
        const originalKey = `${baseKey}/original.${extensionFor(mime)}`;
        const url = await storage.putPublicFile(originalKey, body, mime);
        written.push({ key: originalKey, mime });

        const created = await repos.staff.createMedia({
          key: originalKey,
          filename: file.originalname.slice(0, 200),
          mime,
          size: file.size,
          width,
          height,
          variants: { url, items },
          altText: meta.altText ?? null,
          isDecorative: meta.isDecorative,
          caption: meta.caption ?? null,
          credit: meta.credit ?? null,
          uploadedBy: req.staff!.userId,
        });
        await audit(req, null, 'media.uploaded', { id: created?.id, mime, size: file.size });
        res.status(201).json({ data: withUrl(created) });
      } catch (err) {
        // Do not leave orphaned files behind when processing or saving fails.
        await Promise.all(
          written.map(async (w) => {
            try {
              await storage.deletePublicFile?.(w.key, w.mime);
            } catch {
              // Best effort: the original error is the one worth reporting.
            }
          }),
        );
        throw err;
      }
    },
  );

  router.patch('/media/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const body = mediaMetaSchema.partial().parse(req.body);
    const updated = await repos.staff.updateMedia(id, body);
    if (!updated) throw AppError.notFound('Media asset not found.');
    await audit(req, null, 'media.updated', { id });
    res.json({ data: withUrl(updated) });
  });

  router.delete('/media/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const asset = await repos.staff.findMediaById(id);
    if (!asset) throw AppError.notFound('Media asset not found.');
    const ok = await repos.staff.deleteMedia(id); // refuses (409) while the file is in use
    if (!ok) throw AppError.notFound('Media asset not found.');
    const variants = (asset.variants ?? {}) as { items?: { key: string; format: string }[] };
    const files = [
      { key: asset.key, mime: asset.mime },
      ...(variants.items ?? []).map((v) => ({ key: v.key, mime: `image/${v.format}` })),
    ];
    for (const f of files) {
      try {
        await options.storage?.deletePublicFile?.(f.key, f.mime);
      } catch (err) {
        console.error('[media] could not delete a stored file:', err);
      }
    }
    await audit(req, null, 'media.deleted', { id });
    res.json({ data: { deleted: true } });
  });

  /* ---------- Banners (S-100) ---------- */

  const bannerSchema = z.object({
    surface: z.enum(BANNER_SURFACES).default('both'),
    message: z.string().trim().min(1).max(140),
    linkUrl: z.string().url().nullable().optional(),
    style: z.enum(BANNER_STYLES).default('info'),
    audience: z.record(z.string(), z.any()).default({}),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    dismissible: z.boolean().default(true),
    active: z.boolean().default(true),
  });

  router.get('/banners', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const surface = req.query.surface as BannerSurface | undefined;
    res.json({ data: await repos.staff.listBanners(surface) });
  });

  router.post('/banners', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const body = bannerSchema.parse(req.body);
    const created = await repos.staff.createBanner(body);
    await audit(req, null, 'banners.created', { id: created?.id, message: body.message });
    res.status(201).json({ data: created });
  });

  router.patch('/banners/:id', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const body = bannerSchema.partial().parse(req.body);
    const updated = await repos.staff.updateBanner(id, body);
    if (!updated) throw AppError.notFound('Banner not found.');
    await audit(req, null, 'banners.updated', { id });
    res.json({ data: updated });
  });

  router.delete('/banners/:id', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const ok = await repos.staff.deleteBanner(id);
    if (!ok) throw AppError.notFound('Banner not found.');
    await audit(req, null, 'banners.deleted', { id });
    res.json({ data: { deleted: true } });
  });

  /* ---------- Site Settings & Deploys (P8-07, P8-21) ---------- */

  router.get('/site/settings', requireStaffPermission('manage_system'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.getSiteSettings() });
  });

  router.patch('/site/settings', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const schema = z.object({
      supportEmail: z.string().email().optional(),
      bannedWords: z.array(z.string().trim()).optional(),
      maintenanceMode: z.boolean().optional(),
      deployHookConfigured: z.boolean().optional(),
    });
    const body = schema.parse(req.body);
    const updated = await repos.staff.updateSiteSettings(body);
    await audit(req, null, 'site.settings_updated', body);
    res.json({ data: updated });
  });

  router.get('/site/deploys', requireStaffPermission('publish_content'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.listSiteDeploys(20) });
  });

  function triggerSiteRebuild(trigger: 'publish' | 'manual' | 'schedule', requestedBy: string | null) {
    void requestSiteRebuild(repos.staff, trigger, requestedBy, options.boss).catch((err) =>
      console.error('[staff] could not queue a site rebuild:', err),
    );
  }

  router.post('/site/deploys', requireStaffPermission('publish_content'), async (req: Request, res: Response) => {
    triggerSiteRebuild('manual', req.staff!.userId);
    await audit(req, null, 'site.rebuild_triggered');
    res.status(202).json({ data: { queued: true } });
  });

  /* ---------- Customer Management Additions (P8-19, P8-20) ---------- */

  router.get('/orgs/:orgId/notes', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    res.json({ data: await repos.staff.listOrgNotes(orgId) });
  });

  router.post('/orgs/:orgId/notes', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const { bodyMd } = z.object({ bodyMd: z.string().trim().min(1).max(2000) }).parse(req.body);
    const staffMemberId = req.staff!.staffMemberId;
    if (!staffMemberId) throw AppError.validation('Staff member account required to post notes.');
    const note = await repos.staff.addOrgNote(orgId, staffMemberId, bodyMd);
    await audit(req, orgId, 'customer.note_added', { noteId: note?.id });
    res.status(201).json({ data: note });
  });

  router.delete('/orgs/:orgId/notes/:noteId', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const noteId = uuidParam.parse(param(req, 'noteId'));
    const ok = await repos.staff.deleteOrgNote(orgId, noteId);
    if (!ok) throw AppError.notFound('Note not found.');
    await audit(req, orgId, 'customer.note_deleted', { noteId });
    res.json({ data: { deleted: true } });
  });

  router.get('/orgs/:orgId/tags', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    res.json({ data: await repos.staff.listOrgTags(orgId) });
  });

  router.post('/orgs/:orgId/tags', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const { tag } = z.object({ tag: z.string().trim().min(1).max(50) }).parse(req.body);
    await repos.staff.addOrgTag(orgId, tag);
    await audit(req, orgId, 'customer.tag_added', { tag });
    res.json({ data: { added: true, tag } });
  });

  router.delete('/orgs/:orgId/tags/:tag', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const tag = param(req, 'tag');
    await repos.staff.removeOrgTag(orgId, tag);
    await audit(req, orgId, 'customer.tag_removed', { tag });
    res.json({ data: { removed: true, tag } });
  });

  router.get('/orgs/:orgId/timeline', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    res.json({ data: await repos.staff.getOrgTimeline(orgId) });
  });

  router.post('/orgs/:orgId/email', requireStaffPermission('email_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const schema = z.object({
      toEmail: z.string().email(),
      template: z.enum(['welcome_check_in', 'trial_help', 'inactive_check_in', 'payment_issue', 'custom']),
      subject: z.string().trim().min(1).max(200),
      bodyMd: z.string().trim().min(1),
    });
    const body = schema.parse(req.body);
    const staffMemberId = req.staff!.staffMemberId;
    if (!staffMemberId) throw AppError.validation('Staff member account required to send email.');

    // Only people who belong to this organisation can be emailed from its page.
    const members = await repos.memberships.list(orgId);
    const recipients = await Promise.all(members.map((m) => repos.users.findById(m.userId)));
    const allowed = recipients.some((u) => u?.email?.toLowerCase() === body.toEmail.toLowerCase());
    if (!allowed) {
      throw AppError.validation('That address does not belong to a member of this organisation.');
    }

    if (options.emailSender) {
      await options.emailSender.sendRaw({
        to: body.toEmail,
        subject: body.subject,
        html: `<p>${escapeHtml(body.bodyMd).replace(/\n/g, '<br/>')}</p>`,
        text: body.bodyMd,
      });
    }

    const emailRecord = await repos.staff.logStaffEmail({
      orgId,
      toEmail: body.toEmail,
      template: body.template,
      subject: body.subject,
      bodyMd: body.bodyMd,
      sentBy: staffMemberId,
    });

    await audit(req, orgId, 'customer.email_sent', {
      toEmail: body.toEmail,
      template: body.template,
      subject: body.subject,
    });

    res.status(201).json({ data: emailRecord });
  });

  router.get('/segments', requireStaffPermission('manage_customers'), async (_req: Request, res: Response) => {
    res.json({ data: await repos.staff.listSegments() });
  });

  router.post('/segments', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(100),
      filters: z.record(z.string(), z.any()),
    });
    const body = schema.parse(req.body);
    const created = await repos.staff.saveSegment(body.name, body.filters, req.staff!.userId);
    await audit(req, null, 'customer.segment_created', { name: body.name });
    res.status(201).json({ data: created });
  });

  router.delete('/segments/:id', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const id = uuidParam.parse(param(req, 'id'));
    const ok = await repos.staff.deleteSegment(id);
    if (!ok) throw AppError.notFound('Segment not found.');
    await audit(req, null, 'customer.segment_deleted', { id });
    res.json({ data: { deleted: true } });
  });

  router.get('/segments/:id/export.csv', requireStaffPermission('manage_customers'), async (_req: Request, res: Response) => {
    const leads = await repos.staff.listConsentedLeads();
    const csv = toCsv(
      ['Email', 'Source', 'Domain', 'Converted', 'First seen'],
      leads.map((l) => [l.email, l.source, l.domain, l.converted ? 'yes' : 'no', l.createdAt]),
    );
    sendCsv(res, `segment-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });

  /* ---------- P6-02: organisations ---------- */

  router.get('/orgs', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const f = orgListSchema.parse(req.query);
    const { items, nextOffset } = await repos.staff.listOrgs({
      q: f.q,
      plan: f.plan,
      billingStatus: f.status,
      healthBand: f.healthBand,
      platform: f.platform,
      framework: f.framework,
      includeDeleted: f.includeDeleted,
      limit: f.limit,
      offset: f.cursor,
    });
    res.json({ data: items, nextCursor: nextOffset === null ? null : String(nextOffset) });
  });

  router.get('/orgs/:orgId', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const detail = await repos.staff.getOrgDetail(orgIdParam(req));
    if (!detail) throw AppError.notFound('Organisation not found.');
    res.json({ data: detail });
  });

  /* ---------- Customer success: inactive paying customers ---------- */

  router.get('/inactive-customers', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(INACTIVE_AFTER_DAYS)
      .parse(req.query.days);
    res.json({ data: await repos.staff.listInactivePaying(days) });
  });

  router.get('/activation', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const days = z.coerce.number().int().min(1).max(365).default(90).parse(req.query.days);
    res.json({ data: await repos.staff.listActivation(days) });
  });

  router.post('/orgs/:orgId/check-in', requireStaffPermission('manage_customers'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const row = (await repos.staff.listInactivePaying(0, 1, orgId))[0];
    if (!row) throw AppError.notFound('No paying owner found for this organisation.');
    if (!options.boss && !options.emailSender) {
      throw new AppError(503, ErrorCode.INTERNAL_ERROR, 'Email is not configured.');
    }
    await sendCheckIn(
      repos,
      { boss: options.boss, emailSender: options.emailSender },
      { ...row, trigger: 'staff', staffUserId: req.staff!.userId, ip: req.ip ?? null },
    );
    res.json({ data: { sent: true, to: row.ownerEmail } });
  });

  router.post('/orgs/:orgId/extend-trial', requireStaffPermission('manage_trials_plans'), async (req: Request, res: Response) => {
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

  router.put('/orgs/:orgId/plan-override', requireStaffPermission('manage_trials_plans'), async (req: Request, res: Response) => {
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

  router.delete('/orgs/:orgId/plan-override', requireStaffPermission('manage_trials_plans'), async (req: Request, res: Response) => {
    const orgId = orgIdParam(req);
    const updated = await repos.staff.setPlanOverride(orgId, null);
    if (!updated) throw AppError.notFound('Organisation not found.');
    await audit(req, orgId, 'staff.plan_override_cleared');
    res.json({ data: { org: updated } });
  });

  router.post('/orgs/:orgId/impersonate', requireStaffPermission('impersonate'), async (req: Request, res: Response) => {
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

  router.post('/impersonation/stop', requireStaffPermission('impersonate'), async (req: Request, res: Response) => {
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

  router.get('/queues', requireStaffPermission('manage_system'), async (_req: Request, res: Response) => {
    res.json({ data: { queues: await queueAdmin().listQueues() } });
  });

  router.get('/queues/:queue/jobs', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const name = queueParam(req);
    const state = req.query.state === 'active' ? 'active' : 'failed';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    res.json({ data: { jobs: await queueAdmin().listJobs(name, state, limit) } });
  });

  router.post('/queues/:queue/jobs/:jobId/retry', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const name = queueParam(req);
    const jobId = uuidParam.parse(param(req, 'jobId'));
    await queueAdmin().retryJob(name, jobId);
    await audit(req, null, 'staff.job_retried', { queue: name, jobId });
    res.json({ data: { retried: true } });
  });

  router.delete('/queues/:queue/jobs/:jobId', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const name = queueParam(req);
    const jobId = uuidParam.parse(param(req, 'jobId'));
    await queueAdmin().deleteJob(name, jobId);
    await audit(req, null, 'staff.job_deleted', { queue: name, jobId });
    res.json({ data: { deleted: true } });
  });

  router.get('/system', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [metrics, system] = await Promise.all([
      repos.staff.getMetrics(since),
      getSystemSnapshot(process.env.DATA_DIR ?? process.cwd()),
    ]);
    res.json({ data: { days, metrics, system } });
  });

  /* ---------- P6-04: leads ---------- */

  router.get('/leads/free-checks', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const f = leadsSchema.parse(req.query);
    const { items, nextOffset } = await repos.staff.listFreeCheckLeads({
      q: f.q,
      consentOnly: f.consent,
      limit: f.limit,
      offset: f.cursor,
    });
    res.json({ data: items, nextCursor: nextOffset === null ? null : String(nextOffset) });
  });

  router.get('/leads/waitlist', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const f = leadsSchema.parse(req.query);
    const { items, nextOffset } = await repos.staff.listWaitlist({
      q: f.q,
      consentOnly: f.consent,
      limit: f.limit,
      offset: f.cursor,
    });
    res.json({ data: items, nextCursor: nextOffset === null ? null : String(nextOffset) });
  });

  router.get('/leads/export.csv', requireStaffPermission('view_dashboards'), async (req: Request, res: Response) => {
    const leads = await repos.staff.listConsentedLeads();
    await audit(req, null, 'staff.leads_exported', { count: leads.length });
    const csv = toCsv(
      ['Email', 'Source', 'Domain', 'Converted', 'First seen'],
      leads.map((l) => [l.email, l.source, l.domain, l.converted ? 'yes' : 'no', l.createdAt]),
    );
    sendCsv(res, `consented-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });

  /* ---------- P6-05: content review and feature flags ---------- */

  router.get('/ai-suggestions/flagged', requireStaffPermission('write_content'), async (_req: Request, res: Response) => {
    res.json({ data: { items: await repos.staff.listFlaggedSuggestions() } });
  });

  const suggestionParam = async (req: Request) => {
    const id = uuidParam.safeParse(param(req, 'id'));
    const suggestion = id.success ? await repos.staff.findSuggestion(id.data) : null;
    if (!suggestion) throw AppError.notFound('Suggestion not found.');
    return suggestion;
  };

  router.post('/ai-suggestions/:id/approve', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const suggestion = await suggestionParam(req);
    const updated = await repos.staff.approveSuggestion(suggestion.id);
    await audit(
      req,
      null,
      'staff.ai_suggestion_approved',
      { ruleId: suggestion.ruleId },
      { type: 'ai_suggestion', id: suggestion.id },
    );
    res.json({ data: { suggestion: updated } });
  });

  router.delete('/ai-suggestions/:id', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
    const suggestion = await suggestionParam(req);
    await repos.staff.deleteSuggestion(suggestion.id);
    await audit(
      req,
      null,
      'staff.ai_suggestion_deleted',
      { ruleId: suggestion.ruleId },
      { type: 'ai_suggestion', id: suggestion.id },
    );
    res.json({ data: { deleted: true } });
  });

  router.post('/ai-suggestions/:id/promote', requireStaffPermission('write_content'), async (req: Request, res: Response) => {
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
      { type: 'fix_guide', id: guide.id },
    );
    res.status(201).json({ data: { guide } });
  });

  router.get('/feature-flags', requireStaffPermission('manage_system'), async (_req: Request, res: Response) => {
    res.json({ data: { flags: await repos.featureFlags.list() } });
  });

  router.put('/feature-flags/:key', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
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

  router.delete('/feature-flags/:key', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const key = flagKey.parse(param(req, 'key'));
    if (!(await repos.featureFlags.delete(key))) throw AppError.notFound('Flag not found.');
    await audit(req, null, 'staff.feature_flag_deleted', { key });
    res.json({ data: { deleted: true } });
  });

  /* ---------- Global Audit Log (S-51 all orgs, staff filter) ---------- */

  router.get('/audit', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const action = queryString(req, 'action');
    const actorType = queryString(req, 'actorType');
    const staffOnly = req.query.staffOnly === 'true';
    const q = queryString(req, 'q');
    const limit = Number(req.query.limit) || 50;
    const cursor = Number(req.query.cursor) || 0;

    const result = await repos.staff.listGlobalAuditLog({
      action,
      actorType,
      staffOnly,
      q,
      limit,
      offset: cursor,
    });
    res.json({ data: result.items, nextCursor: result.nextCursor });
  });

  router.get('/audit/export.csv', requireStaffPermission('manage_system'), async (req: Request, res: Response) => {
    const action = queryString(req, 'action');
    const actorType = queryString(req, 'actorType');
    const staffOnly = req.query.staffOnly === 'true';
    const q = queryString(req, 'q');

    const result = await repos.staff.listGlobalAuditLog({
      action,
      actorType,
      staffOnly,
      q,
      limit: 5000,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="staff-audit-export.csv"');

    const csvHeader = 'Timestamp,ActorType,Actor,Action,OrgID,TargetType,TargetID,IP,UserAgent\n';
    const csvRows = result.items
      .map((entry) => {
        const actor = `"${(entry.actorEmail || entry.actorName || entry.actorId || '').replace(/"/g, '""')}"`;
        const act = `"${(entry.action || '').replace(/"/g, '""')}"`;
        const org = entry.orgId || '';
        const tt = entry.targetType || '';
        const ti = entry.targetId || '';
        const ip = entry.ip || '';
        const ua = `"${(entry.userAgent || '').replace(/"/g, '""')}"`;
        const time = new Date(entry.createdAt).toISOString();
        return `${time},${entry.actorType},${actor},${act},${org},${tt},${ti},${ip},${ua}`;
      })
      .join('\n');

    res.send(csvHeader + csvRows);
  });

  return router;
}
