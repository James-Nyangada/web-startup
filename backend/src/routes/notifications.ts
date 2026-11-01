import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { asOrgId } from '../db/repositories/org-scope.js';

const updatePreferencesSchema = z.object({
  scanCompleted: z.enum(['all', 'issues_only', 'off']).optional(),
  regressions: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
  billing: z.boolean().optional(),
});

export function orgNotificationsRouter(repos: Repositories): Router {
  const router = Router();

  // GET /v1/orgs/:orgId/notifications - List in-app notifications
  router.get(
    '/notifications',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const userId = req.auth?.user?.id;
      if (!userId) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
            details: {},
          },
        });
        return;
      }

      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;

      const [items, unreadCount] = await Promise.all([
        repos.notifications.listInAppByUser(orgId, userId, { limit, unreadOnly }),
        repos.notifications.countUnreadInApp(orgId, userId),
      ]);

      res.status(200).json({
        data: {
          items,
          unreadCount,
        },
      });
    },
  );

  // PATCH /v1/orgs/:orgId/notifications/:id/read - Mark one notification read
  router.patch(
    '/notifications/:id/read',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const userId = req.auth?.user?.id;
      const idParam = req.params.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;

      if (!userId) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
            details: {},
          },
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Notification ID is required.',
            details: {},
          },
        });
        return;
      }

      const success = await repos.notifications.markInAppRead(orgId, userId, id);
      res.status(200).json({
        data: {
          success,
        },
      });
    },
  );

  // POST /v1/orgs/:orgId/notifications/read-all - Mark all read
  router.post(
    '/notifications/read-all',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const userId = req.auth?.user?.id;

      if (!userId) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
            details: {},
          },
        });
        return;
      }

      const updatedCount = await repos.notifications.markAllInAppRead(orgId, userId);
      res.status(200).json({
        data: {
          updatedCount,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/notification-preferences - Get preferences
  router.get(
    '/notification-preferences',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const userId = req.auth?.user?.id;

      if (!userId) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
            details: {},
          },
        });
        return;
      }

      const preferences = await repos.notifications.getPreferences(orgId, userId);
      res.status(200).json({
        data: {
          preferences,
        },
      });
    },
  );

  // PUT /v1/orgs/:orgId/notification-preferences - Update preferences
  router.put(
    '/notification-preferences',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const userId = req.auth?.user?.id;

      if (!userId) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
            details: {},
          },
        });
        return;
      }

      const parse = updatePreferencesSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid preferences payload.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const preferences = await repos.notifications.updatePreferences(orgId, userId, parse.data);
      res.status(200).json({
        data: {
          preferences,
        },
      });
    },
  );

  return router;
}

export function globalNotificationsRouter(repos: Repositories): Router {
  const router = Router();

  // Middleware ensuring user is authenticated
  router.use((req, res, next) => {
    if (!req.auth?.user?.id) {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHENTICATED,
          message: 'Authentication required.',
          details: {},
        },
      });
      return;
    }
    next();
  });

  async function resolveUserOrgId(userId: string): Promise<string | null> {
    const list = await repos.users.listMemberships(userId);
    return list[0]?.orgId ?? null;
  }

  // GET /v1/notifications
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const orgId = await resolveUserOrgId(userId);
    if (!orgId) {
      res.status(200).json({ data: { items: [], unreadCount: 0 } });
      return;
    }

    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;

    const [items, unreadCount] = await Promise.all([
      repos.notifications.listInAppByUser(asOrgId(orgId), userId, { limit, unreadOnly }),
      repos.notifications.countUnreadInApp(asOrgId(orgId), userId),
    ]);

    res.status(200).json({ data: { items, unreadCount } });
  });

  // PATCH /v1/notifications/:id
  router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const orgId = await resolveUserOrgId(userId);
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!orgId || !id) {
      res.status(200).json({ data: { success: false } });
      return;
    }

    const success = await repos.notifications.markInAppRead(asOrgId(orgId), userId, id);
    res.status(200).json({ data: { success } });
  });

  // POST /v1/notifications/read-all
  router.post('/read-all', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const orgId = await resolveUserOrgId(userId);
    if (!orgId) {
      res.status(200).json({ data: { updatedCount: 0 } });
      return;
    }

    const updatedCount = await repos.notifications.markAllInAppRead(asOrgId(orgId), userId);
    res.status(200).json({ data: { updatedCount } });
  });

  // GET /v1/notification-preferences
  router.get('/preferences', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const orgId = await resolveUserOrgId(userId);
    if (!orgId) {
      res.status(200).json({
        data: {
          preferences: {
            scanCompleted: 'all',
            regressions: true,
            weeklyDigest: true,
            productUpdates: true,
            billing: true,
          },
        },
      });
      return;
    }

    const preferences = await repos.notifications.getPreferences(asOrgId(orgId), userId);
    res.status(200).json({ data: { preferences } });
  });

  // PUT /v1/notification-preferences
  router.put('/preferences', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const orgId = await resolveUserOrgId(userId);
    if (!orgId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'User does not belong to an organisation.',
          details: {},
        },
      });
      return;
    }

    const parse = updatePreferencesSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid preferences payload.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const preferences = await repos.notifications.updatePreferences(
      asOrgId(orgId),
      userId,
      parse.data,
    );
    res.status(200).json({ data: { preferences } });
  });

  return router;
}
