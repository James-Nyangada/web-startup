import type { NextFunction, Request, Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import type { OrgRow } from '../db/repositories/organizations.js';
import { asOrgId, type OrgId } from '../db/repositories/org-scope.js';
import type { memberships, OrgRole, Plan } from '../db/schema/index.js';
import { isStaffVerified } from '../db/repositories/staff.js';
import { ErrorCode } from '../shared/errors.js';

export type AnyOrgRole = OrgRole | 'client_viewer';

export type ResolvedMembership =
  | typeof memberships.$inferSelect
  | {
      id: string;
      orgId: string;
      userId: string;
      role: AnyOrgRole;
      createdAt: Date;
      updatedAt: Date;
    };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** `basePlan` is the billed plan when a staff override replaces `plan` (P6-02). */
      org?: OrgRow & { basePlan?: Plan };
      /** Set when a staff user is viewing this org read-only (P6-02). */
      impersonation?: boolean;
      orgId?: OrgId;
      membership?: ResolvedMembership;
      clientSiteIds?: string[];
    }
  }
}

const ROLE_RANKS: Record<AnyOrgRole, number> = {
  client_viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Resolves the organisation from :orgId parameter (which can be either a UUID or a slug),
 * verifies that the authenticated user is a member, a client viewer, or a staff user
 * impersonating it, and attaches `req.org`, `req.orgId`, and `req.membership`.
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

    let membership: ResolvedMembership | null = await repos.memberships.find(
      asOrgId(org.id),
      userId,
    );
    let clientSiteIds: string[] | undefined = undefined;

    if (!membership && repos.clientAccess) {
      const accesses = await repos.clientAccess.listByUserAndOrg(userId, asOrgId(org.id));
      if (accesses.length > 0) {
        clientSiteIds = accesses.map((a) => a.siteId);
        membership = {
          id: `client-${userId}-${org.id}`,
          orgId: org.id,
          userId,
          role: 'client_viewer',
          createdAt: accesses[0]?.createdAt ?? new Date(),
          updatedAt: new Date(),
        };
      }
    }

    // Staff see a customer org only while impersonating it from a TOTP-verified session
    // (spec 7.12). The view is read-only: anything but a safe method is refused.
    let impersonation = false;
    if (!membership && repos.staff) {
      const state = await repos.staff.getSessionState(req.auth.session.id);
      if (isStaffVerified(state) && state?.impersonatingOrgId === org.id) {
        impersonation = true;
        membership = {
          id: `staff-${userId}-${org.id}`,
          orgId: org.id,
          userId,
          role: 'owner',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    }

    // Cross-org check: neither a member, a client viewer nor an impersonating staff user.
    if (!membership) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Organisation not found.',
          details: {},
        },
      });
      return;
    }

    if (impersonation && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.status(403).json({
        error: {
          code: ErrorCode.IMPERSONATION_READ_ONLY,
          message: 'Staff impersonation is read-only.',
          details: {},
        },
      });
      return;
    }

    req.org = org;
    req.orgId = asOrgId(org.id);
    req.membership = membership;
    req.clientSiteIds = clientSiteIds;
    req.impersonation = impersonation;

    next();
  };
}

/**
 * Enforces a minimum role within the current organisation context.
 * Must be used on a router that has already resolved org context via `resolveOrgContext`.
 *
 * If role is insufficient for an existing org where the user is a member, returns 403.
 */
export function requireOrgRole(minRole: AnyOrgRole) {
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
 * Ensures client viewers can only access their explicitly assigned sites in read-only mode.
 */
export function enforceSiteAccess(req: Request, res: Response, next: NextFunction): void {
  if (req.membership?.role === 'client_viewer') {
    const siteIdParam = req.params.siteId;
    const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

    if (!siteId || !req.clientSiteIds?.includes(siteId)) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Site not found.',
          details: {},
        },
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Client viewers have read-only access to assigned sites.',
          details: { role: 'client_viewer' },
        },
      });
      return;
    }
  }
  next();
}

/**
 * SPEC REQUIREMENT (Section 1.4 & P4-05):
 * "read-only mode (all mutating endpoints return 402 BILLING_REQUIRED except billing and data export)"
 * "Read-only org can view everything and export, cannot scan or invite."
 */
export function enforceReadOnlyOrg(req: Request, res: Response, next: NextFunction): void {
  const isReadOnly =
    req.org?.billingStatus === 'read_only' ||
    req.org?.billingStatus === 'paused' ||
    req.org?.billingStatus === 'canceled';

  if (!isReadOnly) {
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

  const statusLabel =
    req.org?.billingStatus === 'canceled'
      ? 'canceled'
      : req.org?.billingStatus === 'paused'
        ? 'paused'
        : 'in read-only mode';

  res.status(402).json({
    error: {
      code: ErrorCode.BILLING_REQUIRED,
      message: `Your organisation is ${statusLabel}. Upgrade or reactivate your plan to perform this action.`,
      details: {
        billingStatus: req.org?.billingStatus,
        plan: req.org?.plan,
      },
    },
  });
}
