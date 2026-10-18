import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { assertCrossOrg404 } from '../helpers/cross-org.js';
import { buildTestApp } from '../helpers/fakes.js';

function createMockAuth() {
  const usersMap = new Map<
    string,
    { user: Record<string, unknown>; session: Record<string, unknown> }
  >();

  const getUser = (userId: string) => {
    if (!usersMap.has(userId)) {
      usersMap.set(userId, {
        user: {
          id: userId,
          email: `${userId}@example.com`,
          name: `User ${userId}`,
          isStaff: false,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {
          id: `sess-${userId}`,
          userId,
          token: `token-${userId}`,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    return usersMap.get(userId)!;
  };

  const api = {
    getSession: vi.fn(
      ({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
        let cookie: string | null = null;
        if (headers instanceof Headers) {
          cookie = headers.get('cookie');
        } else if (headers && typeof headers === 'object' && 'cookie' in headers) {
          cookie = (headers.cookie as string) ?? null;
        }
        if (cookie) {
          const match = cookie.match(/token-([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            return Promise.resolve(getUser(match[1]));
          }
        }
        return Promise.resolve(null);
      },
    ),
    signUpEmail: vi.fn(({ body }: { body: { email: string; name?: string } }) => {
      return Promise.resolve({
        user: {
          id: 'new-user-id-999',
          email: body.email,
          name: body.name || 'New User',
        },
      });
    }),
  };

  return { api, getUser } as unknown as Auth & {
    api: typeof api;
    getUser: typeof getUser;
  };
}

describe('Team Members and Invitations (Chunk P2-17)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const otherOrgId = '22222222-2222-4222-a222-222222222222';
  const adminId = 'user-admin-123';
  const memberId = 'user-member-456';
  const adminCookie = `better-auth.session_token=token-${adminId}`;
  const memberCookie = `better-auth.session_token=token-${memberId}`;

  const mockOrg = {
    id: orgId,
    name: 'Brightline Studio',
    slug: 'brightline',
    type: 'agency' as const,
    plan: 'agency' as const,
    billingStatus: 'active' as const,
    timeZone: 'UTC',
    trialEndsAt: null,
    paddleCustomerId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repos: Repositories;
  let app: Express;
  let auth: ReturnType<typeof createMockAuth>;

  beforeEach(() => {
    auth = createMockAuth();

    const testApp = buildTestApp({ auth });
    repos = testApp.repos;

    // Default org and memberships
    vi.mocked(repos.organizations.findById).mockImplementation((id: string) =>
      Promise.resolve(id === orgId ? (mockOrg as never) : null),
    );
    vi.mocked(repos.organizations.findByIdOrSlug).mockImplementation((idOrSlug: string) =>
      Promise.resolve(idOrSlug === orgId || idOrSlug === mockOrg.slug ? (mockOrg as never) : null),
    );
    vi.mocked(repos.memberships.find).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(
        oid === orgId && uid === adminId
          ? ({
              orgId,
              userId: adminId,
              role: 'admin',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as never)
          : oid === orgId && uid === memberId
            ? ({
                orgId,
                userId: memberId,
                role: 'member',
                createdAt: new Date(),
                updatedAt: new Date(),
              } as never)
            : null,
      ),
    );
    vi.mocked(repos.memberships.findRole).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(
        oid === orgId && uid === adminId
          ? 'admin'
          : oid === orgId && uid === memberId
            ? 'member'
            : null,
      ),
    );

    app = testApp.app;
  });

  describe('GET /v1/orgs/:orgId/members', () => {
    it('returns both active members and pending invitations', async () => {
      vi.mocked(repos.memberships.list).mockResolvedValueOnce([
        {
          userId: adminId,
          name: 'Daniel Mwangi',
          email: 'daniel@brightline.studio',
          role: 'owner',
          joinedAt: new Date(),
        },
      ]);

      vi.mocked(repos.invitations.listPending).mockResolvedValueOnce([
        {
          id: 'inv-1',
          orgId,
          email: 'newcolleague@brightline.studio',
          role: 'member',
          siteIds: [],
          expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          invitedById: adminId,
          invitedByName: 'Daniel Mwangi',
          invitedByEmail: 'daniel@brightline.studio',
        },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/members`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.members).toHaveLength(1);
      expect(res.body.data.invitations).toHaveLength(1);
      expect(res.body.data.invitations[0].email).toBe('newcolleague@brightline.studio');
    });

    it('returns 404 for cross-org access', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/members`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('POST /v1/orgs/:orgId/invitations (Invite member)', () => {
    it('creates an invitation, sends E-04 email, and records audit log', async () => {
      vi.mocked(repos.users.findByEmail).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/invitations`)
        .set('Cookie', adminCookie)
        .send({
          email: 'colleague@example.com',
          role: 'member',
        })
        .expect(201);

      expect(res.body.data.invitation.email).toBe('colleague@example.com');
      expect(res.body.data.inviteUrl).toContain('/invitations/');
      expect(repos.invitations.create).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          email: 'colleague@example.com',
          role: 'member',
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'member.invited',
        }),
      );
    });

    it('refuses invitations from users who have not verified their email (P2-02)', async () => {
      auth.getUser(adminId).user.emailVerified = false;

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/invitations`)
        .set('Cookie', adminCookie)
        .send({ email: 'colleague@example.com', role: 'member' })
        .expect(403);

      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
      expect(repos.invitations.create).not.toHaveBeenCalled();
    });

    it('returns 409 ALREADY_MEMBER when invitee is already an org member', async () => {
      vi.mocked(repos.users.findByEmail).mockResolvedValueOnce({
        id: memberId,
        email: 'mark@brightline.studio',
        name: 'Mark Otieno',
        isStaff: false,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        avatarUrl: null,
        timeZone: 'UTC',
        lastActiveOrgId: orgId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/invitations`)
        .set('Cookie', adminCookie)
        .send({
          email: 'mark@brightline.studio',
          role: 'member',
        })
        .expect(409);

      expect(res.body.error.code).toBe(ErrorCode.ALREADY_MEMBER);
    });

    it('forbids member role from sending invitations (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/v1/orgs/${orgId}/invitations`)
        .set('Cookie', memberCookie)
        .send({
          email: 'colleague@example.com',
          role: 'member',
        })
        .expect(403);

      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('rejects invalid email with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/v1/orgs/${orgId}/invitations`)
        .set('Cookie', adminCookie)
        .send({
          email: 'not-an-email',
          role: 'member',
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('DELETE /v1/orgs/:orgId/invitations/:id (Revoke invitation)', () => {
    it('revokes a pending invitation and writes audit log', async () => {
      vi.mocked(repos.invitations.findById).mockResolvedValueOnce({
        id: 'inv-123',
        orgId,
        email: 'colleague@example.com',
        role: 'member',
        siteIds: [],
        tokenHash: 'hash-abc',
        invitedBy: adminId,
        expiresAt: new Date(Date.now() + 500000),
        acceptedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/v1/orgs/${orgId}/invitations/inv-123`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      expect(repos.invitations.revoke).toHaveBeenCalledWith(orgId, 'inv-123');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'invitation.revoked',
        }),
      );
    });

    it('returns 404 when invitation not found', async () => {
      vi.mocked(repos.invitations.findById).mockResolvedValueOnce(null);

      const res = await request(app)
        .delete(`/v1/orgs/${orgId}/invitations/inv-not-found`)
        .set('Cookie', adminCookie)
        .expect(404);

      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('POST /v1/orgs/:orgId/invitations/:id/resend (Resend invitation)', () => {
    it('renews the token, resets 7-day expiration, and resends E-04', async () => {
      vi.mocked(repos.invitations.findById).mockResolvedValueOnce({
        id: 'inv-123',
        orgId,
        email: 'colleague@example.com',
        role: 'member',
        siteIds: [],
        tokenHash: 'hash-old',
        invitedBy: adminId,
        expiresAt: new Date(Date.now() + 500000),
        acceptedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/invitations/inv-123/resend`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.inviteUrl).toContain('/invitations/');
      expect(repos.invitations.renew).toHaveBeenCalledWith(orgId, 'inv-123');
    });
  });

  describe('GET /v1/invitations/:token (Public check)', () => {
    it('returns invitation details for a valid token', async () => {
      vi.mocked(repos.invitations.findByToken).mockResolvedValueOnce({
        invitation: {
          id: 'inv-valid',
          orgId,
          email: 'colleague@example.com',
          role: 'member',
          siteIds: [],
          tokenHash: 'hash',
          invitedBy: adminId,
          expiresAt: new Date(Date.now() + 500000),
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        org: {
          id: orgId,
          name: 'Brightline Studio',
          slug: 'brightline',
        },
        inviter: {
          name: 'Daniel Mwangi',
          email: 'daniel@brightline.studio',
        },
        isValid: true,
        isExpired: false,
        isAccepted: false,
        isRevoked: false,
      });

      const res = await request(app).get('/v1/invitations/raw-tok-123').expect(200);

      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.orgName).toBe('Brightline Studio');
      expect(res.body.data.email).toBe('colleague@example.com');
    });

    it('returns 410 INVITATION_EXPIRED when invitation has expired after 7 days', async () => {
      vi.mocked(repos.invitations.findByToken).mockResolvedValueOnce({
        invitation: {} as never,
        org: {} as never,
        inviter: null,
        isValid: false,
        isExpired: true,
        isAccepted: false,
        isRevoked: false,
      });

      const res = await request(app).get('/v1/invitations/expired-tok').expect(410);

      expect(res.body.error.code).toBe(ErrorCode.INVITATION_EXPIRED);
    });

    it('returns 400 INVITATION_REVOKED when invitation was revoked', async () => {
      vi.mocked(repos.invitations.findByToken).mockResolvedValueOnce({
        invitation: {} as never,
        org: {} as never,
        inviter: null,
        isValid: false,
        isExpired: false,
        isAccepted: false,
        isRevoked: true,
      });

      const res = await request(app).get('/v1/invitations/revoked-tok').expect(400);

      expect(res.body.error.code).toBe(ErrorCode.INVITATION_REVOKED);
    });

    it('returns 400 INVITATION_ALREADY_ACCEPTED when token already used', async () => {
      vi.mocked(repos.invitations.findByToken).mockResolvedValueOnce({
        invitation: {} as never,
        org: {} as never,
        inviter: null,
        isValid: false,
        isExpired: false,
        isAccepted: true,
        isRevoked: false,
      });

      const res = await request(app).get('/v1/invitations/accepted-tok').expect(400);

      expect(res.body.error.code).toBe(ErrorCode.INVITATION_ALREADY_ACCEPTED);
    });
  });

  describe('POST /v1/invitations/accept (Accept invitation)', () => {
    it('accepts invitation, adds membership, and consumes single-use token', async () => {
      vi.mocked(repos.invitations.findByToken).mockResolvedValueOnce({
        invitation: {
          id: 'inv-to-accept',
          orgId,
          email: 'colleague@example.com',
          role: 'member',
          siteIds: [],
          tokenHash: 'hash',
          invitedBy: adminId,
          expiresAt: new Date(Date.now() + 500000),
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        org: {
          id: orgId,
          name: 'Brightline Studio',
          slug: 'brightline',
        },
        inviter: null,
        isValid: true,
        isExpired: false,
        isAccepted: false,
        isRevoked: false,
      });

      const res = await request(app)
        .post('/v1/invitations/accept')
        .set('Cookie', adminCookie)
        .send({ token: 'raw-tok-accept' })
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.orgSlug).toBe('brightline');
      expect(repos.invitations.markAccepted).toHaveBeenCalledWith('inv-to-accept');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'invitation.accepted',
        }),
      );
    });
  });
});
