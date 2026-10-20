import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import type { Auth } from '../lib/auth.js';
import { slugify } from '../lib/slugs.js';
import { requireAuth } from '../middleware/auth.js';
import { enforceReadOnlyOrg, requireOrgRole, resolveOrgContext } from '../middleware/org.js';
import { orgSitesRouter } from './sites.js';
import { orgScansRouter, type ScansRouterOptions } from './scans.js';
import { orgIssuesRouter } from './issues.js';
import { orgReportsRouter } from './reports.js';
import { orgBillingRouter, orgInvoicesRouter } from './billing.js';
import { orgBrandingRouter } from './branding.js';
import { orgEvidenceRouter } from './evidence.js';
import { orgManualChecksRouter, orgManualCheckItemRouter } from './manual-checks.js';
import type { PaddleClient } from '../billing/paddle-api.js';
import { type StorageService, getStorage } from '../storage/index.js';
import { ErrorCode } from '../shared/errors.js';
import { assertWithinPlan, getPlanDefinition, getPlanLimits } from '../shared/plans.js';

const createOrgSchema = z.object({
  name: z.string().min(1, 'Organisation name is required').max(100),
  type: z.enum(['agency', 'store']).default('store'),
  timeZone: z.string().min(1).max(50).default('UTC'),
  freeCheckId: z.string().uuid().optional(),
});

const patchOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timeZone: z.string().min(1).max(50).optional(),
  slug: z.string().min(2).max(100).optional(),
});

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

import type { EmailSender } from '../emails/sender.js';

const changeMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

const createInvitationSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  role: z.enum(['admin', 'member', 'client_viewer']).default('member'),
  siteIds: z.array(z.string().uuid()).optional(),
});

