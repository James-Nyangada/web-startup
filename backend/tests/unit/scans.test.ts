import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { assertCrossOrg404 } from '../helpers/cross-org.js';
import { buildTestApp } from '../helpers/fakes.js';

function createMockAuth(userId: string) {
  const mockUser = {
    id: userId,
    email: `${userId}@example.com`,
    name: `User ${userId}`,
    isStaff: false,
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
    getSession: vi.fn(
      ({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
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
      },
    ),
  };
  return {
    mockUser,
    mockSession,
    api,
  } as unknown as Auth;
}

describe('Scans API & Onboarding Scans (Section 7.4 & Chunk P2-05)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const otherOrgId = '22222222-2222-4222-a222-222222222222';
  const siteId = 'site-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const scanId = 'scan-bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
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
    verifyMethod: 'meta' as const,
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
    score: 84,
    lastScanId: null,
    nextScanAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockScan = {
    id: scanId,
    orgId,
    siteId,
    trigger: 'onboarding' as const,
    status: 'queued' as const,
    queuedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    pagesDiscovered: 10,
    pagesPlanned: 10,
    pagesScanned: 0,
    pagesFailed: 0,
    templatesFound: 4,
    axeVersion: '4.14.0',
    engineVersion: '1.0.0',
    standard: 'wcag22aa' as const,
    score: null,
    counts: {},
    rawKey: null,
    errorCode: null,
    errorMessage: null,
    requestedBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repos: Repositories;
  let app: Express;
  const adminCookie = `better-auth.session_token=token-${userId}`;

  beforeEach(() => {
    const auth = createMockAuth(userId);
    const testApp = buildTestApp({ auth });
    repos = testApp.repos;
    app = testApp.app;

    vi.mocked(repos.organizations.findById).mockImplementation((id: string) =>
      Promise.resolve(id === orgId ? (mockOrg as never) : null),
    );
    vi.mocked(repos.organizations.findByIdOrSlug).mockImplementation((idOrSlug: string) =>
      Promise.resolve(idOrSlug === orgId || idOrSlug === mockOrg.slug ? (mockOrg as never) : null),
    );
    vi.mocked(repos.memberships.find).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(
        oid === orgId && uid === userId
          ? ({
              id: 'mem-1',
              orgId,
              userId,
              role: 'admin',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as never)
          : null,
      ),
    );
    vi.mocked(repos.memberships.findRole).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(oid === orgId && uid === userId ? 'admin' : null),
    );
  });

  describe('POST /v1/orgs/:orgId/sites/:siteId/scans', () => {
    it('triggers manual scan for verified site', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
      vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValue(null);
      vi.mocked(repos.scans.create).mockResolvedValue({
        ...mockScan,
        trigger: 'manual',
        pagesPlanned: 50,
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', adminCookie)
        .send({ trigger: 'manual' })
        .expect(201);

      expect(res.body.data.scan.trigger).toBe('manual');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'scan.triggered', targetId: scanId }),
      );
    });

    it('allows 10-page onboarding scan on unverified site', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        ...mockSite,
        status: 'pending_verification',
      });
      vi.mocked(repos.scans.countOnboardingScansForSite).mockResolvedValue(0);
      vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValue(null);
      vi.mocked(repos.scans.create).mockResolvedValue(mockScan);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', adminCookie)
        .send({ trigger: 'onboarding' })
        .expect(201);

      expect(res.body.data.scan.trigger).toBe('onboarding');
      expect(res.body.data.scan.pagesPlanned).toBe(10);
    });

    it('blocks manual scan on unverified site with 422', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        ...mockSite,
        status: 'pending_verification',
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', adminCookie)
        .send({ trigger: 'manual' })
        .expect(422);

      expect(res.body.error.message).toContain('Unverified sites can only run one onboarding scan');
    });

    it('blocks second onboarding scan on unverified site with 422', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        ...mockSite,
        status: 'pending_verification',
      });
      vi.mocked(repos.scans.countOnboardingScansForSite).mockResolvedValue(1);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', adminCookie)
        .send({ trigger: 'onboarding' })
        .expect(422);

      expect(res.body.error.message).toContain('already completed its unverified onboarding scan');
    });

    it('returns 409 SCAN_IN_PROGRESS when another scan is running on the site', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
      vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValue({
        ...mockScan,
        status: 'scanning',
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', adminCookie)
        .send({ trigger: 'manual' })
        .expect(409);

      expect(res.body.error.code).toBe(ErrorCode.SCAN_IN_PROGRESS);
    });

    it('returns 404 for cross-org scan creation', async () => {
      await assertCrossOrg404(app, {
        method: 'post',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}/scans`,
        sessionCookie: adminCookie,
        body: { trigger: 'manual' },
      });
    });
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId/scans', () => {
    it('returns paginated scans list for site', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
      vi.mocked(repos.scans.listBySite).mockResolvedValue([mockScan]);
      vi.mocked(repos.scans.countBySite).mockResolvedValue(1);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.scans).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('returns 404 for cross-org scans list request', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}/scans`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/scans/:scanId', () => {
    it('returns scan detail with diff (regressed first) and counts', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValue({
        ...mockScan,
        status: 'completed',
        score: 85,
        counts: { critical: 1, serious: 2, moderate: 0, minor: 0, new: 1, fixed: 1, regressed: 1 },
      });

      const mockDiff = {
        regressed: [
          {
            id: 'issue-reg',
            ruleId: 'color-contrast',
            title: 'Color contrast',
            impact: 'serious' as const,
            wcagCriteria: ['1.4.3'],
            wcagLevel: 'AA' as const,
            templateKey: 'product',
            selector: 'button.checkout',
            occurrenceCount: 2,
            status: 'open' as const,
            isRegression: true,
            regressionCount: 1,
          },
        ],
        new: [
          {
            id: 'issue-new',
            ruleId: 'image-alt',
            title: 'Image alternative text',
            impact: 'critical' as const,
            wcagCriteria: ['1.1.1'],
            wcagLevel: 'A' as const,
            templateKey: 'product',
            selector: 'img.hero',
            occurrenceCount: 1,
            status: 'open' as const,
            isRegression: false,
            regressionCount: 0,
          },
        ],
        fixed: [
          {
            id: 'issue-fix',
            ruleId: 'label',
            title: 'Form label',
            impact: 'serious' as const,
            wcagCriteria: ['1.3.1'],
            wcagLevel: 'A' as const,
            templateKey: 'cart',
            selector: 'input#qty',
            occurrenceCount: 0,
            status: 'fixed' as const,
            isRegression: false,
            regressionCount: 0,
          },
        ],
      };

      vi.mocked(repos.issues.getScanDiff).mockResolvedValue(mockDiff);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/scans/${scanId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.scan.id).toBe(scanId);
      expect(res.body.data.diff.regressed).toHaveLength(1);
      expect(res.body.data.diff.new).toHaveLength(1);
      expect(res.body.data.diff.fixed).toHaveLength(1);
      // Verify regressed is first
      expect(res.body.data.diff.regressed[0].id).toBe('issue-reg');
    });

    it('returns failure reason and whatToDo hint for partial scan', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValue({
        ...mockScan,
        status: 'partial',
        pagesScanned: 20,
        pagesPlanned: 50,
        pagesFailed: 30,
        score: 72,
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/scans/${scanId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.hint).toBeDefined();
      expect(res.body.data.hint.reason).toContain('30 of 50 planned pages');
      expect(res.body.data.hint.whatToDo).toContain('Partial scans never mark issues as fixed');
    });

    it('returns failure reason and whatToDo hint for failed scan with error code', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValue({
        ...mockScan,
        status: 'failed',
        errorCode: 'RATE_LIMITED_429',
        errorMessage: 'Server returned HTTP 429 Too Many Requests.',
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/scans/${scanId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.hint).toBeDefined();
      expect(res.body.data.hint.reason).toContain('rate-limited or blocked');
      expect(res.body.data.hint.whatToDo).toContain('allowlist');
    });

    it('returns 404 for cross-org scan detail', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/scans/${scanId}`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/scans/:scanId/pages', () => {
    it('returns per-page scan results', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValue(mockScan);
      vi.mocked(repos.pages.listResultsByScan).mockResolvedValue([
        {
          id: 'res-1',
          pageId: 'page-1',
          url: 'https://oakhaus.com/products/table',
          templateKey: 'product',
          title: 'Dining Table',
          status: 'ok',
          httpStatus: 200,
          loadMs: 420,
          violations: 3,
          passes: 45,
          incomplete: 1,
          score: 82,
          screenshotKey: null,
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/scans/${scanId}/pages`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.pages).toHaveLength(1);
      expect(res.body.data.pages[0].url).toBe('https://oakhaus.com/products/table');
      expect(res.body.data.pages[0].loadMs).toBe(420);
    });

    it('returns 404 for cross-org scan pages', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/scans/${scanId}/pages`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/scans/:scanId/raw', () => {
    it('returns raw key and download URL for admin', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValue({
        ...mockScan,
        rawKey: 'raw-scans/scan-123.json',
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/scans/${scanId}/raw`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.rawKey).toBe('raw-scans/scan-123.json');
      expect(res.body.data.downloadUrl).toContain('/storage/raw-scans/scan-123.json');
    });

    it('returns 404 for cross-org raw scan download', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/scans/${scanId}/raw`,
        sessionCookie: adminCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/scans/:scanId/events (SSE stream)', () => {
    it('establishes text/event-stream connection and sends initial event', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValue({
        ...mockScan,
        status: 'completed',
        score: 88,
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/scans/${scanId}/events`)
        .set('Cookie', adminCookie)
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      expect(res.headers['x-accel-buffering']).toBe('no');
      expect(res.text).toContain('"scanId"');
      expect(res.text).toContain('event: complete');
    });

    it('returns 404 for cross-org SSE connection', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/scans/${scanId}/events`,
        sessionCookie: adminCookie,
      });
    });
  });
});
