import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import { slugify } from '../../src/lib/slugs.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { assertCrossOrg404 } from '../helpers/cross-org.js';
import { buildTestApp } from '../helpers/fakes.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';

describe('slugify', () => {
  it('converts names to clean slugs', () => {
    expect(slugify('Acme Store')).toBe('acme-store');
    expect(slugify('  My Awesome Shop! & Co. ')).toBe('my-awesome-shop-co');
    expect(slugify('Café & Restaurant')).toBe('caf-restaurant');
    expect(slugify('---hello---world---')).toBe('hello-world');
  });

  it('falls back to "org" for empty or symbol-only names', () => {
    expect(slugify('')).toBe('org');
    expect(slugify('!@#$%^&*()')).toBe('org');
  });
});

function createMockAuth(userId = 'user-owner', isStaff = false) {
  const mockUser = {
    id: userId,
    email: `${userId}@example.com`,
    name: 'Test User',
    emailVerifiedAt: new Date(),
    avatarUrl: null,
    timeZone: 'UTC',
    isStaff,
    lastActiveOrgId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockSession = {
    id: `session-${userId}`,
    userId: mockUser.id,
    token: `token-${userId}`,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const api = {
    getSession: vi.fn().mockImplementation(({ headers }: { headers?: Headers | Record<string, string | undefined> }) => {
      let cookie: string | null = null;
      if (headers instanceof Headers) {
        cookie = headers.get('cookie');
      } else if (headers && typeof headers === 'object' && 'cookie' in headers) {
        cookie = (headers.cookie as string) ?? null;
      }
      if (cookie && cookie.includes(`token-${userId}`)) {
        return Promise.resolve({ user: mockUser, session: mockSession });
      }
      return Promise.resolve(null);
    }),
  };

  return { api, mockUser, mockSession } as unknown as Auth & {
    api: typeof api;
    mockUser: typeof mockUser;
    mockSession: typeof mockSession;
  };
}

describe('organisations router and authorization core', () => {
  let ownerAuth: ReturnType<typeof createMockAuth>;
  let memberAuth: ReturnType<typeof createMockAuth>;
  let otherOrgUserAuth: ReturnType<typeof createMockAuth>;
  let staffAuth: ReturnType<typeof createMockAuth>;

  const orgA = {
    id: '11111111-1111-4111-a111-111111111111',
    name: 'Org A Corp',
    slug: 'org-a-corp',
    plan: 'trial' as const,
    billingStatus: 'trialing' as const,
    trialEndsAt: new Date(Date.now() + 14 * 86400000),
    paddleCustomerId: null,
    timeZone: 'UTC',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    ownerAuth = createMockAuth('user-owner', false);
    memberAuth = createMockAuth('user-member', false);
    otherOrgUserAuth = createMockAuth('user-other-org', false);
    staffAuth = createMockAuth('user-staff', true);
  });

  describe('POST /v1/orgs', () => {
    it('returns 401 when unauthenticated', async () => {
      const { app } = buildTestApp({ auth: ownerAuth });
      const res = await request(app).post('/v1/orgs').send({ name: 'New Org' }).expect(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('returns 400 when name is missing', async () => {
      const { app } = buildTestApp({ auth: ownerAuth });
      const res = await request(app)
        .post('/v1/orgs')
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('creates organisation, starts 14-day trial, and adds owner', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });

      vi.mocked(repos.organizations.isSlugAvailable).mockResolvedValue(true);
      vi.mocked(repos.organizations.createWithInitialOwner).mockResolvedValue({
        org: orgA,
        membership: {
          id: 'mem-1',
          orgId: orgA.id,
          userId: ownerAuth.mockUser.id,
          role: 'owner',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const res = await request(app)
        .post('/v1/orgs')
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({
          name: 'Org A Corp',
          type: 'agency',
          timeZone: 'Europe/London',
        })
        .expect(201);

      expect(res.body.data.org.name).toBe('Org A Corp');
      expect(res.body.data.membership.role).toBe('owner');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        asOrgId(orgA.id),
        expect.objectContaining({ action: 'org.created' }),
      );
    });

    it('increments candidate slug if base slug is already taken', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });

      // First call false (base taken), second call true (suffix 2 available)
      vi.mocked(repos.organizations.isSlugAvailable)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      vi.mocked(repos.organizations.createWithInitialOwner).mockResolvedValue({
        org: { ...orgA, slug: 'org-a-corp-2' },
        membership: {
          id: 'mem-1',
          orgId: orgA.id,
          userId: ownerAuth.mockUser.id,
          role: 'owner',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const res = await request(app)
        .post('/v1/orgs')
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ name: 'Org A Corp' })
        .expect(201);

      expect(res.body.data.org.slug).toBe('org-a-corp-2');
    });
  });

  describe('resolveOrgContext and Cross-Org 404 security requirement', () => {
    it('returns 404 when org does not exist', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(null);

      const res = await request(app)
        .get('/v1/orgs/nonexistent')
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .expect(404);

      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns 404 (NEVER 403) when user belongs to another org (cross-org check)', async () => {
      const { app, repos } = buildTestApp({ auth: otherOrgUserAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue(null);

      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${orgA.id}`,
        sessionCookie: 'better-auth.session_token=token-user-other-org',
      });
    });

    it('returns 404 on write actions across orgs', async () => {
      const { app, repos } = buildTestApp({ auth: otherOrgUserAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue(null);

      await assertCrossOrg404(app, {
        method: 'patch',
        path: `/v1/orgs/${orgA.id}`,
        sessionCookie: 'better-auth.session_token=token-user-other-org',
        body: { name: 'Hack attempt' },
      });

      await assertCrossOrg404(app, {
        method: 'delete',
        path: `/v1/orgs/${orgA.id}`,
        sessionCookie: 'better-auth.session_token=token-user-other-org',
      });
    });

    it('allows staff users cross-org access', async () => {
      const { app, repos } = buildTestApp({ auth: staffAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue(null);

      const res = await request(app)
        .get(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-staff')
        .expect(200);

      expect(res.body.data.org.id).toBe(orgA.id);
    });

    it('resolves organisation by slug or by UUID', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const resSlug = await request(app)
        .get(`/v1/orgs/${orgA.slug}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .expect(200);

      expect(resSlug.body.data.org.slug).toBe(orgA.slug);
      expect(repos.organizations.findByIdOrSlug).toHaveBeenCalledWith(orgA.slug);
    });
  });

  describe('requireOrgRole permissions', () => {
    it('member can access GET /v1/orgs/:orgId', async () => {
      const { app, repos } = buildTestApp({ auth: memberAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-2',
        orgId: orgA.id,
        userId: memberAuth.mockUser.id,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-member')
        .expect(200);

      expect(res.body.data.membership.role).toBe('member');
    });

    it('member receives 403 on admin routes (PATCH /v1/orgs/:orgId)', async () => {
      const { app, repos } = buildTestApp({ auth: memberAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-2',
        orgId: orgA.id,
        userId: memberAuth.mockUser.id,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-member')
        .send({ name: 'New Name' })
        .expect(403);

      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('admin receives 403 on owner-only routes (DELETE /v1/orgs/:orgId)', async () => {
      const adminAuth = createMockAuth('user-admin', false);
      const { app, repos } = buildTestApp({ auth: adminAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-3',
        orgId: orgA.id,
        userId: adminAuth.mockUser.id,
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-admin')
        .send({ confirmName: orgA.name })
        .expect(403);

      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('PATCH /v1/orgs/:orgId', () => {
    it('updates organisation and writes audit log', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.organizations.update).mockResolvedValue({
        ...orgA,
        name: 'Updated Org Name',
      });

      const res = await request(app)
        .patch(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ name: 'Updated Org Name' })
        .expect(200);

      expect(res.body.data.org.name).toBe('Updated Org Name');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        asOrgId(orgA.id),
        expect.objectContaining({ action: 'org.updated' }),
      );
    });

    it('returns 409 if requested slug is already taken', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.organizations.isSlugAvailable).mockResolvedValue(false);

      const res = await request(app)
        .patch(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ slug: 'already-taken' })
        .expect(409);

      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
    });
  });

  describe('DELETE /v1/orgs/:orgId', () => {
    it('requires exact confirmName matching organisation name', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ confirmName: 'Wrong Name' })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('soft deletes organisation when confirmed', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.organizations.softDelete).mockResolvedValue({
        ...orgA,
        deletedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/v1/orgs/${orgA.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ confirmName: orgA.name })
        .expect(200);

      expect(res.body.data.success).toBe(true);
      expect(repos.organizations.softDelete).toHaveBeenCalledWith(asOrgId(orgA.id));
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        asOrgId(orgA.id),
        expect.objectContaining({ action: 'org.deleted' }),
      );
    });
  });

  describe('POST /v1/orgs/:orgId/transfer-ownership', () => {
    it('transfers ownership to another member and demotes owner to admin', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockImplementation((_orgId, userId) => {
        if (userId === ownerAuth.mockUser.id) {
          return Promise.resolve({
            id: 'mem-1',
            orgId: orgA.id,
            userId: ownerAuth.mockUser.id,
            role: 'owner',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (userId === '00000000-0000-4000-a000-000000000002') {
          return Promise.resolve({
            id: 'mem-2',
            orgId: orgA.id,
            userId: '00000000-0000-4000-a000-000000000002',
            role: 'admin',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgA.id}/transfer-ownership`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ newOwnerId: '00000000-0000-4000-a000-000000000002' })
        .expect(200);

      expect(res.body.data.success).toBe(true);
      expect(repos.memberships.updateRole).toHaveBeenCalledWith(
        asOrgId(orgA.id),
        ownerAuth.mockUser.id,
        'admin',
      );
      expect(repos.memberships.updateRole).toHaveBeenCalledWith(
        asOrgId(orgA.id),
        '00000000-0000-4000-a000-000000000002',
        'owner',
      );
    });
  });

  describe('members management', () => {
    it('lists organisation members', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.memberships.list).mockResolvedValue([
        { userId: ownerAuth.mockUser.id, email: 'owner@example.com', name: 'Owner', role: 'owner', joinedAt: new Date() },
        { userId: memberAuth.mockUser.id, email: 'member@example.com', name: 'Member', role: 'member', joinedAt: new Date() },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgA.id}/members`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .expect(200);

      expect(res.body.data.members).toHaveLength(2);
    });

    it('prevents demoting or removing the owner', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const patchRes = await request(app)
        .patch(`/v1/orgs/${orgA.id}/members/${ownerAuth.mockUser.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .send({ role: 'member' })
        .expect(400);

      expect(patchRes.body.error.message).toContain('Cannot change the role of the organisation owner');

      const delRes = await request(app)
        .delete(`/v1/orgs/${orgA.id}/members/${ownerAuth.mockUser.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .expect(400);

      expect(delRes.body.error.message).toContain('Cannot remove the organisation owner');
    });

    it('allows admin to remove a regular member', async () => {
      const adminAuth = createMockAuth('user-admin', false);
      const { app, repos } = buildTestApp({ auth: adminAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockImplementation((_orgId, userId) => {
        if (userId === adminAuth.mockUser.id) {
          return Promise.resolve({
            id: 'mem-admin',
            orgId: orgA.id,
            userId: adminAuth.mockUser.id,
            role: 'admin',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (userId === memberAuth.mockUser.id) {
          return Promise.resolve({
            id: 'mem-member',
            orgId: orgA.id,
            userId: memberAuth.mockUser.id,
            role: 'member',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .delete(`/v1/orgs/${orgA.id}/members/${memberAuth.mockUser.id}`)
        .set('Cookie', 'better-auth.session_token=token-user-admin')
        .expect(200);

      expect(res.body.data.success).toBe(true);
      expect(repos.memberships.remove).toHaveBeenCalledWith(asOrgId(orgA.id), memberAuth.mockUser.id);
    });
  });

  describe('GET /v1/orgs/:orgId/audit-log', () => {
    it('returns audit log entries for the organisation', async () => {
      const { app, repos } = buildTestApp({ auth: ownerAuth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(orgA);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: orgA.id,
        userId: ownerAuth.mockUser.id,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.auditLog.list).mockResolvedValue([
        {
          id: 'log-1',
          orgId: orgA.id,
          actorId: ownerAuth.mockUser.id,
          actorType: 'user',
          action: 'org.created',
          targetType: 'organization',
          targetId: orgA.id,
          ip: null,
          userAgent: null,
          data: {},
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgA.id}/audit-log`)
        .set('Cookie', 'better-auth.session_token=token-user-owner')
        .expect(200);

      expect(res.body.data.entries).toHaveLength(1);
      expect(res.body.data.entries[0].action).toBe('org.created');
    });
  });
});
