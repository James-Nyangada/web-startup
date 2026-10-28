import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import type { Auth } from '../lib/auth.js';
import { validatePassword } from '../lib/passwords.js';
import { requireAuth } from '../middleware/auth.js';
import { ErrorCode } from '../shared/errors.js';
import { copyResponseHeaders } from './auth.js';
import type { PgBoss } from 'pg-boss';
import { AppError } from '../lib/app-error.js';
import { isStaffVerified } from '../db/repositories/staff.js';
import type { StorageService } from '../storage/index.js';
import type { EmailSender } from '../emails/sender.js';
import { enqueueDataExport } from '../worker/boss.js';
import { sniffImageType } from '../lib/image-check.js';

export interface MeRouterOptions {
  boss?: PgBoss;
  /** Sends E-23 after a password change (spec 10, ASVS 2.2.3). */
  emailSender?: EmailSender;
  storage?: StorageService;
  /** Test hook: runs instead of enqueueing privacy.export. */
  enqueueExport?: (exportId: string) => Promise<void>;
}

/** One export a day is plenty; it stops the endpoint being used to load the worker. */
const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const patchMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  // Scheduling hands this straight to Intl, so it must be a zone the runtime knows.
  timeZone: z
    .string()
    .min(1)
    .max(50)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone.')
    .optional(),
  avatarUrl: z.string().url().nullable().optional(),
  lastActiveOrgId: z.string().uuid().nullable().optional(),
});

const avatarSchema = z.object({ dataUrl: z.string().min(1) });

/** The browser resizes to 256 × 256 first, so a real avatar is far below this. */
const AVATAR_MAX_BYTES = 512 * 1024;

const avatarKey = (userId: string) => `avatars/${userId}`;

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});

