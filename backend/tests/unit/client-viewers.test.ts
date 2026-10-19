import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { orgsRouter } from '../../src/routes/orgs.js';
import { invitationsRouter } from '../../src/routes/invitations.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { fakeRepos } from '../helpers/fakes.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { Auth } from '../../src/lib/auth.js';
import type { organizations, sites, issues } from '../../src/db/schema/index.js';

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

interface ApiSitesResponse {
  data: {
    sites: Array<{ id: string; name: string }>;
  };
}

interface ApiSiteDetailResponse {
  data: {
    site: { id: string; name: string };
  };
}

interface ApiIssuesResponse {
  data: {
    items: Array<{ id: string; title: string }>;
  };
}

interface ApiIssueDetailResponse {
  data: {
    issue: { id: string; title: string };
  };
}

interface ApiNotesResponse {
  data: {
    items: Array<{ id: string; body: string; visibleToClient: boolean }>;
  };
}

interface ApiClientsResponse {
  data: {
    clients: Array<{
      user: { id: string; email: string };
      sites: Array<{ id: string; name: string }>;
    }>;
  };
}

describe('P4-08 Client Viewers (S-42) & Strict Isolation', () => {
  let repos: Repositories;
  let mockTransport: MockTransport;
  let emailSender: EmailSender;
  let app: express.Express;

  const testOrg = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Brightline Agency',
    slug: 'brightline',
    type: 'agency' as const,
    plan: 'agency' as const,
    billingStatus: 'active' as const,
    timeZone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
    paddleCustomerId: null,
    trialEndsAt: null,
    deletedAt: null,
  } as unknown as typeof organizations.$inferSelect;

  const storeOrg = {
    ...testOrg,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Single Store',
    slug: 'single-store',
    plan: 'store' as const,
  } as unknown as typeof organizations.$inferSelect;

  const siteA = {
    id: '33333333-3333-4333-8333-333333333333',
    orgId: testOrg.id,
    name: 'Client Alpha Site',
    rootUrl: 'https://alpha.example.com',
    platform: 'custom',
    status: 'active',
    verifyToken: 'token-a',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as typeof sites.$inferSelect;

  const siteB = {
    id: '44444444-4444-4444-8444-444444444444',
    orgId: testOrg.id,
    name: 'Client Beta Site (Private)',
    rootUrl: 'https://beta.example.com',
    platform: 'custom',
    status: 'active',
    verifyToken: 'token-b',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as typeof sites.$inferSelect;

  const issueOnA = {
    id: '55555555-5555-4555-8555-555555555555',
    orgId: testOrg.id,
    siteId: siteA.id,
    ruleId: 'color-contrast',
    title: 'Low contrast on buttons',
    impact: 'serious',
    status: 'open',
    wcagCriteria: ['1.4.3'],
    wcagLevel: 'AA',
    templateKey: 'header',
    selector: '.btn-primary',
    htmlSnippet: '<button class="btn-primary">Click</button>',
    failureSummary: 'Contrast is 3.1:1',
    occurrenceCount: 2,
    isRegression: false,
    needsReview: false,
    assigneeId: null,
    dueDate: null,
    ignoredReason: null,
    ignoredNote: null,
    fixedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as typeof issues.$inferSelect;

  const issueOnB = {
    id: '66666666-6666-4666-8666-666666666666',
    orgId: testOrg.id,
    siteId: siteB.id,
    ruleId: 'image-alt',
    title: 'Missing image alt attribute',
    impact: 'critical',
    status: 'open',
    wcagCriteria: ['1.1.1'],
    wcagLevel: 'A',
    templateKey: 'home',
    selector: 'img.hero',
    htmlSnippet: '<img class="hero">',
    failureSummary: 'Missing alt attribute',
    occurrenceCount: 1,
    isRegression: false,
    needsReview: false,
    assigneeId: null,
    dueDate: null,
    ignoredReason: null,
    ignoredNote: null,
    fixedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as typeof issues.$inferSelect;

  // Auth users
  const adminUser = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'admin@brightline.studio',
    name: 'Agency Admin',
    emailVerified: true,
  };

  const clientUser = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    email: 'client@alphasite.com',
    name: 'Client Alpha Viewer',
    emailVerified: true,
  };

  let currentUser = adminUser;

  const fakeAuth = {
    api: {
      getSession: vi.fn().mockImplementation(() =>
        Promise.resolve({
          user: currentUser,
          session: { id: 'test-session', userId: currentUser.id },
        }),
      ),
      signUpEmail: vi.fn(),
    },
  } as unknown as Auth;

  beforeEach(() => {
    const fakes = fakeRepos();
    repos = fakes.repos;
    mockTransport = new MockTransport();
    emailSender = new EmailSender({ transport: mockTransport });

    // Seed mock repo lookups
    vi.mocked(repos.organizations.findByIdOrSlug).mockImplementation((idOrSlug: string) => {
      if (idOrSlug === testOrg.id || idOrSlug === testOrg.slug) return Promise.resolve(testOrg);
      if (idOrSlug === storeOrg.id || idOrSlug === storeOrg.slug) return Promise.resolve(storeOrg);
      return Promise.resolve(null);
    });

    vi.mocked(repos.organizations.findById).mockImplementation((id: string) => {
      if (id === testOrg.id) return Promise.resolve(testOrg);
      if (id === storeOrg.id) return Promise.resolve(storeOrg);
      return Promise.resolve(null);
    });

    vi.mocked(repos.sites.findById).mockImplementation((orgId: string, siteId: string) => {
      if (orgId === testOrg.id && siteId === siteA.id) return Promise.resolve(siteA);
      if (orgId === testOrg.id && siteId === siteB.id) return Promise.resolve(siteB);
      return Promise.resolve(null);
    });

    vi.mocked(repos.sites.list).mockImplementation((orgId: string) => {
      if (orgId === testOrg.id) return Promise.resolve([siteA, siteB]);
      return Promise.resolve([]);
    });

    vi.mocked(repos.sites.listSummaries).mockResolvedValue(new Map());

    vi.mocked(repos.issues.findById).mockImplementation((orgId: string, issueId: string) => {
      if (orgId === testOrg.id && issueId === issueOnA.id) return Promise.resolve(issueOnA);
      if (orgId === testOrg.id && issueId === issueOnB.id) return Promise.resolve(issueOnB);
      return Promise.resolve(null);
    });

    vi.mocked(repos.issues.listBySite).mockImplementation((orgId: string, siteId: string) => {
      if (orgId === testOrg.id && siteId === siteA.id) return Promise.resolve([issueOnA]);
      if (orgId === testOrg.id && siteId === siteB.id) return Promise.resolve([issueOnB]);
      return Promise.resolve([]);
    });

    vi.mocked(repos.issues.listNotes).mockImplementation((_orgId: string, issueId: string) => {
      if (issueId === issueOnA.id) {
        return Promise.resolve([
          {
            id: 'note-1',
            issueId: issueOnA.id,
            authorId: adminUser.id,
            authorName: adminUser.name,
            body: 'Internal note for agency devs only',
            visibleToClient: false,
            createdAt: new Date(),
          },
          {
            id: 'note-2',
            issueId: issueOnA.id,
            authorId: adminUser.id,
            authorName: adminUser.name,
            body: 'Client visible note: fixing in next sprint',
            visibleToClient: true,
            createdAt: new Date(),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    // Memberships vs Client Access
    vi.mocked(repos.memberships.find).mockImplementation((orgId: string, userId: string) => {
      if (userId === adminUser.id) {
        return Promise.resolve({
          id: 'mem-admin',
          orgId,
          userId,
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

    // Client access: clientUser has access ONLY to siteA
    vi.mocked(repos.clientAccess.listByUserAndOrg).mockImplementation(
      (userId: string, orgId: string) => {
        if (userId === clientUser.id && orgId === testOrg.id) {
          return Promise.resolve([
            {
              id: 'ca-1',
              orgId,
              userId,
              siteId: siteA.id,
              createdAt: new Date(),
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    // Setup Express App
    app = express();
    app.use(express.json());
    app.use('/v1/orgs', orgsRouter(fakeAuth, repos, undefined, emailSender));
    app.use('/v1/invitations', invitationsRouter(repos, fakeAuth));
    app.use(errorHandler);
  });

  describe('1. Plan Limit Enforcement for Client Viewers', () => {
    it('rejects client viewer invitation on Store plan (422 PLAN_LIMIT)', async () => {
      currentUser = adminUser;
      const res = await request(app)
        .post(`/v1/orgs/${storeOrg.id}/invitations`)
        .send({
          email: 'client@store.com',
          role: 'client_viewer',
          siteIds: [siteA.id],
        });

      const body = res.body as ApiErrorResponse;
      expect(res.status).toBe(422);
      expect(body.error.code).toBe('PLAN_LIMIT');
      expect(body.error.message).toContain('Client viewer accounts are only available on Agency');
    });

    it('requires at least one siteId when inviting a client viewer (400 VALIDATION_ERROR)', async () => {
      currentUser = adminUser;
      const res = await request(app).post(`/v1/orgs/${testOrg.id}/invitations`).send({
        email: 'client@alphasite.com',
        role: 'client_viewer',
        siteIds: [],
      });

      const body = res.body as ApiErrorResponse;
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('At least one site must be selected');
    });

    it('validates that assigned siteIds belong to the organisation', async () => {
      currentUser = adminUser;
      const res = await request(app)
        .post(`/v1/orgs/${testOrg.id}/invitations`)
        .send({
          email: 'client@alphasite.com',
          role: 'client_viewer',
          siteIds: ['99999999-9999-4999-8999-999999999999'],
        });

      const body = res.body as ApiErrorResponse;
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('does not exist in this organisation');
    });

    it('creates invitation and sends branded email for client viewer on Agency plan', async () => {
      currentUser = adminUser;
      vi.mocked(repos.branding.findByOrgId).mockResolvedValue({
        id: 'brand-1',
        orgId: testOrg.id,
        displayName: 'Brightline White-label',
        logoLightKey: null,
        logoDarkKey: null,
        primaryColor: '#0055ff',
        emailSenderName: 'Brightline Notifications',
        reportFooter: null,
        hideProductBrand: false,
        customDomain: null,
        customDomainVerifiedAt: null,
        customDomainVerifyToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${testOrg.id}/invitations`)
        .send({
          email: 'client@alphasite.com',
          role: 'client_viewer',
          siteIds: [siteA.id],
        });

      expect(res.status).toBe(201);
      expect(repos.invitations.create).toHaveBeenCalledWith(
        testOrg.id,
        expect.objectContaining({
          email: 'client@alphasite.com',
          role: 'client_viewer',
          siteIds: [siteA.id],
        }),
      );

      // Verify branded email delivery
      expect(mockTransport.sent).toHaveLength(1);
      expect(mockTransport.sent[0]?.to).toBe('client@alphasite.com');
      expect(mockTransport.sent[0]?.html).toContain('Brightline');
    });
  });

  describe('2. Invitation Acceptance & Access Assignment', () => {
    it('grants client_access records and NOT memberships upon acceptance', async () => {
      vi.mocked(repos.invitations.findByToken).mockResolvedValue({
        invitation: {
          id: 'inv-client-1',
          orgId: testOrg.id,
          email: 'client@alphasite.com',
          role: 'client_viewer',
          siteIds: [siteA.id],
          tokenHash: 'hash',
          invitedBy: adminUser.id,
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        org: testOrg,
        isExpired: false,
        isAccepted: false,
        isRevoked: false,
      });

      currentUser = clientUser;

      const res = await request(app).post('/v1/invitations/accept').send({
        token: 'valid-raw-token',
      });

      expect(res.status).toBe(200);
      expect(repos.clientAccess.grantAccess).toHaveBeenCalledWith(testOrg.id, clientUser.id, [
        siteA.id,
      ]);
      expect(repos.memberships.add).not.toHaveBeenCalled();
      expect(repos.invitations.markAccepted).toHaveBeenCalledWith('inv-client-1');
    });
  });

  describe('3. Strict Isolation for Client Viewers (Security & Access Gates)', () => {
    beforeEach(() => {
      currentUser = clientUser;
    });

    it('client viewer can list only their assigned sites', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/sites`);

      expect(res.status).toBe(200);
      const sitesList = (res.body as ApiSitesResponse).data.sites;
      expect(sitesList).toHaveLength(1);
      expect(sitesList[0]?.id).toBe(siteA.id);
      expect(sitesList.some((s) => s.id === siteB.id)).toBe(false);
    });

    it('client viewer can view their assigned site overview', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/sites/${siteA.id}`);

      expect(res.status).toBe(200);
      const siteDetail = (res.body as ApiSiteDetailResponse).data.site;
      expect(siteDetail.id).toBe(siteA.id);
    });

    it('client viewer CANNOT view unassigned site overview (returns 404, never 403 or data leak)', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/sites/${siteB.id}`);

      expect(res.status).toBe(404);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('client viewer can list issues on their assigned site', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/sites/${siteA.id}/issues`);

      expect(res.status).toBe(200);
      const issuesList = (res.body as ApiIssuesResponse).data.items;
      expect(issuesList).toHaveLength(1);
      expect(issuesList[0]?.id).toBe(issueOnA.id);
    });

    it('client viewer CANNOT list issues on unassigned site (returns 404)', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/sites/${siteB.id}/issues`);

      expect(res.status).toBe(404);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('client viewer can view issue detail on assigned site', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/issues/${issueOnA.id}`);

      expect(res.status).toBe(200);
      const issueDetail = (res.body as ApiIssueDetailResponse).data.issue;
      expect(issueDetail.id).toBe(issueOnA.id);
    });

    it('client viewer CANNOT view issue detail on unassigned site (returns 404)', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/issues/${issueOnB.id}`);

      expect(res.status).toBe(404);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('client viewer sees ONLY notes marked visibleToClient === true', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/issues/${issueOnA.id}/notes`);

      expect(res.status).toBe(200);
      const items = (res.body as ApiNotesResponse).data.items;
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe('note-2');
      expect(items[0]?.visibleToClient).toBe(true);
      expect(items.some((n) => n.id === 'note-1')).toBe(false);
    });

    it('client viewer CANNOT modify issues (e.g. ignore returns 403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/v1/orgs/${testOrg.id}/issues/${issueOnA.id}/ignore`)
        .send({ reason: 'wont_fix', note: 'Customer accepted risk' });

      expect(res.status).toBe(403);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('client viewer CANNOT access organisation settings or members (returns 403 FORBIDDEN)', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/members`);

      expect(res.status).toBe(403);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('client viewer CANNOT access billing or invoices (returns 403 FORBIDDEN)', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/billing`);

      expect(res.status).toBe(403);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('client viewer CANNOT access audit logs (returns 403 FORBIDDEN)', async () => {
      const res = await request(app).get(`/v1/orgs/${testOrg.id}/audit-log`);

      expect(res.status).toBe(403);
      const body = res.body as ApiErrorResponse;
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Client Viewers Management (S-42 Endpoints)', () => {
    beforeEach(() => {
      currentUser = adminUser;
    });

    it('admin can list client viewers with their site access', async () => {
      vi.mocked(repos.clientAccess.listByOrg).mockResolvedValue([
        {
          user: {
            id: clientUser.id,
            email: clientUser.email,
            name: clientUser.name,
            avatarUrl: null,
          },
          sites: [
            {
              id: siteA.id,
              name: siteA.name,
              rootUrl: siteA.rootUrl,
              status: siteA.status,
              platform: siteA.platform,
            },
          ],
          createdAt: new Date(),
        },
      ]);

      const res = await request(app).get(`/v1/orgs/${testOrg.id}/clients`);

      expect(res.status).toBe(200);
      const clientsList = (res.body as ApiClientsResponse).data.clients;
      expect(clientsList).toHaveLength(1);
      expect(clientsList[0]?.user.email).toBe(clientUser.email);
      expect(clientsList[0]?.sites[0]?.id).toBe(siteA.id);
    });

    it('admin can update assigned sites for a client viewer', async () => {
      const res = await request(app)
        .put(`/v1/orgs/${testOrg.id}/clients/${clientUser.id}/sites`)
        .send({
          siteIds: [siteA.id, siteB.id],
        });

      expect(res.status).toBe(200);
      expect(repos.clientAccess.setSiteAccess).toHaveBeenCalledWith(testOrg.id, clientUser.id, [
        siteA.id,
        siteB.id,
      ]);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrg.id,
        expect.objectContaining({
          action: 'client_viewer.sites_updated',
          targetId: clientUser.id,
        }),
      );
    });

    it('admin can remove a client viewer entirely', async () => {
      const res = await request(app).delete(`/v1/orgs/${testOrg.id}/clients/${clientUser.id}`);

      expect(res.status).toBe(200);
      expect(repos.clientAccess.removeClientViewer).toHaveBeenCalledWith(testOrg.id, clientUser.id);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrg.id,
        expect.objectContaining({
          action: 'client_viewer.removed',
          targetId: clientUser.id,
        }),
      );
    });
  });
});
