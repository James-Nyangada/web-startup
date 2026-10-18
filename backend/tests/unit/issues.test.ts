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

describe('Issues API (Chunk P2-12, Screen S-25, Section 7.5)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const otherOrgId = '22222222-2222-4222-a222-222222222222';
  const siteId = 'site-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userId = 'user-member-123';

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

  const sampleIssue = {
    id: 'issue-1',
    orgId,
    siteId,
    fingerprint: 'fp-color-contrast-1',
    ruleId: 'color-contrast',
    title: 'Elements must have sufficient color contrast',
    description: 'Ensures the contrast between foreground and background colors meets WCAG 2 AA thresholds',
    impact: 'serious' as const,
    wcagCriteria: ['1.4.3'],
    wcagLevel: 'AA' as const,
    templateKey: 'product',
    selector: 'button.add-to-cart',
    htmlSnippet: '<button class="add-to-cart">Add to cart</button>',
    failureSummary: 'Element has insufficient color contrast of 3.2:1 (expected 4.5:1)',
    status: 'open' as const,
    ignoredReason: null,
    ignoredNote: null,
    ignoredBy: null,
    ignoredAt: null,
    whoIsAffected: 'People with low vision or color blindness',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/color-contrast',
    isRegression: false,
    regressionCount: 0,
    occurrenceCount: 14,
    assigneeId: null,
    assigneeName: null,
    dueDate: null,
    needsReview: false,
    firstSeenScanId: 'scan-1',
    lastSeenScanId: 'scan-2',
    fixedScanId: null,
    fixedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };

  let repos: Repositories;
  let app: Express;
  let memberAuth: ReturnType<typeof createMockAuth>;
  const memberCookie = `better-auth.session_token=token-${userId}`;

  beforeEach(() => {
    memberAuth = createMockAuth(userId);
    const testApp = buildTestApp({ auth: memberAuth });
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
          ? ({ orgId, userId, role: 'member', createdAt: new Date(), updatedAt: new Date() } as never)
          : null,
      ),
    );
    vi.mocked(repos.memberships.findRole).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(oid === orgId && uid === userId ? 'member' : null),
    );
    vi.mocked(repos.sites.findById).mockImplementation((oid: string, sid: string) =>
      Promise.resolve(oid === orgId && sid === siteId ? (mockSite as never) : null),
    );
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId/issues', () => {
    it('returns paginated issues and facets for valid requests', async () => {
      vi.mocked(repos.issues.listBySite).mockResolvedValue([sampleIssue]);
      vi.mocked(repos.issues.countBySite).mockResolvedValue(1);
      vi.mocked(repos.issues.getSeverityCounts).mockResolvedValue({
        critical: 0,
        serious: 1,
        moderate: 0,
        minor: 0,
      });
      vi.mocked(repos.issues.listTemplatesBySite).mockResolvedValue([
        { templateKey: 'product', count: 1 },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/issues?limit=20&page=1`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe('issue-1');
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(20);
      expect(res.body.data.totalPages).toBe(1);
      expect(res.body.data.facets.severityCounts.serious).toBe(1);
      expect(res.body.data.facets.templates[0].templateKey).toBe('product');
    });

    it('groups issues by rule when group=rule is specified', async () => {
      const issue2 = {
        ...sampleIssue,
        id: 'issue-2',
        templateKey: 'cart',
        occurrenceCount: 5,
      };

      vi.mocked(repos.issues.listBySite).mockResolvedValue([sampleIssue, issue2]);
      vi.mocked(repos.issues.countBySite).mockResolvedValue(2);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/issues?group=rule`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(res.body.data.groups).toHaveLength(1);
      expect(res.body.data.groups[0].ruleId).toBe('color-contrast');
      expect(res.body.data.groups[0].issueCount).toBe(2);
      expect(res.body.data.groups[0].totalOccurrences).toBe(19);
      expect(res.body.data.groups[0].items).toHaveLength(2);
    });

    it('groups issues by template when group=template is specified', async () => {
      const issue2 = {
        ...sampleIssue,
        id: 'issue-2',
        templateKey: 'product',
        ruleId: 'image-alt',
        title: 'Images must have alternate text',
        occurrenceCount: 3,
      };

      vi.mocked(repos.issues.listBySite).mockResolvedValue([sampleIssue, issue2]);
      vi.mocked(repos.issues.countBySite).mockResolvedValue(2);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/issues?group=template`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(res.body.data.groups).toHaveLength(1);
      expect(res.body.data.groups[0].templateKey).toBe('product');
      expect(res.body.data.groups[0].issueCount).toBe(2);
      expect(res.body.data.groups[0].totalOccurrences).toBe(17);
    });

    it('handles server pagination for 2,000 issues and stays responsive (spec acceptance criterion)', async () => {
      // Simulate 2,000 issues in DB, requesting page 2 with limit 50
      const mock50Issues = Array.from({ length: 50 }, (_, i) => ({
        ...sampleIssue,
        id: `issue-${50 + i}`,
        fingerprint: `fp-${50 + i}`,
      }));

      vi.mocked(repos.issues.listBySite).mockResolvedValue(mock50Issues);
      vi.mocked(repos.issues.countBySite).mockResolvedValue(2000);

      const startTime = Date.now();
      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/issues?page=2&limit=50&group=none`)
        .set('Cookie', memberCookie)
        .expect(200);
      const elapsedMs = Date.now() - startTime;

      expect(res.body.data.items).toHaveLength(50);
      expect(res.body.data.total).toBe(2000);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.limit).toBe(50);
      expect(res.body.data.totalPages).toBe(40);
      expect(elapsedMs).toBeLessThan(500); // Super responsive server response
    });

    it('forwards filters (status, impact, template, rule, search, wcag, regression) to repository', async () => {
      vi.mocked(repos.issues.listBySite).mockResolvedValue([sampleIssue]);
      vi.mocked(repos.issues.countBySite).mockResolvedValue(1);

      await request(app)
        .get(
          `/v1/orgs/${orgId}/sites/${siteId}/issues?status=open&impact=critical,serious&template=product&rule=color-contrast&isRegression=true&needsReview=false&q=contrast&wcag=1.4.3&sort=occurrences&order=desc`,
        )
        .set('Cookie', memberCookie)
        .expect(200);

      expect(repos.issues.listBySite).toHaveBeenCalledWith(
        orgId,
        siteId,
        expect.objectContaining({
          status: ['open'],
          impact: ['critical', 'serious'],
          templateKey: 'product',
          ruleId: 'color-contrast',
          isRegression: true,
          needsReview: false,
          search: 'contrast',
          wcag: '1.4.3',
        }),
        expect.objectContaining({
          sort: 'occurrences',
          order: 'desc',
        }),
      );
    });

    it('returns 404 when site does not exist', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(null);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/non-existent-site/issues`)
        .set('Cookie', memberCookie)
        .expect(404);

      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns 404, never 403, for cross-org access', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/sites/${siteId}/issues`,
        sessionCookie: memberCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/issues/:issueId', () => {
    it('returns issue detail for valid issue', async () => {
      vi.mocked(repos.issues.findById).mockResolvedValue(sampleIssue);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/issues/issue-1`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(res.body.data.issue.id).toBe('issue-1');
      expect(res.body.data.issue.ruleId).toBe('color-contrast');
    });

    it('returns 404 when issue not found', async () => {
      vi.mocked(repos.issues.findById).mockResolvedValue(null);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/issues/non-existent-issue`)
        .set('Cookie', memberCookie)
        .expect(404);

      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns 404 for cross-org access to issue detail', async () => {
      await assertCrossOrg404(app, {
        method: 'get',
        path: `/v1/orgs/${otherOrgId}/issues/issue-1`,
        sessionCookie: memberCookie,
      });
    });
  });

  describe('GET /v1/orgs/:orgId/issues', () => {
    it('returns cross-site issues for assignee=me', async () => {
      vi.mocked(repos.issues.listCrossSite).mockResolvedValue([
        {
          id: 'issue-1',
          siteId,
          ruleId: 'color-contrast',
          title: 'Color contrast',
          impact: 'serious',
          templateKey: 'product',
          status: 'open',
          occurrenceCount: 14,
          assigneeId: userId,
          dueDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/issues?assignee=me`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(repos.issues.listCrossSite).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ assigneeId: userId }),
        expect.anything(),
      );
    });
  });
});
