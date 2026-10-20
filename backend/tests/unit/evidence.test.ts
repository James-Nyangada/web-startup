import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp } from '../helpers/fakes.js';
import { handleScanProcess } from '../../src/worker/jobs/scan-process.js';
import { handleReportRender } from '../../src/worker/jobs/report-render.js';
import { processPaddleEvent } from '../../src/billing/paddle.js';
import type { WorkerContext } from '../../src/worker/types.js';

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

  return { auth: { api } as unknown as Auth, user: mockUser };
}

describe('Evidence Timeline & Compliance Events (P5-01)', () => {
  const orgId = '018f0000-0000-7000-8000-000000000001';
  const siteId = '018f0000-0000-7000-8000-000000000010';
  const userId = '018f0000-0000-7000-8000-000000000002';
  const clientUserId = '018f0000-0000-7000-8000-000000000003';

  let app: Express;
  let repos: Repositories;

  const mockOrg = {
    id: orgId,
    name: 'Acme Agency',
    slug: 'acme-agency',
    plan: 'agency',
    billingStatus: 'active',
    timeZone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSite = {
    id: siteId,
    orgId,
    name: 'Acme Site',
    rootUrl: 'https://acme.example.com',
    platform: 'shopify',
    status: 'active',
    isVerified: true,
    verifyToken: 'token-abc',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEvidenceEvent = {
    id: '018f0000-0000-7000-8000-000000000099',
    orgId,
    siteId,
    type: 'scan_completed',
    actorId: userId,
    occurredAt: new Date('2026-10-20T10:00:00Z'),
    data: { scanId: 'scan-1', score: 92 },
  };

  beforeEach(() => {
    const { auth } = createMockAuth(userId);
    const testAppResult = buildTestApp({ auth });
    app = testAppResult.app;
    repos = testAppResult.repos;

    vi.mocked(repos.organizations.findById).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findBySlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.sites.findById).mockResolvedValue(mockSite as never);
    vi.mocked(repos.memberships.find).mockResolvedValue({
      id: 'mem-1',
      orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(repos.memberships.findRole).mockResolvedValue('owner');
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId/evidence', () => {
    it('returns 200 with list of events and metadata for owner/admin/member', async () => {
      vi.mocked(repos.evidenceEvents.list).mockResolvedValue([mockEvidenceEvent as never]);
      vi.mocked(repos.evidenceEvents.count).mockResolvedValue(1);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/evidence`)
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data.events).toHaveLength(1);
      expect(res.body.data.events[0]).toMatchObject({
        id: mockEvidenceEvent.id,
        type: 'scan_completed',
        siteId,
      });
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.hasMore).toBe(false);
    });

    it('passes filter parameters to the repository', async () => {
      vi.mocked(repos.evidenceEvents.list).mockResolvedValue([]);
      vi.mocked(repos.evidenceEvents.count).mockResolvedValue(0);

      const res = await request(app)
        .get(
          `/v1/orgs/${orgId}/sites/${siteId}/evidence?type=issue_fixed&from=2026-10-01T00:00:00Z&to=2026-10-20T00:00:00Z&limit=25&offset=10`,
        )
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(200);
      expect(repos.evidenceEvents.list).toHaveBeenCalledWith(
        orgId,
        siteId,
        expect.objectContaining({
          type: 'issue_fixed',
          from: new Date('2026-10-01T00:00:00Z'),
          to: new Date('2026-10-20T00:00:00Z'),
          limit: 25,
          offset: 10,
        }),
      );
    });

    it('validates event type and rejects invalid types with 400', async () => {
      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/evidence?type=invalid_type_name`)
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 404 when site is not found', async () => {
      vi.mocked(repos.sites.findById).mockResolvedValue(null);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/018f0000-0000-7000-8000-000000000999/evidence`)
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('allows client viewers if assigned to the site', async () => {
      const { auth: clientAuth } = createMockAuth(clientUserId);
      const clientApp = buildTestApp({ auth: clientAuth, repos }).app;

      vi.mocked(repos.memberships.find).mockResolvedValue(null);
      vi.mocked(repos.memberships.findRole).mockResolvedValue(null);
      vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
        {
          id: 'ca-1',
          orgId,
          siteId,
          createdAt: new Date(),
        },
      ]);
      vi.mocked(repos.evidenceEvents.list).mockResolvedValue([mockEvidenceEvent as never]);
      vi.mocked(repos.evidenceEvents.count).mockResolvedValue(1);

      const res = await request(clientApp)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/evidence`)
        .set('Cookie', [`token-${clientUserId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data.events).toHaveLength(1);
    });

    it('blocks client viewers with 404 if not assigned to the site', async () => {
      const { auth: clientAuth } = createMockAuth(clientUserId);
      const clientApp = buildTestApp({ auth: clientAuth, repos }).app;

      vi.mocked(repos.memberships.find).mockResolvedValue(null);
      vi.mocked(repos.memberships.findRole).mockResolvedValue(null);
      vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
        {
          id: 'ca-2',
          orgId,
          siteId: '018f0000-0000-7000-8000-000000000099', // Different site
          createdAt: new Date(),
        },
      ]);

      const res = await request(clientApp)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/evidence`)
        .set('Cookie', [`token-${clientUserId}=active`]);

      expect(res.status).toBe(404);
    });
  });

  describe('Evidence event sources', () => {
    it('records site_added on site creation', async () => {
      vi.mocked(repos.sites.create).mockResolvedValue({
        id: 'new-site-1',
        orgId,
        name: 'New Site',
        rootUrl: 'https://newsite.example.com',
        platform: 'shopify',
      } as never);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites`)
        .set('Cookie', [`token-${userId}=active`])
        .send({
          name: 'New Site',
          rootUrl: 'https://newsite.example.com',
          platform: 'shopify',
        });

      expect(res.status).toBe(201);
      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId: 'new-site-1',
          type: 'site_added',
          actorId: userId,
        }),
      );
    });

    it('records issue_ignored when issue is ignored', async () => {
      const issueId = '018f0000-0000-7000-8000-000000000088';
      vi.mocked(repos.issues.findById).mockResolvedValue({
        id: issueId,
        orgId,
        siteId,
        ruleId: 'image-alt',
        status: 'open',
      } as never);
      vi.mocked(repos.issues.ignore).mockResolvedValue({
        id: issueId,
        status: 'ignored',
      } as never);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/issues/${issueId}/ignore`)
        .set('Cookie', [`token-${userId}=active`])
        .send({
          reason: 'false_positive',
          note: 'Decorative image',
        });

      expect(res.status).toBe(200);
      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'issue_ignored',
          actorId: userId,
          data: expect.objectContaining({
            issueId,
            ruleId: 'image-alt',
            reason: 'false_positive',
          }),
        }),
      );
    });

    it('records scan_completed, issue_fixed, and issue_regressed in handleScanProcess', async () => {
      const scanId = 'scan-proc-1';
      const scanData = {
        id: scanId,
        orgId,
        siteId,
        status: 'running',
        requestedBy: userId,
        rawKey: 'scans/raw.json',
      };

      const rawResult = {
        status: 'completed',
        score: 95,
        pagesScanned: 5,
        pagesPlanned: 5,
        pages: [{ url: 'https://acme.example.com', templateKey: 'home', status: 'ok' }],
        issues: [],
      };

      const storage = {
        getObject: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(rawResult))),
        putObject: vi.fn(),
      };

      vi.mocked(repos.scans.findRawById).mockResolvedValue(scanData as never);
      vi.mocked(repos.issues.listForDiff).mockResolvedValue([
        { id: 'issue-fixed-1', ruleId: 'color-contrast', status: 'open' } as never,
      ]);
      vi.mocked(repos.pages.listBySite).mockResolvedValue([]);
      vi.mocked(repos.issues.applyScanDiff).mockResolvedValue({
        createdCount: 0,
        fixedCount: 1,
        regressedCount: 1,
        fixedIssues: [{ id: 'issue-fixed-1', ruleId: 'color-contrast' }],
        regressedIssues: [{ id: 'issue-reg-1', ruleId: 'link-name' }],
      });

      const workerCtx = {
        repos,
        storage,
        pool: { query: vi.fn() },
      } as unknown as WorkerContext;

      // Mock diffScans output
      vi.spyOn(await import('../../src/scanner/results/diff.js'), 'diffScans').mockReturnValue({
        created: [],
        fixed: [
          { fingerprint: 'fp-1', status: 'fixed', templateKey: 'home', lastSeenPageUrls: [] },
        ],
        regressed: [
          {
            fingerprint: 'fp-2',
            ruleId: 'link-name',
            impact: 'critical',
            wcagCriteria: ['2.4.4'],
            wcagLevel: 'A',
            templateKey: 'home',
            selector: 'a',
            occurrences: [],
          } as never,
        ],
        stillOpen: [],
        ignoredSeen: [],
        unchecked: [],
        partial: false,
      });

      await handleScanProcess({ scanId }, workerCtx);

      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'scan_completed',
          actorId: userId,
        }),
      );

      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'issue_fixed',
          data: expect.objectContaining({ issueId: 'issue-fixed-1' }),
        }),
      );

      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'issue_regressed',
          data: expect.objectContaining({ issueId: 'issue-reg-1' }),
        }),
      );
    });

    it('records report_generated in handleReportRender', async () => {
      const reportId = 'report-1';
      vi.mocked(repos.reports.findRawById).mockResolvedValue({
        id: reportId,
        orgId,
        siteId,
        type: 'full',
        status: 'queued',
        requestedBy: userId,
      } as never);

      const storage = {
        getObject: vi.fn().mockResolvedValue(null),
        putObject: vi.fn().mockResolvedValue(undefined),
      };

      const workerCtx = {
        repos,
        storage,
      } as unknown as WorkerContext;

      // Mock report renderer
      vi.spyOn(await import('../../src/reports/render.js'), 'renderReportPdf').mockResolvedValue(
        Buffer.from('%PDF-1.4 test'),
      );

      await handleReportRender({ reportId }, workerCtx);

      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'report_generated',
          actorId: userId,
          data: expect.objectContaining({ reportId, type: 'full' }),
        }),
      );
    });

    it('records plan_changed in processPaddleEvent', async () => {
      vi.mocked(repos.sites.list).mockResolvedValue([mockSite as never]);

      const paddlePayload = {
        event_id: 'evt_plan_test',
        event_type: 'subscription.created',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_test_1',
          customer_id: 'ctm_1',
          status: 'active',
          custom_data: { orgId },
          items: [
            {
              price: {
                id: 'pri_sandbox_agency_monthly',
                description: 'Agency Monthly',
                unit_price: { amount: '19900', currency_code: 'USD' },
              },
            },
          ],
        },
      };

      await processPaddleEvent(paddlePayload, repos);

      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'plan_changed',
        }),
      );
    });
  });
});
