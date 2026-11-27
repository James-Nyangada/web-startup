import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { portalRouter } from '../../src/routes/portal.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { fakeRepos, withSessionHeaders } from '../helpers/fakes.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { Auth } from '../../src/lib/auth.js';

describe('P4-09 Client Portal (S-60, S-61)', () => {
  let app: express.Express;
  let repos: Repositories;
  let fakeAuth: Auth;
  let currentUser: { id: string; email: string; name: string } | null;

  const testOrg = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Brightline Studio',
    slug: 'brightline',
    type: 'agency' as const,
    plan: 'agency' as const,
    billingStatus: 'active' as const,
    timeZone: 'Europe/London',
    trialEndsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const clientUser = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'mark@oakhaus.com',
    name: 'James Edwin',
    emailVerifiedAt: new Date(),
    avatarUrl: null,
    timeZone: 'Europe/London',
    isStaff: false,
    lastActiveOrgId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const agencyBranding = {
    id: '33333333-3333-4333-8333-333333333333',
    orgId: testOrg.id,
    displayName: 'Brightline Studio',
    primaryColor: '#0F3D3E',
    logoLightKey: 'logos/light.png',
    logoDarkKey: null,
    emailSenderName: 'Brightline Studio',
    reportFooter: 'Brightline Studio Accessibility Audit',
    hideProductBrand: true,
    customDomain: null,
    customDomainVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const siteOakhaus = {
    id: '44444444-4444-4444-8444-444444444444',
    orgId: testOrg.id,
    name: 'Oakhaus Furniture',
    rootUrl: 'https://oakhaus.com',
    platform: 'shopify' as const,
    status: 'active' as const,
    verifyMethod: 'dns_txt' as const,
    verifyToken: 'tok-1',
    verifiedAt: new Date(),
    scanFrequency: 'weekly' as const,
    scanDay: 1,
    scanHour: 2,
    pageLimit: 100,
    standard: 'wcag22aa' as const,
    pinnedUrls: [],
    excludedPaths: [],
    authNote: null,
    clientName: 'Oakhaus',
    lastScanId: 'scan-1',
    nextScanAt: new Date(),
    score: 78,
    previousScore: 61,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-10-14'),
    deletedAt: null,
  };

  const siteUnassigned = {
    id: '55555555-5555-4555-8555-555555555555',
    orgId: testOrg.id,
    name: 'Secret Client Co',
    rootUrl: 'https://secret.com',
    platform: 'custom' as const,
    status: 'active' as const,
    verifyMethod: 'dns_txt' as const,
    verifyToken: 'tok-2',
    verifiedAt: new Date(),
    scanFrequency: 'weekly' as const,
    scanDay: 1,
    scanHour: 2,
    pageLimit: 100,
    standard: 'wcag22aa' as const,
    pinnedUrls: [],
    excludedPaths: [],
    authNote: null,
    clientName: 'Secret',
    lastScanId: null,
    nextScanAt: new Date(),
    score: 95,
    previousScore: 90,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-10-14'),
    deletedAt: null,
  };

  beforeEach(() => {
    repos = fakeRepos().repos;
    currentUser = clientUser;

    fakeAuth = {
      api: {
        getSession: vi.fn().mockImplementation(() => {
          if (!currentUser) return Promise.resolve(null);
          return Promise.resolve({
            user: { id: currentUser.id, email: currentUser.email, name: currentUser.name },
            session: { id: 'test-session-id' },
          });
        }),
      },
    } as unknown as Auth;

    vi.mocked(repos.users.findById).mockImplementation((id: string) => {
      if (id === clientUser.id) return Promise.resolve(clientUser as never);
      return Promise.resolve(null);
    });

    vi.mocked(repos.organizations.findById).mockImplementation((orgId) => {
      if (orgId === testOrg.id) return Promise.resolve(testOrg as never);
      return Promise.resolve(null);
    });

    vi.mocked(repos.branding.findByOrgId).mockImplementation((orgId) => {
      if (orgId === testOrg.id) return Promise.resolve(agencyBranding as never);
      return Promise.resolve(null);
    });

    vi.mocked(repos.sites.findById).mockImplementation((orgId, siteId: string) => {
      if (orgId === testOrg.id && siteId === siteOakhaus.id)
        return Promise.resolve(siteOakhaus as never);
      if (orgId === testOrg.id && siteId === siteUnassigned.id)
        return Promise.resolve(siteUnassigned as never);
      return Promise.resolve(null);
    });

    vi.mocked(repos.users.listClientAccess).mockImplementation((userId: string) => {
      if (userId === clientUser.id) {
        return Promise.resolve([
          {
            id: 'ca-1',
            orgId: testOrg.id,
            siteId: siteOakhaus.id,
            org: { id: testOrg.id, name: testOrg.name, slug: testOrg.slug },
            site: {
              id: siteOakhaus.id,
              name: siteOakhaus.name,
              rootUrl: siteOakhaus.rootUrl,
              status: siteOakhaus.status,
              platform: siteOakhaus.platform,
              score: siteOakhaus.score,
            },
          },
        ] as never);
      }
      return Promise.resolve([]);
    });

    vi.mocked(repos.issues.listBySite).mockImplementation(((
      orgId: string,
      siteId: string,
      filters?: { status?: string },
    ) => {
      if (siteId === siteOakhaus.id) {
        if (filters?.status === 'open') {
          return Promise.resolve([
            {
              id: 'i-1',
              impact: 'critical',
              title: 'Cart button has no accessible name',
              ruleId: 'button-name',
            },
            {
              id: 'i-2',
              impact: 'serious',
              title: 'Low text contrast on body copy',
              ruleId: 'color-contrast',
            },
            {
              id: 'i-3',
              impact: 'moderate',
              title: 'Confusing landmark structure',
              ruleId: 'aria-allowed-role',
            },
            {
              id: 'i-4',
              impact: 'minor',
              title: 'Page title is generic',
              ruleId: 'document-title',
            },
          ] as never);
        }
        if (filters?.status === 'fixed') {
          return Promise.resolve([
            {
              id: 'i-fixed-1',
              title: 'Checkout errors are announced',
              ruleId: 'cart',
              updatedAt: new Date('2026-10-12'),
            },
          ] as never);
        }
      }
      return Promise.resolve([]);
    }) as never);

    vi.mocked(repos.issues.listClientNotesBySite).mockImplementation((orgId, siteId: string) => {
      if (siteId === siteOakhaus.id) {
        return Promise.resolve([
          {
            id: 'note-1',
            issueId: 'i-1',
            authorId: 'admin-1',
            authorName: 'Daniel',
            body: 'A theme update removed descriptions. Restoring them this week.',
            visibleToClient: true,
            createdAt: new Date('2026-10-14'),
            updatedAt: new Date('2026-10-14'),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    vi.mocked(repos.reports.listByOrg).mockImplementation((orgId, opts) => {
      if (opts?.siteId === siteOakhaus.id) {
        return Promise.resolve({
          reports: [
            {
              id: 'rep-1',
              orgId: testOrg.id,
              siteId: siteOakhaus.id,
              type: 'summary' as const,
              status: 'ready' as const,
              siteName: 'Oakhaus Furniture',
              fileKey: 'reports/rep-1.pdf',
              fileSize: 1024,
              createdAt: new Date('2026-10-14'),
              updatedAt: new Date('2026-10-14'),
            },
          ] as never,
          total: 1,
        });
      }
      return Promise.resolve({ reports: [], total: 0 });
    });

    app = express();
    app.use(express.json());
    app.use('/v1/portal', portalRouter(repos, withSessionHeaders(fakeAuth)));
    app.use(errorHandler);
  });

  describe('1. S-60 Portal Home (/v1/portal/home)', () => {
    it('returns 401 when unauthenticated', async () => {
      currentUser = null;
      const res = await request(app).get('/v1/portal/home');
      expect(res.status).toBe(401);
    });

    it('returns client user info, assigned websites, and agency branding', async () => {
      const res = await request(app).get('/v1/portal/home');
      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('James Edwin');
      expect(res.body.data.sites).toHaveLength(1);

      const site = res.body.data.sites[0];
      expect(site.id).toBe(siteOakhaus.id);
      expect(site.name).toBe('Oakhaus Furniture');
      expect(site.score).toBe(78);
      expect(site.band).toBe('Needs work');
      expect(site.orgName).toBe('Brightline Studio');

      // Agency branding
      expect(res.body.data.branding.displayName).toBe('Brightline Studio');
      expect(res.body.data.branding.primaryColor).toBe('#0F3D3E');
      expect(res.body.data.branding.hideProductBrand).toBe(true);
    });
  });

  describe('2. S-61 Portal Site View (/v1/portal/sites/:siteId)', () => {
    it('returns 404 for unassigned site (strict isolation)', async () => {
      const res = await request(app).get(`/v1/portal/sites/${siteUnassigned.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for nonexistent site', async () => {
      const res = await request(app).get('/v1/portal/sites/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('returns plain language summaries, trend data, recent fixes, client notes, and published reports', async () => {
      const res = await request(app).get(`/v1/portal/sites/${siteOakhaus.id}`);
      expect(res.status).toBe(200);

      const data = (
        res.body as {
          data: {
            site: { name: string; score: number; band: string };
            trend: Array<{ score: number }>;
            openSummary: Array<{ severity: string; count: number; description: string }>;
            recentFixes: Array<{ title: string }>;
            notes: Array<{ authorName: string; body: string }>;
            reports: Array<{ downloadUrl: string }>;
          };
        }
      ).data;
      expect(data.site.name).toBe('Oakhaus Furniture');
      expect(data.site.score).toBe(78);
      expect(data.site.band).toBe('Needs work');

      // Trend data (6 months)
      expect(data.trend).toHaveLength(6);
      expect(data.trend[5]?.score).toBe(78);

      // Open issues grouped by severity with plain language explanations
      expect(data.openSummary).toBeInstanceOf(Array);
      expect(data.openSummary.length).toBeGreaterThan(0);
      const crit = data.openSummary.find((s) => s.severity === 'critical');
      expect(crit?.count).toBe(1);
      expect(crit?.description).toContain('Critical barriers');

      // Recent fixes
      expect(data.recentFixes).toHaveLength(1);
      expect(data.recentFixes[0]!.title).toBe('Checkout errors and cart actions are announced');

      // Client visible notes
      expect(data.notes).toHaveLength(1);
      expect(data.notes[0]!.authorName).toBe('Daniel');
      expect(data.notes[0]!.body).toContain('theme update removed descriptions');

      // Published reports
      expect(data.reports).toHaveLength(1);
      expect(data.reports[0]!.downloadUrl).toContain('/v1/reports/download/');
    });
  });
});
