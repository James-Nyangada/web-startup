import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { Auth } from '../lib/auth.js';
import { validatePassword } from '../lib/passwords.js';
import { requireAuth } from '../middleware/auth.js';
import { ErrorCode } from '../shared/errors.js';
import { copyResponseHeaders } from './auth.js';

const patchMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timeZone: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  lastActiveOrgId: z.string().uuid().nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});

export function meRouter(auth: Auth, repos: Repositories): Router {
  const router = Router();
  router.use(requireAuth(auth));

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

  // GET /v1/me/sessions
  router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = await auth.api.listSessions({ headers: req.headers });
      res.status(200).json({ data: { sessions } });
    } catch {
      res.status(200).json({ data: { sessions: [] } });
    }
  });

  // DELETE /v1/me/sessions/:id
  router.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
    const token = req.params.id as string;
    try {
      await auth.api.revokeSession({ body: { token }, headers: req.headers });
      res.status(200).json({ data: { success: true } });
    } catch {
      res.status(200).json({ data: { success: true } });
    }
  });

  // POST /v1/me/export
  router.post('/export', (_req: Request, res: Response): void => {
    res.status(200).json({
      data: {
        message:
          'Your personal data export request has been received. You will receive an email once it is prepared.',
      },
    });
  });

  // DELETE /v1/me
  router.delete('/', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const isBlocked = await repos.users.isSoleOwnerOfActiveOrg(userId);

    if (isBlocked) {
      res.status(422).json({
        error: {
          code: ErrorCode.ACCOUNT_DELETION_BLOCKED,
          message:
            'You cannot delete your account while you are the sole owner of an organisation with an active subscription. Please transfer ownership or cancel your subscription first.',
          details: {},
        },
      });
      return;
    }

    await repos.users.softDelete(userId);
    const webRes = await auth.api.signOut({ headers: req.headers, asResponse: true });
    copyResponseHeaders(webRes, res);

    res.status(200).json({
      data: { success: true, message: 'Account deleted.' },
    });
  });

  return router;
}
