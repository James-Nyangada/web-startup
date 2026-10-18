import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { Auth } from '../lib/auth.js';
import { validatePassword } from '../lib/passwords.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import { ErrorCode } from '../shared/errors.js';
import type { OrgRole } from '../db/schema/index.js';

const acceptSchema = z.object({
  token: z.string().trim().min(1, 'Invitation token is required'),
  name: z.string().trim().optional(),
  password: z.string().optional(),
});

export function invitationsRouter(repos: Repositories, auth: Auth): Router {
  const router = Router();

  // GET /v1/invitations/:token - Public invitation info
  router.get('/:token', async (req: Request, res: Response): Promise<void> => {
    const paramVal = req.params.token;
    const token = Array.isArray(paramVal) ? paramVal[0] : paramVal;

    if (!token) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Token is required.',
          details: {},
        },
      });
      return;
    }

    const resolved = await repos.invitations.findByToken(token);
    if (!resolved) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Invitation not found.',
          details: {},
        },
      });
      return;
    }

    if (resolved.isExpired) {
      res.status(410).json({
        error: {
          code: ErrorCode.INVITATION_EXPIRED,
          message: 'This invitation has expired (tokens are valid for 7 days). Please request a new invite.',
          details: {},
        },
      });
      return;
    }

    if (resolved.isAccepted) {
      res.status(400).json({
        error: {
          code: ErrorCode.INVITATION_ALREADY_ACCEPTED,
          message: 'This invitation has already been accepted.',
          details: {},
        },
      });
      return;
    }

    if (resolved.isRevoked) {
      res.status(400).json({
        error: {
          code: ErrorCode.INVITATION_REVOKED,
          message: 'This invitation has been revoked by an organisation administrator.',
          details: {},
        },
      });
      return;
    }

    res.status(200).json({
      data: {
        valid: true,
        email: resolved.invitation.email,
        role: resolved.invitation.role,
        orgName: resolved.org.name,
        orgSlug: resolved.org.slug,
        expiresAt: resolved.invitation.expiresAt,
        inviterName: resolved.inviter?.name ?? null,
      },
    });
  });

  // POST /v1/invitations/accept - Accept invitation
  router.post('/accept', async (req: Request, res: Response): Promise<void> => {
    const parse = acceptSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid invitation acceptance payload.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { token, name, password } = parse.data;

    const resolved = await repos.invitations.findByToken(token);
    if (!resolved) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Invitation not found.',
          details: {},
        },
      });
      return;
    }

    if (resolved.isExpired) {
      res.status(410).json({
        error: {
          code: ErrorCode.INVITATION_EXPIRED,
          message: 'This invitation has expired.',
          details: {},
        },
      });
      return;
    }

    if (resolved.isAccepted) {
      res.status(400).json({
        error: {
          code: ErrorCode.INVITATION_ALREADY_ACCEPTED,
          message: 'This invitation has already been accepted.',
          details: {},
        },
      });
      return;
    }

    if (resolved.isRevoked) {
      res.status(400).json({
        error: {
          code: ErrorCode.INVITATION_REVOKED,
          message: 'This invitation has been revoked.',
          details: {},
        },
      });
      return;
    }

    // Determine target user
    let userId: string;

    // 1. Check if requester has active session
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user) {
      userId = session.user.id;
    } else {
      // 2. Not logged in: check if user already exists
      const existingUser = await repos.users.findByEmail(resolved.invitation.email);
      if (existingUser) {
        userId = existingUser.id;
      } else {
        // 3. New user registration requires password (min 10 chars per spec)
        if (!password) {
          res.status(400).json({
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: 'Password is required to create your account.',
              details: {},
            },
          });
          return;
        }

        const pwCheck = validatePassword(password);
        if (!pwCheck.valid) {
          res.status(400).json({
            error: {
              code: ErrorCode.PASSWORD_TOO_WEAK,
              message: pwCheck.reason ?? 'Password is too weak.',
              details: {},
            },
          });
          return;
        }

        // Create new user account via Better Auth
        const signUpRes = await auth.api.signUpEmail({
          body: {
            email: resolved.invitation.email,
            password,
            name: name ?? (resolved.invitation.email.split('@')[0] || 'User'),
          },
          headers: req.headers,
        });

        if (!signUpRes?.user) {
          res.status(500).json({
            error: {
              code: ErrorCode.INTERNAL_ERROR,
              message: 'Failed to create user account.',
              details: {},
            },
          });
          return;
        }

        userId = signUpRes.user.id;
      }
    }

    const orgId = asOrgId(resolved.invitation.orgId);

    // Add membership if not already a member
    const existingMembership = await repos.memberships.find(orgId, userId);
    if (!existingMembership) {
      await repos.memberships.add(
        orgId,
        userId,
        (resolved.invitation.role === 'client_viewer' ? 'member' : resolved.invitation.role) as OrgRole,
      );
    }

    // Consume single-use token
    await repos.invitations.markAccepted(resolved.invitation.id);

    // Audit log
    await repos.auditLog.write(orgId, {
      actorId: userId,
      actorType: 'user',
      action: 'invitation.accepted',
      targetId: resolved.invitation.id,
      targetType: 'invitation',
      data: {
        email: resolved.invitation.email,
        role: resolved.invitation.role,
      },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      data: {
        ok: true,
        orgId: resolved.org.id,
        orgSlug: resolved.org.slug,
        orgName: resolved.org.name,
      },
    });
  });

  return router;
}
