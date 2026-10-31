import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { Auth } from '../lib/auth.js';
import { AppError } from '../lib/app-error.js';
import { validatePassword } from '../lib/passwords.js';
import { ErrorCode } from '../shared/errors.js';

const acceptSchema = z.object({
  token: z.string().trim().min(1, 'Invitation token is required'),
  name: z.string().trim().max(100).optional(),
  password: z.string().optional(),
});

/** Public endpoints for staff email invitations; the token in the link is the credential. */
export function staffInvitationsRouter(repos: Repositories, auth: Auth): Router {
  const router = Router();

  async function resolve(token: string) {
    const found = await repos.staff.findStaffInvitationByToken(token);
    if (!found) throw AppError.notFound('Invitation not found.');
    if (found.isExpired) {
      throw new AppError(410, ErrorCode.INVITATION_EXPIRED, 'This invitation has expired. Ask for a new one.');
    }
    if (found.isAccepted) {
      throw new AppError(400, ErrorCode.INVITATION_ALREADY_ACCEPTED, 'This invitation has already been accepted.');
    }
    if (found.isRevoked) {
      throw new AppError(400, ErrorCode.INVITATION_REVOKED, 'This invitation has been revoked.');
    }
    return found.invitation;
  }

  router.get('/:token', async (req: Request, res: Response) => {
    const raw = req.params.token;
    const invitation = await resolve(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
    const existing = await repos.users.findByEmail(invitation.email);
    res.json({
      data: {
        valid: true,
        email: invitation.email,
        role: invitation.role,
        displayName: invitation.displayName,
        hasAccount: Boolean(existing),
        expiresAt: invitation.expiresAt,
      },
    });
  });

  router.post('/accept', async (req: Request, res: Response) => {
    const { token, name, password } = acceptSchema.parse(req.body);
    const invitation = await resolve(token);

    let userId: string;
    const existing = await repos.users.findByEmail(invitation.email);
    if (existing) {
      userId = existing.id;
    } else {
      if (!password) throw AppError.validation('Choose a password to create your account.');
      const check = validatePassword(password);
      if (!check.valid) {
        throw new AppError(400, ErrorCode.PASSWORD_TOO_WEAK, check.reason ?? 'Password is too weak.');
      }
      const created = await auth.api.signUpEmail({
        body: {
          email: invitation.email,
          password,
          name: name || invitation.displayName || invitation.email.split('@')[0] || 'Staff',
        },
        headers: req.headers,
      });
      if (!created?.user) throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Failed to create account.');
      userId = created.user.id;
    }

    await repos.staff.markUserEmailVerified(userId);
    if (!(await repos.staff.findStaffMemberByUserId(userId))) {
      await repos.staff.createStaffMember({
        userId,
        role: invitation.role,
        displayName: invitation.displayName ?? undefined,
        jobTitle: invitation.jobTitle ?? undefined,
        bio: invitation.bio ?? undefined,
      });
    }
    await repos.staff.markStaffInvitationAccepted(invitation.id);
    await repos.auditLog.write(null, {
      actorId: userId,
      actorType: 'user',
      action: 'staff.invitation_accepted',
      targetId: invitation.id,
      targetType: 'staff_invitation',
      data: { email: invitation.email, role: invitation.role },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.json({ data: { ok: true, existingAccount: Boolean(existing) } });
  });

  return router;
}