export function meRouter(auth: Auth, repos: Repositories, options: MeRouterOptions = {}): Router {
  const router = Router();
  router.use(requireAuth(auth, { allowMfaPending: true }));
  // Only the profile read is open to a session that still owes its second factor.
  router.use((req, res, next) => {
    if (req.auth!.session.mfaPending && !(req.method === 'GET' && req.path === '/')) {
      res.status(403).json({
        error: {
          code: ErrorCode.MFA_REQUIRED,
          message: 'Two-step verification is required to continue.',
          details: {},
        },
      });
      return;
    }
    next();
  });

  // GET /v1/me
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const user = await repos.users.findById(userId);

    if (!user) {
      res.status(404).json({
        error: {
          code: ErrorCode.USER_NOT_FOUND,
          message: 'User profile not found.',
          details: {},
        },
      });
      return;
    }

    const memberships = await repos.users.listMemberships(userId);
    const clientAccess = await repos.users.listClientAccess(userId);

    // Resolve active organisation
    let activeOrg = null;
    if (user.lastActiveOrgId) {
      const found = memberships.find((m) => m.orgId === user.lastActiveOrgId);
      if (found) {
        activeOrg = found.org;
      }
    }
    if (!activeOrg && memberships.length > 0) {
      activeOrg = memberships[0]?.org ?? null;
    }

    // Staff: which org (if any) this session is viewing read-only, for the S-80 banner.
    let impersonation: { org: { id: string; slug: string | null; name: string } } | null = null;
    if (user.isStaff && repos.staff) {
      const state = await repos.staff.getSessionState(req.auth!.session.id);
      if (state?.impersonatingOrgId && isStaffVerified(state)) {
        const org = await repos.organizations.findById(state.impersonatingOrgId);
        if (org) impersonation = { org: { id: org.id, slug: org.slug, name: org.name } };
      }
    }

    res.status(200).json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerifiedAt: user.emailVerifiedAt,
          avatarUrl: user.avatarUrl,
          timeZone: user.timeZone,
          isStaff: user.isStaff,
          lastActiveOrgId: user.lastActiveOrgId,
          createdAt: user.createdAt,
        },
        memberships,
        clientAccess,
        activeOrg,
        impersonation,
        mfaPending: Boolean(req.auth!.session.mfaPending),
      },
    });
  });

  // PATCH /v1/me
  router.patch('/', async (req: Request, res: Response): Promise<void> => {
    const parse = patchMeSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid profile update parameters.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const updated = await repos.users.update(req.auth!.user.id, parse.data);
    res.status(200).json({ data: { user: updated } });
  });

  // POST /v1/me/avatar - Upload a profile picture; it is served from the storage CDN.
  router.post('/avatar', async (req: Request, res: Response): Promise<void> => {
    const storage = options.storage;
    if (!storage?.putPublicImage) {
      res.status(503).json({
        error: {
          code: 'STORAGE_UNAVAILABLE',
          message: 'Avatar uploads are not available on this server.',
        },
      });
      return;
    }

    const parse = avatarSchema.safeParse(req.body);
    const base64 = parse.success
      ? /^data:image\/[a-z+]+;base64,(.+)$/.exec(parse.data.dataUrl)?.[1]
      : undefined;
    if (!base64) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Expected a base64 image data URL.',
        },
      });
      return;
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > AVATAR_MAX_BYTES) {
      res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: 'Avatars can be at most 512 KB.' },
      });
      return;
    }
    // SVG is refused: the type comes from the bytes, and only raster images are accepted.
    const contentType = sniffImageType(buffer);
    if (!contentType || contentType === 'image/svg+xml') {
      res.status(400).json({
        error: { code: 'INVALID_TYPE', message: 'Avatars must be PNG, JPEG or WebP images.' },
      });
      return;
    }

    const userId = req.auth!.user.id;
    const avatarUrl = await storage.putPublicImage(avatarKey(userId), buffer);
    const updated = await repos.users.update(userId, { avatarUrl });
    res.status(200).json({ data: { user: updated } });
  });

  // DELETE /v1/me/avatar - Remove the profile picture and fall back to initials.
  router.delete('/avatar', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    await options.storage?.deletePublicImage?.(avatarKey(userId)).catch(() => undefined);
    const updated = await repos.users.update(userId, { avatarUrl: null });
    res.status(200).json({ data: { user: updated } });
  });

  // POST /v1/me/change-password
  router.post('/change-password', async (req: Request, res: Response): Promise<void> => {
    const parse = changePasswordSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Current password and new password are required.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { currentPassword, newPassword } = parse.data;
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({
        error: {
          code: ErrorCode.PASSWORD_TOO_WEAK,
          message: pwCheck.reason ?? 'New password is too weak.',
          details: {},
        },
      });
      return;
    }

    try {
      const webRes = await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: false },
        headers: req.headers,
        asResponse: true,
      });

      if (!webRes.ok) {
        res.status(400).json({
          error: {
            code: ErrorCode.INVALID_CREDENTIALS,
            message: 'Current password is incorrect.',
            details: {},
          },
        });
        return;
      }

      copyResponseHeaders(webRes, res);
      // E-23: tell the account owner, in case it was not them. Never block the response on it.
      if (options.emailSender) {
        const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
        void options.emailSender
          .send({
            to: req.auth!.user.email,
            templateId: 'E-23',
            data: {
              kind: 'password_changed',
              name: req.auth!.user.name,
              when: new Date(),
              ip: req.ip ?? null,
              userAgent: req.get('user-agent') ?? null,
              accountUrl: `${appUrl}/settings/account`,
            },
          })
          .catch(() => undefined);
      }
      res.status(200).json({
        data: { success: true, message: 'Password changed successfully.' },
      });
    } catch {
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_CREDENTIALS,
          message: 'Current password is incorrect.',
          details: {},
        },
      });
    }
  });

  // GET /v1/me/sessions - Session tokens are bearer credentials, so only safe fields leave the server.
  router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
    const sessions = await auth.api.listSessions({ headers: req.headers });
    const currentId = req.auth!.session.id;
    res.status(200).json({
      data: {
        sessions: sessions
          .map((s) => ({
            id: s.id,
            ipAddress: s.ipAddress ?? null,
            userAgent: s.userAgent ?? null,
            createdAt: s.createdAt,
            lastActiveAt: s.updatedAt,
            expiresAt: s.expiresAt,
            isCurrent: s.id === currentId,
          }))
          .sort(
            (a, b) =>
              Number(b.isCurrent) - Number(a.isCurrent) ||
              new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
          ),
      },
    });
  });

  // DELETE /v1/me/sessions/:id - Takes the session id; the token is looked up here, never sent to the browser.
  router.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
    if (req.params.id === req.auth!.session.id) {
      throw AppError.validation('Use sign out to end the session you are using.');
    }
    const sessions = await auth.api.listSessions({ headers: req.headers });
    const target = sessions.find((s) => s.id === req.params.id);
    if (!target) throw AppError.notFound('Session not found.');
    await auth.api.revokeSession({ body: { token: target.token }, headers: req.headers });
    res.status(200).json({ data: { success: true } });
  });

  // POST /v1/me/export - Request a personal data export (GDPR, P6-09) → E-22 when ready
  router.post('/export', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const [latest] = await repos.privacy.listExports(userId, 1);
    if (
      latest &&
      (latest.status === 'queued' || Date.now() - latest.createdAt.getTime() < EXPORT_COOLDOWN_MS)
    ) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        latest.status === 'queued'
          ? 'Your export is already being prepared. We will email you when it is ready.'
          : 'You can request one export a day. Use the download link from your last export.',
        { exportId: latest.id, status: latest.status },
      );
    }

    const row = await repos.privacy.createExport(userId);
    if (options.enqueueExport) await options.enqueueExport(row.id);
    else if (options.boss) await enqueueDataExport(options.boss, row.id);

    await repos.auditLog.write(null, {
      actorId: userId,
      actorType: 'user',
      action: 'privacy.export_requested',
      targetType: 'data_export',
      targetId: row.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(202).json({
      data: {
        export: { id: row.id, status: row.status, createdAt: row.createdAt },
        message:
          'We are preparing your data. You will get an email with a download link, usually within a few minutes.',
      },
    });
  });

  // GET /v1/me/exports - Recent export requests and their status
  router.get('/exports', async (req: Request, res: Response): Promise<void> => {
    const rows = await repos.privacy.listExports(req.auth!.user.id, 5);
    res.json({
      data: {
        exports: rows.map((r) => ({
          id: r.id,
          status: r.status,
          fileSize: r.fileSize,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          downloadable:
            r.status === 'ready' &&
            Boolean(r.fileKey) &&
            (!r.expiresAt || r.expiresAt > new Date()),
        })),
      },
    });
  });

  // GET /v1/me/exports/:id/download - The zip; only for the signed-in owner of the export
  router.get('/exports/:id/download', async (req: Request, res: Response): Promise<void> => {
    const id = z.uuid().safeParse(req.params.id);
    const row = id.success ? await repos.privacy.findExport(req.auth!.user.id, id.data) : null;
    if (!row || row.status !== 'ready' || !row.fileKey)
      throw AppError.notFound('Export not found.');
    if (row.expiresAt && row.expiresAt <= new Date()) {
      throw new AppError(
        410,
        ErrorCode.TOKEN_EXPIRED,
        'This export has expired. Request a new one.',
      );
    }
    const file = options.storage ? await options.storage.getObject(row.fileKey) : null;
    if (!file) throw AppError.notFound('Export not found.');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="everyvisitor-personal-data-${row.createdAt.toISOString().slice(0, 10)}.zip"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(file);
  });

  // DELETE /v1/me - Delete account (spec 7.1, P6-09)
  router.delete('/', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const check = await repos.privacy.checkAccountDeletion(userId);

    if (!check.allowed) {
      const paying = check.blockers.filter((b) => b.reason === 'active_subscription');
      res.status(422).json({
        error: {
          code: ErrorCode.ACCOUNT_DELETION_BLOCKED,
          message: paying.length
            ? `You own ${paying.map((b) => b.orgName).join(', ')}, which has an active subscription. Cancel it or transfer ownership first.`
            : `You own ${check.blockers.map((b) => b.orgName).join(', ')}, which has other members. Transfer ownership to one of them first.`,
          details: { blockers: check.blockers },
        },
      });
      return;
    }

    // Export files hold personal data: remove them with the account.
    const exports = await repos.privacy.listExports(userId, 100);
    for (const e of exports) {
      if (e.fileKey) await options.storage?.deleteObject(e.fileKey).catch(() => undefined);
    }
    await options.storage?.deletePublicImage?.(avatarKey(userId)).catch(() => undefined);

    await repos.auditLog.write(null, {
      actorId: userId,
      actorType: 'user',
      action: 'account.deleted',
      targetType: 'user',
      targetId: userId,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      data: { soloOrgsDeleted: check.soloOrgIds },
    });
    for (const orgId of check.soloOrgIds) {
      await repos.auditLog.write(asOrgId(orgId), {
        actorId: userId,
        actorType: 'user',
        action: 'org.deleted',
        targetType: 'organization',
        targetId: orgId,
        data: { reason: 'owner_account_deleted' },
      });
    }

    const webRes = await auth.api
      .signOut({ headers: req.headers, asResponse: true })
      .catch(() => null);
    await repos.privacy.deleteAccount(userId, check.soloOrgIds);
    if (webRes) copyResponseHeaders(webRes, res);

    res.status(200).json({
      data: { success: true, message: 'Your account has been deleted.' },
    });
  });

  return router;
}
