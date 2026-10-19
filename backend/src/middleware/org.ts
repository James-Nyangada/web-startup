import type { NextFunction, Request, Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId, type OrgId } from '../db/repositories/org-scope.js';
import type { memberships, organizations, OrgRole } from '../db/schema/index.js';
import { ErrorCode } from '../shared/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      org?: typeof organizations.$inferSelect;
      orgId?: OrgId;
      membership?: typeof memberships.$inferSelect;
    }
  }
}

const ROLE_RANKS: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Resolves the organisation from :orgId parameter (which can be either a UUID or a slug),
 * verifies that the authenticated user is a member of the organisation,
 * and attaches `req.org`, `req.orgId`, and `req.membership`.
 *
 * SPEC REQUIREMENT (Section 7):
 * "All org-scoped routes are under `/orgs/:orgId/…`; the API checks membership and role
 * on every request. A resource in another org returns 404, never 403."
 */
export function resolveOrgContext(repos: Repositories) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const orgParam = (req.params.orgId || req.params.org) as string | undefined;

    if (!orgParam) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Organisation identifier is required.',
          details: {},
        },
      });
      return;
    }

    if (!req.auth) {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHENTICATED,
          message: 'You must be signed in to perform this action.',
          details: {},
        },
      });
      return;
    }

    const org = await repos.organizations.findByIdOrSlug(orgParam);
    if (!org) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Organisation not found.',
          details: {},
        },
      });
      return;
    }

    const userId = req.auth.user.id;
    const isStaff = Boolean(req.auth.user.isStaff);

    const membership = await repos.memberships.find(asOrgId(org.id), userId);

    // Cross-org check: if the user is neither a member nor staff, return 404 (NEVER 403).
    if (!membership && !isStaff) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Organisation not found.',
          details: {},
        },
      });
      return;
    }

    req.org = org;
    req.orgId = asOrgId(org.id);
    req.membership = membership ?? {
      id: 'staff-session',
      orgId: org.id,
      userId,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    next();
  };
}

/**
 * Enforces a minimum role within the current organisation context.
 * Must be used on a router that has already resolved org context via `resolveOrgContext`.
 *
 * If role is insufficient for an existing org where the user is a member, returns 403.
 */
export function requireOrgRole(minRole: OrgRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.membership) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Organisation context not found.',
          details: {},
        },
      });
      return;
    }

    if (req.auth?.user.isStaff) {
      next();
      return;
    }

    const userRank = ROLE_RANKS[req.membership.role] ?? 0;
    const requiredRank = ROLE_RANKS[minRole] ?? 0;

    if (userRank < requiredRank) {
      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'You do not have permission to perform this action in this organisation.',
          details: { requiredRole: minRole, actualRole: req.membership.role },
        },
      });
      return;
    }

    next();
  };
}

/**
 * SPEC REQUIREMENT (Section 1.4 & P4-05):
 * "read-only mode (all mutating endpoints return 402 BILLING_REQUIRED except billing and data export)"
 * "Read-only org can view everything and export, cannot scan or invite."
 */
export function enforceReadOnlyOrg(req: Request, res: Response, next: NextFunction): void {
  if (req.org?.billingStatus !== 'read_only') {
    next();
    return;
  }

  // Safe read methods are always allowed (view everything)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  // Allow billing and invoice management routes so user can upgrade / manage payment
  const path = req.path || '';
  const isBilling = path.startsWith('/billing') || path.startsWith('/invoices');

  // Allow data export endpoints (e.g. data export / export report)
  const body = req.body as Record<string, unknown> | null | undefined;
  const isExport =
    path.startsWith('/export') || (path.startsWith('/reports') && Boolean(body?.isExport));

  if (isBilling || isExport) {
    next();
    return;
  }

  res.status(402).json({
    error: {
      code: ErrorCode.BILLING_REQUIRED,
      message: 'Your organisation is in read-only mode. Upgrade your plan to perform this action.',
      details: {
        billingStatus: req.org.billingStatus,
        plan: req.org.plan,
      },
    },
  });
}
