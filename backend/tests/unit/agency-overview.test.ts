import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { buildTestApp } from '../helpers/fakes.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { handleReportRender } from '../../src/worker/jobs/report-render.js';

describe('P4-10: Agency Overview & Cross-Site Views (S-20, R-05)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const memberId = 'user-member-123';
  const adminId = 'user-admin-789';
  const clientViewerId = 'user-client-viewer-456';
  const memberCookie = `better-auth.session_token=token-${memberId}`;
  const adminCookie = `better-auth.session_token=token-${adminId}`;
  const clientViewerCookie = `better-auth.session_token=token-${clientViewerId}`;

  const mockAgencyOrg = {
    id: orgId,
    name: 'Northstar Digital Agency',
    slug: 'northstar',
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

  let repos: Repositories;
  let app: Express;

  beforeEach(() => {
    const auth = {
      api: {
        getSession: vi.fn(
          ({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
            let cookie: string | null = null;
            if (headers instanceof Headers) cookie = headers.get('cookie');
            else if (headers && typeof headers === 'object' && 'cookie' in headers)
              cookie = (headers.cookie as string) ?? null;

            if (cookie?.includes(`token-${adminId}`)) {
              return Promise.resolve({
                user: { id: adminId, email: 'admin@northstar.com', name: 'Admin' },
                session: { id: 'sess-admin', userId: adminId },
              });
            }
            if (cookie?.includes(`token-${memberId}`)) {
              return Promise.resolve({
                user: { id: memberId, email: 'member@northstar.com', name: 'Member' },
                session: { id: 'sess-member', userId: memberId },
              });
            }
            if (cookie?.includes(`token-${clientViewerId}`)) {
              return Promise.resolve({
                user: { id: clientViewerId, email: 'client@store.com', name: 'Client' },
                session: { id: 'sess-client', userId: clientViewerId },
              });
            }
            return Promise.resolve(null);
          },
        ),
      },
    } as unknown as Auth;

    const testApp = buildTestApp({ auth });
    repos = testApp.repos;
    app = testApp.app;

    vi.mocked(repos.organizations.findById).mockImplementation((id: string) =>
      Promise.resolve(id === orgId ? (mockAgencyOrg as never) : null),
    );
    vi.mocked(repos.organizations.findByIdOrSlug).mockImplementation((idOrSlug: string) =>
      Promise.resolve(
        idOrSlug === orgId || idOrSlug === mockAgencyOrg.slug ? (mockAgencyOrg as never) : null,
      ),
    );
    vi.mocked(repos.memberships.find).mockImplementation((oid: string, uid: string) => {
      if (oid === orgId && uid === adminId) {
        return Promise.resolve({
          orgId,
          userId: adminId,
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
      }
      if (oid === orgId && uid === memberId) {
        return Promise.resolve({
          orgId,
          userId: memberId,
          role: 'member',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
      }
      return Promise.resolve(null);
    });

    vi.mocked(repos.clientAccess.listByUserAndOrg).mockImplementation(
      (uid: string, _oid: string) => {
        if (uid === clientViewerId) {
          return Promise.resolve([
            {
              id: 'ca-1',
              orgId,
              siteId: 'site-1',
              userId: clientViewerId,
              createdAt: new Date(),
              siteName: 'Acme Store',
              rootUrl: 'https://acme.com',
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
  });

  describe('GET /v1/orgs/:orgId/overview/cross-site-issues', () => {
    it('returns cross-site most common issues linking affected sites and counts', async () => {
      vi.mocked(repos.issues.listCrossSiteCommonIssues).mockResolvedValueOnce([
        {
          ruleId: 'color-contrast',
          title: 'Elements must have sufficient color contrast',
          impact: 'serious',
          affectedSitesCount: 3,
          totalOccurrences: 24,
          sites: [
            { siteId: 'site-1', siteName: 'Store A', clientName: 'Client Alpha', occurrences: 10 },
            { siteId: 'site-2', siteName: 'Store B', clientName: 'Client Beta', occurrences: 8 },
            { siteId: 'site-3', siteName: 'Store C', clientName: 'Client Gamma', occurrences: 6 },
          ],
        },
        {
          ruleId: 'image-alt',
          title: 'Images must have alternate text',
          impact: 'critical',
          affectedSitesCount: 2,
          totalOccurrences: 15,
          sites: [
            { siteId: 'site-1', siteName: 'Store A', clientName: 'Client Alpha', occurrences: 9 },
            { siteId: 'site-2', siteName: 'Store B', clientName: 'Client Beta', occurrences: 6 },
          ],
        },
      ]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/overview/cross-site-issues`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.totalRules).toBe(2);
      expect(res.body.data.totalAffectedSites).toBe(3);
      expect(res.body.data.items).toHaveLength(2);

      const firstRule = res.body.data.items[0];
      expect(firstRule.ruleId).toBe('color-contrast');
      expect(firstRule.affectedSitesCount).toBe(3);
      expect(firstRule.totalOccurrences).toBe(24);
      expect(firstRule.sites).toHaveLength(3);
      expect(firstRule.sites[0].siteName).toBe('Store A');
    });

    it('rejects client viewers from accessing agency cross-site overview', async () => {
      const res = await request(app)
        .get(`/v1/orgs/${orgId}/overview/cross-site-issues`)
        .set('Cookie', [clientViewerCookie]);

      expect(res.status).toBe(403);
    });
  });

  describe('R-05 Agency Overview Report Generation', () => {
    it('creates an agency_overview report without requiring siteId or scanId', async () => {
      vi.mocked(repos.reports.create).mockResolvedValueOnce({
        id: 'rep-agency-1',
        orgId,
        siteId: null,
        scanId: null,
        type: 'agency_overview',
        status: 'queued',
        fileKey: null,
        fileSize: null,
        branded: true,
        requestedBy: memberId,
        expiresAt: null,
        dateFrom: null,
        dateTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports`)
        .set('Cookie', [memberCookie])
        .send({
          type: 'agency_overview',
          branded: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.type).toBe('agency_overview');
      expect(res.body.data.siteId).toBeNull();
    });

    it('rejects agency_overview report on Store plan with 422 PLAN_LIMIT', async () => {
      const mockStoreOrg = {
        ...mockAgencyOrg,
        type: 'store' as const,
        plan: 'store' as const,
      };
      vi.mocked(repos.organizations.findById).mockResolvedValue(mockStoreOrg);
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockStoreOrg);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports`)
        .set('Cookie', [memberCookie])
        .send({
          type: 'agency_overview',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PLAN_LIMIT');
      expect(res.body.error.details.upgradeTo).toBe('agency');
    });

    it('handleReportRender aggregates all sites, summaries, and common issues for R-05', async () => {
      const storage = new MemoryStorageService();
      const updateStatus = vi.fn().mockResolvedValue({ id: 'rep-r05-1', status: 'ready' });
      const writeAudit = vi.fn().mockResolvedValue(undefined);

      const testRepos = {
        organizations: {
          findById: vi.fn().mockResolvedValue(mockAgencyOrg),
        },
        reports: {
          findRawById: vi.fn().mockResolvedValue({
            id: 'rep-r05-1',
            orgId,
            siteId: null,
            scanId: null,
            type: 'agency_overview',
            status: 'queued',
            scanScore: null,
            requestedBy: memberId,
          }),
          updateStatus,
        },
        sites: {
          list: vi.fn().mockResolvedValue([
            {
              id: 'site-1',
              name: 'Alpha Store',
              clientName: 'Client Alpha',
              rootUrl: 'https://alpha.com',
              platform: 'shopify',
              score: 85,
              verifiedAt: new Date(),
            },
            {
              id: 'site-2',
              name: 'Beta Store',
              clientName: 'Client Beta',
              rootUrl: 'https://beta.com',
              platform: 'woocommerce',
              score: 62,
              verifiedAt: null,
            },
          ]),
          listSummaries: vi.fn().mockResolvedValue(
            new Map([
              [
                'site-1',
                {
                  openCritical: 1,
                  openSerious: 3,
                  regressions: 0,
                  lastScanAt: new Date(),
                  lastScanStatus: 'completed',
                  lastScanError: null,
                  previousScore: 82,
                },
              ],
              [
                'site-2',
                {
                  openCritical: 4,
                  openSerious: 8,
                  regressions: 2,
                  lastScanAt: new Date(),
                  lastScanStatus: 'completed',
                  lastScanError: null,
                  previousScore: 70,
                },
              ],
            ]),
          ),
        },
        issues: {
          listCrossSiteCommonIssues: vi.fn().mockResolvedValue([
            {
              ruleId: 'color-contrast',
              title: 'Color contrast',
              impact: 'serious',
              affectedSitesCount: 2,
              totalOccurrences: 11,
              sites: [],
            },
          ]),
        },
        branding: {
          findByOrgId: vi.fn().mockResolvedValue({
            displayName: 'Northstar Agency',
            logoLightKey: null,
            primaryColor: '#0055ff',
            reportFooter: 'Northstar Accessibility Services',
          }),
        },
        auditLog: {
          write: writeAudit,
        },
      } as unknown as Repositories;

      await handleReportRender({ reportId: 'rep-r05-1' }, { repos: testRepos, storage });

      expect(updateStatus).toHaveBeenCalledWith('rep-r05-1', 'rendering');
      expect(updateStatus).toHaveBeenCalledWith(
        'rep-r05-1',
        'ready',
        expect.objectContaining({
          fileKey: `reports/${orgId}/rep-r05-1.pdf`,
        }),
      );

      const savedPdf = await storage.getObject(`reports/${orgId}/rep-r05-1.pdf`);
      expect(savedPdf).not.toBeNull();
      expect(savedPdf?.toString('utf-8')).toContain('%PDF');
    });
  });

  describe('P4-11: Scan Frequency by Plan (Daily Caps)', () => {
    const siteId = 'site-11111111-1111-4111-a111-111111111111';

    beforeEach(() => {
      vi.mocked(repos.sites.findById).mockResolvedValue({
        id: siteId,
        orgId,
        name: 'Alpha Store',
        rootUrl: 'https://alpha.com',
        scanFrequency: 'weekly',
      } as never);
      vi.mocked(repos.sites.update).mockResolvedValue({
        id: siteId,
        orgId,
        name: 'Alpha Store',
        rootUrl: 'https://alpha.com',
        scanFrequency: 'daily',
      } as never);
    });

    it('rejects daily scans on Store plan with 422 PLAN_LIMIT (upgrade to growth)', async () => {
      const mockStoreOrg = {
        ...mockAgencyOrg,
        plan: 'store' as const,
      };
      vi.mocked(repos.organizations.findById).mockResolvedValue(mockStoreOrg);
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockStoreOrg);

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', [adminCookie])
        .send({
          scanFrequency: 'daily',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PLAN_LIMIT');
      expect(res.body.error.details.upgradeTo).toBe('growth');
      expect(res.body.error.message).toContain('Daily scans are not available on the Store plan');
    });

    it('allows up to 5 daily sites on Agency plan', async () => {
      // 4 existing daily sites, adding 5th is allowed
      vi.mocked(repos.sites.countDailySites).mockResolvedValueOnce(4);

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', [adminCookie])
        .send({
          scanFrequency: 'daily',
        });

      expect(res.status).toBe(200);
      expect(repos.sites.update).toHaveBeenCalledWith(
        orgId,
        siteId,
        expect.objectContaining({
          scanFrequency: 'daily',
        }),
      );
    });

    it('rejects 6th daily site on Agency plan with 422 PLAN_LIMIT (upgrade to agency_pro)', async () => {
      // 5 existing daily sites, adding 6th exceeds plan limit of 5
      vi.mocked(repos.sites.countDailySites).mockResolvedValueOnce(5);

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', [adminCookie])
        .send({
          scanFrequency: 'daily',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PLAN_LIMIT');
      expect(res.body.error.details.limit).toBe(5);
      expect(res.body.error.details.upgradeTo).toBe('agency_pro');
      expect(res.body.error.message).toContain('limit of 5 daily-scanned sites');
    });

    it('allows unlimited daily sites on Growth plan', async () => {
      const mockGrowthOrg = {
        ...mockAgencyOrg,
        plan: 'growth' as const,
      };
      vi.mocked(repos.organizations.findById).mockResolvedValue(mockGrowthOrg);
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockGrowthOrg);

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/sites/${siteId}`)
        .set('Cookie', [adminCookie])
        .send({
          scanFrequency: 'daily',
        });

      expect(res.status).toBe(200);
    });
  });
});