export function orgsRouter(
  auth: Auth,
  repos: Repositories,
  scansOptions?: ScansRouterOptions,
  emailSender?: EmailSender,
  storage?: StorageService,
  paddleClient?: PaddleClient,
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
          type,
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

      if (parse.data.freeCheckId) {
        await repos.freeChecks.markConverted(parse.data.freeCheckId, org.id);
      }

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
  orgScoped.use(enforceReadOnlyOrg);

  // GET /v1/orgs/:orgId - Org details + usage (O A M)
  orgScoped.get(
    '/',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const org = req.org!;
      const planLimits = getPlanLimits(org.plan);
      const def = getPlanDefinition(org.plan);
      const [sitesCount, teamMembersCount] = await Promise.all([
        repos.sites.count(req.orgId!),
        repos.memberships.count(req.orgId!),
      ]);

      res.status(200).json({
        data: {
          org: req.org,
          membership: req.membership,
          limits: planLimits,
          usage: {
            sites: sitesCount,
            teamMembers: teamMembersCount,
          },
          features: def.features,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/usage - Resource usage and plan limits (P4-01 & Section 12.3)
  orgScoped.get(
    '/usage',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const org = req.org!;
      const planLimits = getPlanLimits(org.plan);
      const def = getPlanDefinition(org.plan);

      const [sitesCount, dailySitesCount, teamMembersCount, clientViewersCount] = await Promise.all(
        [
          repos.sites.count(orgId),
          repos.sites.countDailySites(orgId),
          repos.memberships.count(orgId),
          repos.invitations.countClientViewers(orgId),
        ],
      );

      const currentMonth = new Date().toISOString().slice(0, 7);
      const aiUsageCount = await repos.aiSuggestions.getMonthlyUsage(orgId, currentMonth);

      res.status(200).json({
        data: {
          plan: org.plan,
          planName: planLimits.name,
          limits: {
            maxSites: planLimits.maxSites,
            maxPagesPerScan: planLimits.maxPagesPerScan,
            manualScansPerDayPerSite: planLimits.manualScansPerDayPerSite,
            scheduledFrequency: planLimits.scheduledFrequency,
            maxDailySites: planLimits.maxDailySites,
            teamMembers: planLimits.teamMembers,
            clientViewers: planLimits.clientViewers,
            retentionMonths: planLimits.retentionMonths,
            aiSuggestionsMonthly: planLimits.aiSuggestionsMonthly,
          },
          usage: {
            sites: sitesCount,
            dailySites: dailySitesCount,
            teamMembers: teamMembersCount,
            clientViewers: clientViewersCount,
            aiSuggestionsThisMonth: aiUsageCount,
          },
          features: def.features,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/overview/cross-site-issues - Cross-site common issues (P4-10) (O A M)
  orgScoped.get(
    '/overview/cross-site-issues',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const items = await repos.issues.listCrossSiteCommonIssues(orgId);
      const uniqueSites = new Set<string>();
      for (const item of items) {
        for (const s of item.sites) {
          uniqueSites.add(s.siteId);
        }
      }
      res.status(200).json({
        data: {
          items,
          totalRules: items.length,
          totalAffectedSites: uniqueSites.size,
        },
      });
    },
  );

  // PATCH /v1/orgs/:orgId - Update org (O A)
  orgScoped.patch(
    '/',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
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
    },
  );

  // DELETE /v1/orgs/:orgId - Soft delete org (O)
  orgScoped.delete(
    '/',
    requireOrgRole('owner'),
    async (req: Request, res: Response): Promise<void> => {
      const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<
        string,
        unknown
      >;
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
    },
  );

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
      const invitations = await repos.invitations.listPending(req.orgId!);
      res.status(200).json({ data: { members, invitations } });
    },
  );

  // POST /v1/orgs/:orgId/invitations - Invite member or client viewer (O A)
  orgScoped.post(
    '/invitations',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      // P2-02: unverified users can use the app but cannot invite others.
      if (!req.auth!.user.emailVerified) {
        res.status(403).json({
          error: {
            code: ErrorCode.EMAIL_NOT_VERIFIED,
            message: 'Verify your email address before inviting others.',
            details: {},
          },
        });
        return;
      }

      const parse = createInvitationSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid invitation payload.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const { email, role, siteIds } = parse.data;

      // Check if user is already a member
      const existingUser = await repos.users.findByEmail(email);
      if (existingUser) {
        const existingMembership = await repos.memberships.find(req.orgId!, existingUser.id);
        if (existingMembership) {
          res.status(409).json({
            error: {
              code: ErrorCode.ALREADY_MEMBER,
              message: `User ${email} is already a member of this organisation.`,
              details: {},
            },
          });
          return;
        }
      }

      // Plan limit check: client viewer or team member seats (Section 12.3)
      if (role === 'client_viewer') {
        const clientViewersCount = await repos.invitations.countClientViewers(req.orgId!);
        assertWithinPlan(req.org, 'client_viewers', clientViewersCount + 1);
      } else {
        const membersCount = await repos.memberships.count(req.orgId!);
        const pendingCount = await repos.invitations.countPendingNonClient(req.orgId!);
        assertWithinPlan(req.org, 'team_members', membersCount + pendingCount + 1);
      }

      // If client viewer, validate siteIds are provided and exist within this org
      if (role === 'client_viewer') {
        if (!siteIds || siteIds.length === 0) {
          res.status(400).json({
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: 'At least one site must be selected for client viewers.',
              details: {},
            },
          });
          return;
        }

        for (const sId of siteIds) {
          const site = await repos.sites.findById(req.orgId!, sId);
          if (!site) {
            res.status(400).json({
              error: {
                code: ErrorCode.VALIDATION_ERROR,
                message: `Site ${sId} does not exist in this organisation.`,
                details: {},
              },
            });
            return;
          }
        }
      }

      const { invitation, rawToken } = await repos.invitations.create(req.orgId!, {
        email,
        role,
        siteIds,
        invitedBy: req.auth!.user.id,
      });

      if (!invitation) {
        res.status(500).json({
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Failed to create invitation.',
            details: {},
          },
        });
        return;
      }

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const inviteUrl = `${appUrl}/invitations/${rawToken}`;

      if (emailSender) {
        let emailBranding = undefined;
        if (role === 'client_viewer') {
          const brand = await repos.branding.findByOrgId(req.orgId!);
          if (brand) {
            emailBranding = {
              displayName: brand.displayName ?? req.org!.name,
              senderName: brand.emailSenderName ?? brand.displayName ?? undefined,
              primaryColor: brand.primaryColor ?? undefined,
            };
          }
        }

        await emailSender.send({
          to: invitation.email,
          templateId: 'E-04',
          data: {
            inviterName: req.auth!.user.name || req.auth!.user.email,
            orgName: req.org!.name,
            role: invitation.role,
            inviteUrl,
            expiresInDays: 7,
          },
          branding: emailBranding,
        });
      }

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: role === 'client_viewer' ? 'client_viewer.invited' : 'member.invited',
        targetId: invitation.id,
        targetType: 'invitation',
        data: { email: invitation.email, role: invitation.role, siteIds: invitation.siteIds },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({
        data: {
          invitation,
          inviteUrl,
        },
      });
    },
  );

  // DELETE /v1/orgs/:orgId/invitations/:id - Revoke invitation (O A)
  orgScoped.delete(
    '/invitations/:id',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const paramVal = req.params.id;
      const invitationId = Array.isArray(paramVal) ? paramVal[0] : paramVal;

      if (!invitationId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invitation ID is required.',
            details: {},
          },
        });
        return;
      }

      const existing = await repos.invitations.findById(req.orgId!, invitationId);
      if (!existing) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Invitation not found.',
            details: {},
          },
        });
        return;
      }

      await repos.invitations.revoke(req.orgId!, invitationId);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'invitation.revoked',
        targetId: invitationId,
        targetType: 'invitation',
        data: { email: existing.email },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { ok: true } });
    },
  );

  // POST /v1/orgs/:orgId/invitations/:id/resend - Resend invitation (O A)
  orgScoped.post(
    '/invitations/:id/resend',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const paramVal = req.params.id;
      const invitationId = Array.isArray(paramVal) ? paramVal[0] : paramVal;

      if (!invitationId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invitation ID is required.',
            details: {},
          },
        });
        return;
      }

      const existing = await repos.invitations.findById(req.orgId!, invitationId);
      if (!existing) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Invitation not found.',
            details: {},
          },
        });
        return;
      }

      const renewed = await repos.invitations.renew(req.orgId!, invitationId);
      if (!renewed) {
        res.status(500).json({
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Failed to renew invitation.',
            details: {},
          },
        });
        return;
      }

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const inviteUrl = `${appUrl}/invitations/${renewed.rawToken}`;

      if (emailSender) {
        await emailSender.send({
          to: renewed.invitation.email,
          templateId: 'E-04',
          data: {
            inviterName: req.auth!.user.name || req.auth!.user.email,
            orgName: req.org!.name,
            role: renewed.invitation.role,
            inviteUrl,
            expiresInDays: 7,
          },
        });
      }

      res.status(200).json({
        data: {
          ok: true,
          invitation: renewed.invitation,
          inviteUrl,
        },
      });
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
            message:
              'Cannot change the role of the organisation owner. Transfer ownership instead.',
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

  // GET /v1/orgs/:orgId/clients - List client viewers with assigned sites (O A)
  orgScoped.get(
    '/clients',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const clients = await repos.clientAccess.listByOrg(req.orgId!);
      res.status(200).json({ data: { clients } });
    },
  );

  // PUT & PATCH /v1/orgs/:orgId/clients/:userId/sites - Set sites for client viewer (O A)
  const setClientSitesSchema = z.object({
    siteIds: z.array(z.string().uuid()).min(1, 'At least one site must be assigned.'),
  });

  const setClientSitesHandler = async (req: Request, res: Response): Promise<void> => {
    const userIdParam = req.params.userId;
    const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

    if (!userId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'User ID is required.',
          details: {},
        },
      });
      return;
    }

    const parse = setClientSitesSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid site assignment payload.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { siteIds } = parse.data;

    // Validate that each site belongs to org
    for (const siteId of siteIds) {
      const site = await repos.sites.findById(req.orgId!, siteId);
      if (!site) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: `Site ${siteId} does not exist in this organisation.`,
            details: {},
          },
        });
        return;
      }
    }

    await repos.clientAccess.setSiteAccess(req.orgId!, userId, siteIds);

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth!.user.id,
      actorType: 'user',
      action: 'client_viewer.sites_updated',
      targetId: userId,
      targetType: 'user',
      data: { siteIds },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({ data: { success: true } });
  };

  orgScoped.put('/clients/:userId/sites', requireOrgRole('admin'), setClientSitesHandler);
  orgScoped.patch('/clients/:userId/sites', requireOrgRole('admin'), setClientSitesHandler);

  // DELETE /v1/orgs/:orgId/clients/:userId - Remove client access entirely (O A)
  orgScoped.delete(
    '/clients/:userId',
    requireOrgRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const userIdParam = req.params.userId;
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

      if (!userId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'User ID is required.',
            details: {},
          },
        });
        return;
      }

      await repos.clientAccess.removeClientViewer(req.orgId!, userId);

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth!.user.id,
        actorType: 'user',
        action: 'client_viewer.removed',
        targetId: userId,
        targetType: 'user',
        data: {},
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(200).json({ data: { success: true } });
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

  const resolvedStorage = storage ?? getStorage();

  // Mount Section 7.3 Sites router under orgScoped
  orgScoped.use('/sites', orgSitesRouter(repos));
  orgScoped.use('/sites', orgEvidenceRouter(repos));
  orgScoped.use('/sites', orgManualChecksRouter(repos, resolvedStorage));
  orgScoped.use('/manual-checks', orgManualCheckItemRouter(repos, resolvedStorage));

  // Mount Section 7.4 Scans router under orgScoped
  orgScoped.use(orgScansRouter(repos, scansOptions));

  // Mount Section 7.5 Issues router under orgScoped
  orgScoped.use(orgIssuesRouter(repos, scansOptions));

  // Mount Section 8.1 Reports router under orgScoped
  orgScoped.use(
    '/reports',
    orgReportsRouter(repos, {
      emailSender,
      storage,
      boss: scansOptions?.boss,
    }),
  );

  // Mount Section 7.9 Billing router under orgScoped
  orgScoped.use('/billing', orgBillingRouter(repos, paddleClient));

  // Mount Section 7.9 Invoices router under orgScoped
  orgScoped.use('/invoices', orgInvoicesRouter(repos));

  // Mount S-43 Branding router under orgScoped
  orgScoped.use('/branding', orgBrandingRouter(repos, resolvedStorage));

  router.use('/:orgId', orgScoped);

  return router;
}
