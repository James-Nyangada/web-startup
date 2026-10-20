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
    pastDueSince: null,
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
    description:
      'Ensures the contrast between foreground and background colors meets WCAG 2 AA thresholds',
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
          ? ({
              orgId,
              userId,
              role: 'member',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as never)
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

  describe('Issue Detail Sub-resources (Chunk P2-13, Screen S-26)', () => {
    const mockIssueDetail = {
      id: 'issue-1',
      orgId,
      siteId,
      fingerprint: 'fp-1',
      ruleId: 'color-contrast',
      title: 'Elements must have sufficient color contrast',
      description:
        'Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast thresholds',
      whoIsAffected: 'People with low vision',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/color-contrast',
      impact: 'serious' as const,
      wcagCriteria: ['1.4.3'],
      wcagLevel: 'AA' as const,
      templateKey: 'product',
      selector: '.product-card button',
      htmlSnippet: '<button class="bg-gray text-white">Buy</button>',
      failureSummary:
        'Fix any of the following: Element has insufficient color contrast of 2.8:1 (foreground color: #ffffff, background color: #aaaaaa, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1',
      status: 'open' as const,
      ignoredReason: null,
      ignoredNote: null,
      ignoredBy: null,
      ignoredAt: null,
      isRegression: false,
      regressionCount: 0,
      occurrenceCount: 2,
      assigneeId: null,
      assigneeName: null,
      dueDate: null,
      needsReview: false,
      firstSeenScanId: 'scan-1',
      lastSeenScanId: 'scan-2',
      fixedScanId: null,
      fixedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      vi.mocked(repos.issues.findById).mockResolvedValue(mockIssueDetail);
    });

    describe('GET /v1/orgs/:orgId/sites/:siteId/issues/:issueId', () => {
      it('returns issue detail under site-scoped route', async () => {
        const res = await request(app)
          .get(`/v1/orgs/${orgId}/sites/${siteId}/issues/issue-1`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.body.data.issue.id).toBe('issue-1');
        expect(res.body.data.issue.title).toBe('Elements must have sufficient color contrast');
      });

      it('returns 404 when siteId does not match issue siteId', async () => {
        const res = await request(app)
          .get(`/v1/orgs/${orgId}/sites/site-mismatched/issues/issue-1`)
          .set('Cookie', memberCookie)
          .expect(404);

        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      });
    });

    describe('GET /v1/orgs/:orgId/issues/:issueId/occurrences', () => {
      it('returns paginated occurrences for the issue', async () => {
        vi.mocked(repos.issues.listOccurrences).mockResolvedValue([
          {
            id: 'occ-1',
            issueId: 'issue-1',
            pageId: 'page-1',
            url: 'https://example.com/products/item-1',
            pageTitle: 'Item 1',
            templateKey: 'product',
            target: '.product-card button',
            scanId: 'scan-2',
            createdAt: new Date(),
          },
          {
            id: 'occ-2',
            issueId: 'issue-1',
            pageId: 'page-2',
            url: 'https://example.com/products/item-2',
            pageTitle: 'Item 2',
            templateKey: 'product',
            target: '.product-card button',
            scanId: 'scan-2',
            createdAt: new Date(),
          },
        ]);
        vi.mocked(repos.issues.countOccurrences).mockResolvedValue(2);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/issues/issue-1/occurrences?limit=10&page=1`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.total).toBe(2);
        expect(res.body.data.page).toBe(1);
        expect(res.body.data.totalPages).toBe(1);
        expect(repos.issues.listOccurrences).toHaveBeenCalledWith(orgId, 'issue-1', {
          limit: 10,
          offset: 0,
        });
      });

      it('returns 404 when issue not found', async () => {
        vi.mocked(repos.issues.findById).mockResolvedValue(null);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/issues/missing-issue/occurrences`)
          .set('Cookie', memberCookie)
          .expect(404);

        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      });

      it('returns 404 on cross-org occurrences request', async () => {
        await assertCrossOrg404(app, {
          method: 'get',
          path: `/v1/orgs/${otherOrgId}/issues/issue-1/occurrences`,
          sessionCookie: memberCookie,
        });
      });
    });

    describe('GET /v1/orgs/:orgId/issues/:issueId/events', () => {
      it('returns timeline events for the issue', async () => {
        vi.mocked(repos.issues.listEvents).mockResolvedValue([
          {
            id: 'event-1',
            issueId: 'issue-1',
            type: 'created',
            actorId: null,
            actorName: null,
            scanId: 'scan-1',
            data: {},
            createdAt: new Date(),
          },
          {
            id: 'event-2',
            issueId: 'issue-1',
            type: 'assigned',
            actorId: userId,
            actorName: 'User Member',
            scanId: null,
            data: { assigneeId: userId },
            createdAt: new Date(),
          },
        ]);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/issues/issue-1/events`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.items[0].type).toBe('created');
      });

      it('returns 404 when issue not found', async () => {
        vi.mocked(repos.issues.findById).mockResolvedValue(null);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/issues/missing-issue/events`)
          .set('Cookie', memberCookie)
          .expect(404);

        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      });
    });

    describe('GET & POST /v1/orgs/:orgId/issues/:issueId/notes', () => {
      it('lists notes for the issue', async () => {
        vi.mocked(repos.issues.listNotes).mockResolvedValue([
          {
            id: 'note-1',
            issueId: 'issue-1',
            authorId: userId,
            authorName: 'User Member',
            body: 'We will fix this in sprint 4.',
            visibleToClient: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/issues/issue-1/notes`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].body).toBe('We will fix this in sprint 4.');
      });

      it('creates a note for the issue', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/notes`)
          .set('Cookie', memberCookie)
          .send({
            body: 'Theme update scheduled for tomorrow.',
            visibleToClient: true,
          })
          .expect(201);

        expect(res.body.data.note).toBeDefined();
        expect(repos.issues.addNote).toHaveBeenCalledWith(
          orgId,
          'issue-1',
          userId,
          'Theme update scheduled for tomorrow.',
          true,
        );
      });

      it('validates empty body and returns 400', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/notes`)
          .set('Cookie', memberCookie)
          .send({ body: '   ' })
          .expect(400);

        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      });
    });
  });

  describe('Issue Actions (Chunk P2-14)', () => {
    beforeEach(() => {
      vi.mocked(repos.issues.findById).mockResolvedValue(sampleIssue);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId,
        userId: 'user-colleague',
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    describe('POST /v1/orgs/:orgId/issues/:issueId/ignore & /unignore', () => {
      it('successfully ignores with accepted_risk when note is provided', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/ignore`)
          .set('Cookie', memberCookie)
          .send({
            reason: 'accepted_risk',
            note: 'Design approved brand colors for secondary buttons.',
          })
          .expect(200);

        expect(res.body.data.issue).toBeDefined();
        expect(repos.issues.ignore).toHaveBeenCalledWith(
          orgId,
          'issue-1',
          userId,
          'accepted_risk',
          'Design approved brand colors for secondary buttons.',
        );
      });

      it('GATE 1: rejects accepted_risk without note with 400 validation error', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/ignore`)
          .set('Cookie', memberCookie)
          .send({
            reason: 'accepted_risk',
          })
          .expect(400);

        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(res.body.error.message).toContain('note is required');
      });

      it('GATE 1: rejects wont_fix without note with 400 validation error', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/ignore`)
          .set('Cookie', memberCookie)
          .send({
            reason: 'wont_fix',
            note: '   ',
          })
          .expect(400);

        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      });

      it('allows false_positive without a note', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/ignore`)
          .set('Cookie', memberCookie)
          .send({
            reason: 'false_positive',
          })
          .expect(200);

        expect(res.body.data.issue.status).toBe('ignored');
      });

      it('unignores/reopens an issue', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/issue-1/unignore`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.body.data.issue.status).toBe('open');
        expect(repos.issues.unignore).toHaveBeenCalledWith(orgId, 'issue-1', userId);
      });
    });

    describe('PATCH /v1/orgs/:orgId/issues/:issueId/assign', () => {
      it('assigns issue to an organisation member', async () => {
        const res = await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/assign`)
          .set('Cookie', memberCookie)
          .send({ assigneeId: '33333333-3333-4333-a333-333333333333' })
          .expect(200);

        expect(res.body.data.issue).toBeDefined();
        expect(repos.issues.assign).toHaveBeenCalledWith(
          orgId,
          'issue-1',
          userId,
          '33333333-3333-4333-a333-333333333333',
        );
      });

      it('rejects assigning to non-member with 400', async () => {
        vi.mocked(repos.memberships.find).mockImplementation((_orgId, uId) =>
          uId === userId
            ? Promise.resolve({
                id: 'mem-1',
                orgId,
                userId,
                role: 'member' as const,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            : Promise.resolve(null),
        );

        const res = await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/assign`)
          .set('Cookie', memberCookie)
          .send({ assigneeId: '99999999-9999-4999-a999-999999999999' })
          .expect(400);

        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(res.body.error.message).toContain('member');
      });

      it('unassigns when assigneeId is null', async () => {
        await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/assign`)
          .set('Cookie', memberCookie)
          .send({ assigneeId: null })
          .expect(200);

        expect(repos.issues.assign).toHaveBeenCalledWith(orgId, 'issue-1', userId, null);
      });
    });

    describe('PATCH /v1/orgs/:orgId/issues/:issueId/due-date', () => {
      it('sets a valid due date (YYYY-MM-DD)', async () => {
        await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/due-date`)
          .set('Cookie', memberCookie)
          .send({ dueDate: '2026-11-15' })
          .expect(200);

        expect(repos.issues.setDueDate).toHaveBeenCalledWith(
          orgId,
          'issue-1',
          userId,
          '2026-11-15',
        );
      });

      it('clears due date when null', async () => {
        await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/due-date`)
          .set('Cookie', memberCookie)
          .send({ dueDate: null })
          .expect(200);

        expect(repos.issues.setDueDate).toHaveBeenCalledWith(orgId, 'issue-1', userId, null);
      });

      it('rejects invalid date format with 400', async () => {
        const res = await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/due-date`)
          .set('Cookie', memberCookie)
          .send({ dueDate: 'next-friday' })
          .expect(400);

        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      });
    });

    describe('PATCH & DELETE notes', () => {
      it('updates note when user is the author', async () => {
        vi.mocked(repos.issues.findNoteById).mockResolvedValue({
          id: 'note-1',
          issueId: 'issue-1',
          authorId: userId,
          authorName: 'User Member',
          body: 'Original text',
          visibleToClient: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/notes/note-1`)
          .set('Cookie', memberCookie)
          .send({ body: 'Updated text', visibleToClient: true })
          .expect(200);

        expect(res.body.data.note.body).toBe('Updated text');
      });

      it('returns 403 when user is neither author nor admin', async () => {
        vi.mocked(repos.issues.findNoteById).mockResolvedValue({
          id: 'note-1',
          issueId: 'issue-1',
          authorId: 'other-user',
          authorName: 'Other Person',
          body: 'Original text',
          visibleToClient: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await request(app)
          .patch(`/v1/orgs/${orgId}/issues/issue-1/notes/note-1`)
          .set('Cookie', memberCookie)
          .send({ body: 'Hacked note' })
          .expect(403);

        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      });

      it('deletes note when author', async () => {
        vi.mocked(repos.issues.findNoteById).mockResolvedValue({
          id: 'note-1',
          issueId: 'issue-1',
          authorId: userId,
          authorName: 'User Member',
          body: 'Original text',
          visibleToClient: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await request(app)
          .delete(`/v1/orgs/${orgId}/issues/issue-1/notes/note-1`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.body.data.success).toBe(true);
        expect(repos.issues.deleteNote).toHaveBeenCalledWith(orgId, 'issue-1', 'note-1');
      });
    });

    describe('POST /v1/orgs/:orgId/issues/bulk', () => {
      it('executes bulk ignore on multiple issues', async () => {
        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/bulk`)
          .set('Cookie', memberCookie)
          .send({
            issueIds: [
              '11111111-1111-4111-a111-111111111111',
              '22222222-2222-4222-a222-222222222222',
            ],
            action: 'ignore',
            data: {
              reason: 'accepted_risk',
              note: 'Bulk accepted risk for marketing banner font.',
            },
          })
          .expect(200);

        expect(res.body.data.updatedCount).toBe(1);
        expect(repos.issues.bulkAction).toHaveBeenCalled();
      });

      it('rejects more than 200 issues in bulk action', async () => {
        const tooManyIds = Array.from(
          { length: 201 },
          (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
        );

        const res = await request(app)
          .post(`/v1/orgs/${orgId}/issues/bulk`)
          .set('Cookie', memberCookie)
          .send({
            issueIds: tooManyIds,
            action: 'unignore',
          })
          .expect(400);

        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      });
    });

    describe('GET /v1/orgs/:orgId/sites/:siteId/issues/export.csv (P2-22)', () => {
      it('exports issues as CSV with UTF-8 BOM, RFC 4180 escaping, and correct headers', async () => {
        vi.mocked(repos.issues.listBySite).mockResolvedValueOnce([
          {
            id: '11111111-1111-4111-a111-111111111111',
            orgId,
            siteId,
            fingerprint: 'fp-1',
            ruleId: 'color-contrast',
            title: 'Text has insufficient contrast, ratio is 2.5:1',
            description: 'Ensure contrast ratio meets 4.5:1',
            impact: 'critical',
            wcagCriteria: ['1.4.3 Contrast (Minimum)'],
            wcagLevel: 'AA',
            templateKey: 'product',
            selector: 'div.product-card > h2',
            htmlSnippet: '<h2 class="title">"Discount" item</h2>',
            failureSummary:
              'Fix any of the following:\n  Element has insufficient color contrast of 2.5:1',
            status: 'open',
            ignoredReason: null,
            ignoredNote: null,
            isRegression: true,
            regressionCount: 1,
            occurrenceCount: 5,
            assigneeId: userId,
            assigneeName: 'Daniel Mwangi',
            dueDate: '2026-11-01',
            needsReview: false,
            firstSeenScanId: 'scan-1',
            lastSeenScanId: 'scan-2',
            fixedScanId: null,
            fixedAt: null,
            createdAt: new Date('2026-10-01T10:00:00Z'),
            updatedAt: new Date('2026-10-14T10:00:00Z'),
          },
        ]);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/sites/${siteId}/issues/export.csv?status=open&impact=critical`)
          .set('Cookie', memberCookie)
          .expect(200);

        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toMatch(/attachment; filename="issues-.*\.csv"/);

        const text = res.text;
        // Verify UTF-8 BOM is present at the beginning
        expect(text.charCodeAt(0)).toBe(0xfeff);

        // Verify CSV header line
        expect(text).toContain('Issue ID,Rule ID,Rule Title,Impact,WCAG Criteria');

        // Verify issue fields and RFC 4180 escaping of commas, quotes, and newlines
        expect(text).toContain('11111111-1111-4111-a111-111111111111');
        expect(text).toContain('color-contrast');
        // Comma in title must be escaped in quotes
        expect(text).toContain('"Text has insufficient contrast, ratio is 2.5:1"');
        // Quotes inside htmlSnippet must be doubled
        expect(text).toContain('""Discount"" item');
        // Regression flag
        expect(text).toContain('Yes');
        // Assignee name
        expect(text).toContain('Daniel Mwangi');

        expect(repos.issues.listBySite).toHaveBeenCalledWith(
          orgId,
          siteId,
          expect.objectContaining({
            status: ['open'],
            impact: ['critical'],
          }),
          expect.objectContaining({
            limit: 10000,
            maxLimit: 10000,
          }),
        );
      });

      it('returns 404 when site does not exist', async () => {
        vi.mocked(repos.sites.findById).mockResolvedValueOnce(null);

        const res = await request(app)
          .get(`/v1/orgs/${orgId}/sites/missing-site/issues/export.csv`)
          .set('Cookie', memberCookie)
          .expect(404);

        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      });

      it('returns 404 on cross-org CSV export attempt', async () => {
        await assertCrossOrg404(app, {
          method: 'get',
          path: `/v1/orgs/${otherOrgId}/sites/${siteId}/issues/export.csv`,
          sessionCookie: memberCookie,
        });
      });
    });
  });
});
