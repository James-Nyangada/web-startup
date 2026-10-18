import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { CreateSiteInput } from '../../src/db/repositories/sites.js';
import { verifyOwnership } from '../../src/scanner/verification/verify.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { assertCrossOrg404 } from '../helpers/cross-org.js';
import { buildTestApp } from '../helpers/fakes.js';

vi.mock('../../src/scanner/verification/verify.js', () => ({
  verifyOwnership: vi.fn(),
}));

function createMockAuth(userId: string, isStaff = false) {
  const mockUser = {
    id: userId,
    email: `${userId}@example.com`,
    name: `User ${userId}`,
    isStaff,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockSession = {
    id: `sess-${userId}`,
    userId,
    token: `token-${userId}`,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const api = {
    getSession: vi.fn(({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
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

describe('Sites API (Chunk P2-06 & Section 7.3)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const otherOrgId = '22222222-2222-4222-a222-222222222222';
  const siteId = 'site-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userId = 'user-admin-123';

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

  const mockSite = {
    id: siteId,
    orgId,
    name: 'Oakhaus Furniture',
    rootUrl: 'https://oakhaus.com',
    platform: 'shopify' as const,
    clientName: 'Mark Otieno',
    status: 'active' as const,
    verifyMethod: null,
    verifyToken: 'ps_test_token',
    verifiedAt: new Date(),
    scanFrequency: 'weekly' as const,
    scanDay: 1,
    scanHour: 2,
    pageLimit: 50,
    standard: 'wcag22aa' as const,
    pinnedUrls: [],
    excludedPaths: [],
    authNote: null,
    score: 78,
    lastScanId: null,
    nextScanAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repos: Repositories;
  let app: Express;
  let adminAuth: ReturnType<typeof createMockAuth>;

  const adminCookie = `better-auth.session_token=token-${userId}`;

  beforeEach(() => {
    adminAuth = createMockAuth(userId, false);
    const testApp = buildTestApp({ auth: adminAuth });
    repos = testApp.repos;
    app = testApp.app;

    // Default org and membership
    vi.mocked(repos.organizations.findById).mockImplementation((id: string) =>
      Promise.resolve(id === orgId ? (mockOrg as never) : null),
    );
    vi.mocked(repos.organizations.findByIdOrSlug).mockImplementation((idOrSlug: string) =>
      Promise.resolve(idOrSlug === orgId || idOrSlug === mockOrg.slug ? (mockOrg as never) : null),
    );
    vi.mocked(repos.memberships.find).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(
        oid === orgId && uid === userId
          ? ({ orgId, userId, role: 'admin', createdAt: new Date(), updatedAt: new Date() } as never)
          : null,
      ),
    );
    vi.mocked(repos.memberships.findRole).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(oid === orgId && uid === userId ? 'admin' : null),
    );
  });

  describe('GET /v1/orgs/:orgId/sites', () => {
    it('returns sites list for members', async () => {
      vi.mocked(repos.sites.list).mockResolvedValue([mockSite]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.sites).toHaveLength(1);
      expect(res.body.data.sites[0].name).toBe('Oakhaus Furniture');
    });

    it('returns 404 when user is not a member of the org (cross-org check)', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/sites`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('POST /v1/orgs/:orgId/sites (Add site)', () => {
    it('normalizes root URL by stripping query and subpath: https://www.example.com/shop?x=1 -> https://www.example.com', async () => {
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(null);
      vi.mocked(repos.sites.count).mockResolvedValue(1);
      vi.mocked(repos.sites.create).mockImplementation((_orgId: string, input: CreateSiteInput) =>
        Promise.resolve({
          ...mockSite,
          id: 'new-site-id',
          name: input.name,
          rootUrl: input.rootUrl,
        }),
      );

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Example Store',
          rootUrl: 'https://www.example.com/shop?x=1&utm_source=ad',
          platform: 'shopify',
        })
        .expect(201);

      expect(res.body.data.site.rootUrl).toBe('https://www.example.com');
      expect(repos.sites.create).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          rootUrl: 'https://www.example.com',
          name: 'Example Store',
        }),
      );
    });

    it('detects duplicates within org and returns 409 DUPLICATE_SITE', async () => {
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(mockSite);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Duplicate Oakhaus',
          rootUrl: 'https://oakhaus.com/collections/all',
        })
        .expect(409);

      expect(res.body.error.code).toBe(ErrorCode.DUPLICATE_SITE);
    });

    it('enforces plan limit check stub and returns 422 PLAN_LIMIT when limit reached', async () => {
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(null);
      vi.mocked(repos.sites.count).mockResolvedValue(25); // At limit

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Over Limit Store',
          rootUrl: 'https://overlimit.example.com',
        })
        .expect(422);

      expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
      expect(res.body.error.details.limit).toBe(25);
    });

    it('rejects invalid or non-http URLs with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Bad URL',
          rootUrl: 'not-a-valid-url',
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 404 for cross-org site creation', async () => {
      await assertCrossOrg404(app, {
        method: 'post',
        path: `/v1/orgs/${otherOrgId}/sites`,
        sessionCookie: adminCookie,
        body: { name: 'Store', rootUrl: 'https://test.com' },
      });
    });
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId', () => {
    it('returns site detail + trend data for members', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.site.id).toBe(siteId);
      expect(res.body.data.trend).toBeDefined();
    });

    it('returns full S-24 site overview data (score, band, topIssues, trendSummary, counts)', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        ...mockSite,
        score: 78,
      });
      vi.mocked(repos.issues.listTopIssues).mockResolvedValue([
        {
          id: 'issue-1',
          ruleId: 'color-contrast',
          title: 'Elements must have sufficient color contrast',
          impact: 'serious',
          wcagCriteria: ['1.4.3'],
          wcagLevel: 'AA',
          templateKey: 'product',
          selector: 'button.cta',
          status: 'open',
          isRegression: false,
          occurrenceCount: 12,
        },
      ]);
      vi.mocked(repos.issues.getSeverityCounts).mockResolvedValue({
        critical: 1,
        serious: 4,
        moderate: 3,
        minor: 3,
      });
      vi.mocked(repos.issues.getDiffSummary).mockResolvedValue({
        newCount: 3,
        fixedCount: 8,
        regressedCount: 1,
        sinceDate: new Date('2026-10-12T00:00:00Z'),
      });
      vi.mocked(repos.scans.listTrendScans).mockResolvedValue([
        {
          id: 'scan-1',
          score: 62,
          status: 'completed',
          counts: { total: 24 },
          finishedAt: new Date('2026-08-05T00:00:00Z'),
          queuedAt: new Date('2026-08-05T00:00:00Z'),
          pagesScanned: 50,
          pagesFailed: 0,
          pagesPlanned: 50,
        },
        {
          id: 'scan-2',
          score: 78,
          status: 'completed',
          counts: { total: 11 },
          finishedAt: new Date('2026-10-14T00:00:00Z'),
          queuedAt: new Date('2026-10-14T00:00:00Z'),
          pagesScanned: 50,
          pagesFailed: 0,
          pagesPlanned: 50,
        },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.score).toBe(78);
      expect(res.body.data.scoreBand).toBe('Needs work');
      expect(res.body.data.scoreExplanation).toBe(
        'Multiple accessibility barriers were found that require attention.',
      );
      expect(res.body.data.severityCounts).toEqual({
        critical: 1,
        serious: 4,
        moderate: 3,
        minor: 3,
      });
      expect(res.body.data.diffSummary.newCount).toBe(3);
      expect(res.body.data.diffSummary.fixedCount).toBe(8);
      expect(res.body.data.diffSummary.regressedCount).toBe(1);
      expect(res.body.data.diffSummary.sinceLabel).toBe('12 Oct');
      expect(res.body.data.topIssues).toHaveLength(1);
      expect(res.body.data.topIssues[0].ruleId).toBe('color-contrast');
      expect(res.body.data.trend).toHaveLength(2);
      expect(res.body.data.trendSummary).toContain('Score rose from 62 to 78 over 2 scans');
      expect(res.body.data.coverage).toBeDefined();
    });

    it('returns 404 when site does not exist or was deleted', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(null);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/non-existent-site`)
        .set('Cookie', adminCookie)
        .expect(404);

      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns 404, never 403, for cross-org access', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('PATCH /v1/orgs/:orgId/sites/:siteId', () => {
    it('allows admin to update site settings', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
      vi.mocked(repos.sites.update).mockResolvedValue({
        ...mockSite,
        name: 'Oakhaus Furniture Brand',
      });

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Oakhaus Furniture Brand',
          scanFrequency: 'daily',
        })
        .expect(200);

      expect(res.body.data.site.name).toBe('Oakhaus Furniture Brand');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'site.updated',
          targetId: siteId,
        }),
      );
    });

    it('forbids member role from modifying site settings (403 FORBIDDEN)', async () => {
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-member',
        orgId,
        userId,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Changed Name' })
        .expect(403);

      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('returns 404 for cross-org site update', async () => {
      await assertCrossOrg404(app, {
        method: 'patch',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}`,
        sessionCookie: adminCookie,
        body: { name: 'Cross Org Update' },
      });
    });
  });

  describe('POST /v1/orgs/:orgId/sites/:siteId/pause & resume', () => {
    it('pauses a site successfully', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
      vi.mocked(repos.sites.pause).mockResolvedValue({ ...mockSite, status: 'paused' });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/pause`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.site.status).toBe('paused');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'site.paused' }),
      );
    });

    it('resumes a site successfully', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({ ...mockSite, status: 'paused' });
      vi.mocked(repos.sites.resume).mockResolvedValue({ ...mockSite, status: 'active' });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/resume`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.site.status).toBe('active');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'site.resumed' }),
      );
    });

    it('returns 404 for cross-org pause request', async () => {
      await assertCrossOrg404(app, {
        method: 'post',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}/pause`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('DELETE /v1/orgs/:orgId/sites/:siteId (Soft delete)', () => {
    it('soft deletes a site successfully', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
      vi.mocked(repos.sites.softDelete).mockResolvedValue(mockSite);

      const res = await request(app)
        .delete(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'site.deleted' }),
      );
    });

    it('returns 404 for cross-org delete request', async () => {
      await assertCrossOrg404(app, {
        method: 'delete',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId/verification', () => {
    it('returns token and instructions for meta, dns, and file methods', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/verification`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.verifyToken).toBe('ps_test_token');
      expect(res.body.data.methods.meta.tag).toBe('<meta name="plainsight-verify" content="ps_test_token">');
      expect(res.body.data.methods.dns.value).toBe('plainsight-verify=ps_test_token');
      expect(res.body.data.methods.file.path).toBe('/.well-known/plainsight-verify.txt');
    });

    it('returns 404 for cross-org verification info request', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}/verification`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('POST /v1/orgs/:orgId/sites/:siteId/verify', () => {
    it('successfully verifies ownership via meta tag and updates site status', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        ...mockSite,
        status: 'pending_verification',
      });
      vi.mocked(verifyOwnership).mockResolvedValue({
        ok: true,
        method: 'meta',
      });
      vi.mocked(repos.sites.setVerified).mockResolvedValue({
        ...mockSite,
        status: 'active',
        verifyMethod: 'meta',
        verifiedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/verify`)
        .set('Cookie', adminCookie)
        .send({ method: 'meta' })
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.method).toBe('meta');
      expect(repos.sites.setVerified).toHaveBeenCalledWith(orgId, siteId, 'meta');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'site.verified' }),
      );
    });

    it('returns 400 VERIFICATION_FAILED with details when verification check fails', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        ...mockSite,
        status: 'pending_verification',
      });
      vi.mocked(verifyOwnership).mockResolvedValue({
        ok: false,
        method: 'meta',
        reason: "No meta tag with name='plainsight-verify' was found on your home page.",
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/verify`)
        .set('Cookie', adminCookie)
        .send({ method: 'meta' })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VERIFICATION_FAILED);
      expect(res.body.error.message).toContain("No meta tag with name='plainsight-verify' was found");
    });

    it('rejects invalid verification method with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/verify`)
        .set('Cookie', adminCookie)
        .send({ method: 'invalid_method' })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 404 for cross-org verify request', async () => {
      await assertCrossOrg404(app, {
        method: 'post',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}/verify`,
        sessionCookie: adminCookie,
        body: { method: 'meta' },
      });
    });
  });

  describe('POST /v1/sites/detect-platform', () => {
    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/v1/sites/detect-platform')
        .set('Cookie', adminCookie)
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/v1/sites/detect-platform')
        .send({ url: 'https://shopify.com' })
        .expect(401);

      expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });
});
