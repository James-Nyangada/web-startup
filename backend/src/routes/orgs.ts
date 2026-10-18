import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import type { Auth } from '../lib/auth.js';
import { slugify } from '../lib/slugs.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrgRole, resolveOrgContext } from '../middleware/org.js';
import { orgSitesRouter } from './sites.js';
import { orgScansRouter, type ScansRouterOptions } from './scans.js';
import { orgIssuesRouter } from './issues.js';
import { ErrorCode } from '../shared/errors.js';

const createOrgSchema = z.object({
  name: z.string().min(1, 'Organisation name is required').max(100),
  type: z.enum(['agency', 'store']).default('store'),
  timeZone: z.string().min(1).max(50).default('UTC'),
});

const patchOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timeZone: z.string().min(1).max(50).optional(),
  slug: z.string().min(2).max(100).optional(),
});

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

const changeMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export function orgsRouter(
  auth: Auth,
  repos: Repositories,
  scansOptions?: ScansRouterOptions,
): Router {
  const router = Router();
  router.use(requireAuth(auth));

  // POST /v1/orgs - Create organisation
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const parse = createOrgSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid organisation details.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { name, type, timeZone } = parse.data;
    const baseSlug = slugify(name);
    let candidateSlug = baseSlug;
    let suffix = 2;

    while (!(await repos.organizations.isSlugAvailable(candidateSlug))) {
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14-day trial
    const userId = req.auth!.user.id;

    try {
      const { org, membership } = await repos.organizations.createWithInitialOwner(
        {
          name,
          slug: candidateSlug,
          timeZone,
          trialEndsAt,
        },
        userId,
      );

      await repos.auditLog.write(asOrgId(org.id), {
        actorId: userId,
        actorType: 'user',
        action: 'org.created',
        targetType: 'organization',
        targetId: org.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        data: { name: org.name, slug: org.slug, type, timeZone },
      });

      res.status(201).json({
        data: {
          org: {
            id: org.id,
            name: org.name,
            slug: org.slug,
            type,
            plan: org.plan,
            billingStatus: org.billingStatus,
            trialEndsAt: org.trialEndsAt,
            timeZone: org.timeZone,
            createdAt: org.createdAt,
          },
          membership,
        },
      });
    } catch {
      res.status(500).json({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to create organisation.',
          details: {},
        },
      });
    }
  });

  // Org-scoped sub-router mounted under /:orgId
  const orgScoped = Router({ mergeParams: true });
  orgScoped.use(resolveOrgContext(repos));

  // GET /v1/orgs/:orgId - Org details
  orgScoped.get('/', requireOrgRole('member'), (req: Request, res: Response): void => {
    res.status(200).json({
      data: {
        org: req.org,
        membership: req.membership,
      },
    });
  });

  // PATCH /v1/orgs/:orgId - Update org (O A)
  orgScoped.patch('/', requireOrgRole('admin'), async (req: Request, res: Response): Promise<void> => {
    const parse = patchOrgSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid organisation update data.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { name, timeZone, slug } = parse.data;

    if (slug) {
      const isAvailable = await repos.organizations.isSlugAvailable(slug, req.org!.id);
      if (!isAvailable) {
        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: 'This organisation slug is already taken.',
            details: { slug },
          },
        });
        return;
      }
    }

    const updated = await repos.organizations.update(req.orgId!, {
      name,
      timeZone,
      slug,
    });

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth!.user.id,
      actorType: 'user',
      action: 'org.updated',
      targetType: 'organization',
      targetId: req.org!.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: { changes: parse.data },
    });

    res.status(200).json({ data: { org: updated } });
  });

  // DELETE /v1/orgs/:orgId - Soft delete org (O)
  orgScoped.delete('/', requireOrgRole('owner'), async (req: Request, res: Response): Promise<void> => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const confirmName = typeof body.confirmName === 'string' ? body.confirmName : undefined;
    if (confirmName !== req.org!.name) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Please enter the exact organisation name to confirm deletion.',
          details: { expected: req.org!.name },
        },
      });
      return;
    }

    await repos.organizations.softDelete(req.orgId!);

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth!.user.id,
      actorType: 'user',
      action: 'org.deleted',
      targetType: 'organization',
      targetId: req.org!.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: { name: req.org!.name },
    });

    res.status(200).json({
      data: { success: true, message: 'Organisation has been deleted.' },
    });
  });

  // POST /v1/orgs/:orgId/transfer-ownership - Transfer ownership to existing member (O)
  orgScoped.post(
    '/transfer-ownership',
    requireOrgRole('owner'),
    async (req: Request, res: Response): Promise<void> => {
      const parse = transferOwnershipSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'New owner user ID is required.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const { newOwnerId } = parse.data;
      if (newOwnerId === req.auth!.user.id) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'You are already the owner of this organisation.',
            details: {},
          },
        });
        return;
      }

      const targetMembership = await repos.memberships.find(req.orgId!, newOwnerId);
      if (!targetMembership) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Target user is not a member of this organisation.',
            details: {},
          },
        });
        return;
      }

      // Demote current owner to admin, promote target user to owner
      await repos.memberships.updateRole(req.orgId!, req.auth!.user.id, 'admin');
      await repos.memberships.updateRole(req.orgId!, newOwnerId, 'owner');

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'org.ownership_transferred',
        targetType: 'organization',
        targetId: req.org!.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        data: { previousOwnerId: req.auth!.user.id, newOwnerId },
      });

      res.status(200).json({
        data: {
          success: true,
          message: 'Organisation ownership transferred successfully.',
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/members - List members (O A M)
  orgScoped.get(
    '/members',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const members = await repos.memberships.list(req.orgId!);
      res.status(200).json({ data: { members } });
    },
  );

  // PATCH /v1/orgs/:orgId/members/:userId - Change member role (O A)
  orgScoped.patch(
    '/members/:userId',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const paramVal = req.params.userId;
      const targetUserId = Array.isArray(paramVal) ? paramVal[0] : paramVal;
      if (!targetUserId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'User ID is required.',
            details: {},
          },
        });
        return;
      }

      const parse = changeMemberRoleSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Role must be admin or member.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const target = await repos.memberships.find(req.orgId!, targetUserId);
      if (!target) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Member not found in this organisation.',
            details: {},
          },
        });
        return;
      }

      if (target.role === 'owner') {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Cannot change the role of the organisation owner. Transfer ownership instead.',
            details: {},
          },
        });
        return;
      }

      // Admins cannot change roles of other admins or demote themselves if sole admin
      if (req.membership!.role === 'admin' && target.role === 'admin') {
        res.status(403).json({
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Admins cannot change the role of other admins.',
            details: {},
          },
        });
        return;
      }

      const updated = await repos.memberships.updateRole(req.orgId!, targetUserId, parse.data.role);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'member.role_updated',
        targetType: 'membership',
        targetId: target.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        data: { targetUserId, newRole: parse.data.role },
      });

      res.status(200).json({ data: { membership: updated } });
    },
  );

  // DELETE /v1/orgs/:orgId/members/:userId - Remove member (O A)
  orgScoped.delete(
    '/members/:userId',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const paramVal = req.params.userId;
      const targetUserId = Array.isArray(paramVal) ? paramVal[0] : paramVal;
      if (!targetUserId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'User ID is required.',
            details: {},
          },
        });
        return;
      }

      const target = await repos.memberships.find(req.orgId!, targetUserId);
      if (!target) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Member not found in this organisation.',
            details: {},
          },
        });
        return;
      }

      if (target.role === 'owner') {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Cannot remove the organisation owner.',
            details: {},
          },
        });
        return;
      }

      // Admins cannot remove other admins (only owner can)
      if (
        req.membership!.role === 'admin' &&
        target.role === 'admin' &&
        targetUserId !== req.auth!.user.id
      ) {
        res.status(403).json({
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Admins cannot remove other admins.',
            details: {},
          },
        });
        return;
      }

      await repos.memberships.remove(req.orgId!, targetUserId);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'member.removed',
        targetType: 'membership',
        targetId: target.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        data: { targetUserId },
      });

      res.status(200).json({
        data: { success: true, message: 'Member removed from organisation.' },
      });
    },
  );

  // GET /v1/orgs/:orgId/audit-log - List audit log (O A)
  orgScoped.get(
    '/audit-log',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
      const entries = await repos.auditLog.list(req.orgId!, limit);
      res.status(200).json({ data: { entries } });
    },
  );

  // Mount Section 7.3 Sites router under orgScoped
  orgScoped.use('/sites', orgSitesRouter(repos));

  // Mount Section 7.4 Scans router under orgScoped
  orgScoped.use(orgScansRouter(repos, scansOptions));

  // Mount Section 7.5 Issues router under orgScoped
  orgScoped.use(orgIssuesRouter(repos, scansOptions));

  router.use('/:orgId', orgScoped);

  return router;
}
