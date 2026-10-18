import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Repositories } from '../../src/db/repositories/index.js';
import { buildTestApp } from '../helpers/fakes.js';
import { signReportDownloadToken, verifyReportDownloadToken } from '../../src/reports/token.js';
import { handleReportRender } from '../../src/worker/jobs/report-render.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { renderReportShared } from '../../src/emails/templates/index.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import type { Auth } from '../../src/lib/auth.js';

function createMockAuth() {
  const usersMap = new Map<string, { user: any; session: any }>();

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
    getSession: vi.fn(({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
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
    }),
  };

  return { api, getUser } as unknown as Auth & {
    api: typeof api;
    getUser: typeof getUser;
  };
}

describe('Report token generator and verifier', () => {
  it('creates and verifies a valid signed token', () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = signReportDownloadToken({
      reportId: 'rep-abc-123',
      orgId: 'org-xyz-789',
      exp,
    });

    const verified = verifyReportDownloadToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.reportId).toBe('rep-abc-123');
    expect(verified?.orgId).toBe('org-xyz-789');
    expect(verified?.exp).toBe(exp);
  });

  it('rejects an expired token', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 100;
    const token = signReportDownloadToken({
      reportId: 'rep-expired',
      orgId: 'org-xyz',
      exp: pastExp,
    });

    const verified = verifyReportDownloadToken(token);
    expect(verified).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = signReportDownloadToken({
      reportId: 'rep-valid',
      orgId: 'org-xyz',
      exp,
    });

    const tampered = token.slice(0, -4) + 'abcd';
    expect(verifyReportDownloadToken(tampered)).toBeNull();
  });
});

describe('E-11: Report ready / shared email template', () => {
  it('renders E-11 with correct subject, button, and accessible layout', () => {
    const output = renderReportShared({
      reportTitle: 'Accessibility Scan Summary',
      siteName: 'Oakhaus Furniture',
      senderName: 'Daniel Mwangi',
      message: 'Here is the scan report for our staging deployment.',
      downloadUrl: 'https://app.plainsight.test/v1/reports/download/token123',
      expiresInHours: 24,
    });

    expect(output.subject).toBe('Accessibility Scan Summary – Oakhaus Furniture');
    expect(output.html).toContain('Daniel Mwangi shared an accessibility report');
    expect(output.html).toContain('Here is the scan report for our staging deployment.');
    expect(output.html).toContain('Download report (PDF)');
    expect(output.html).toContain('https://app.plainsight.test/v1/reports/download/token123');
    expect(output.html).toContain('This secure download link is valid for 24 hours.');

    // Plain text version
    expect(output.text).toContain('Daniel Mwangi shared an accessibility report');
    expect(output.text).toContain('Download the report:');
  });
});

describe('Reports API Endpoints (Chunk P2-19)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const otherOrgId = '22222222-2222-4222-a222-222222222222';
  const memberId = 'user-member-123';
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
  let transport: MockTransport;
  let emailSender: EmailSender;

  beforeEach(() => {
    const auth = createMockAuth();
    transport = new MockTransport();
    emailSender = new EmailSender({ transport });

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
        oid === orgId && uid === memberId
          ? ({ orgId, userId: memberId, role: 'member', createdAt: new Date(), updatedAt: new Date() } as never)
          : null,
      ),
    );
  });

  describe('POST /v1/orgs/:orgId/reports', () => {
    it('generates a scan_summary report (R-01) for a valid scan', async () => {
      const validScanId = '33333333-3333-4333-a333-333333333333';
      const crossOrgScanId = '44444444-4444-4444-a444-444444444444';

      vi.mocked(repos.scans.findById).mockResolvedValueOnce({
        id: validScanId,
        orgId,
        siteId: 'site-1',
        score: 78,
      } as never);
      vi.mocked(repos.sites.findById).mockResolvedValueOnce({
        id: 'site-1',
        orgId,
        name: 'Oakhaus Furniture',
      } as never);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports`)
        .set('Cookie', [memberCookie])
        .send({
          type: 'scan_summary',
          scanId: validScanId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe('rep-123');
    });

    it('returns 400 when neither siteId nor scanId is provided', async () => {
      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports`)
        .set('Cookie', [memberCookie])
        .send({
          type: 'scan_summary',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('enforces multi-tenancy: returns 404 if scan belongs to another org', async () => {
      const crossOrgScanId = '44444444-4444-4444-a444-444444444444';
      vi.mocked(repos.scans.findById).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports`)
        .set('Cookie', [memberCookie])
        .send({
          type: 'scan_summary',
          scanId: crossOrgScanId,
        });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/orgs/:orgId/reports', () => {
    it('lists reports for the organization', async () => {
      vi.mocked(repos.reports.listByOrg).mockResolvedValueOnce({
        reports: [
          {
            id: 'rep-1',
            orgId,
            siteId: 'site-1',
            scanId: 'scan-1',
            type: 'scan_summary',
            status: 'ready',
            fileKey: `reports/${orgId}/rep-1.pdf`,
            fileSize: 1024,
            branded: false,
            requestedBy: memberId,
            expiresAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            siteName: 'Oakhaus Furniture',
          },
        ],
        total: 1,
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/reports`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('rep-1');
    });
  });

  describe('GET /v1/orgs/:orgId/reports/:id/download', () => {
    it('returns signed download URL for a ready report', async () => {
      vi.mocked(repos.reports.findById).mockResolvedValueOnce({
        id: 'rep-ready-1',
        orgId,
        siteId: 'site-1',
        scanId: 'scan-1',
        type: 'scan_summary',
        status: 'ready',
        fileKey: `reports/${orgId}/rep-ready-1.pdf`,
        fileSize: 1024,
        branded: false,
        requestedBy: memberId,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/reports/rep-ready-1/download`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.downloadUrl).toMatch(/^\/v1\/reports\/download\//);
      expect(res.body.data.expiresAt).toBeDefined();
    });

    it('returns 409 when report is still generating', async () => {
      vi.mocked(repos.reports.findById).mockResolvedValueOnce({
        id: 'rep-pending-1',
        orgId,
        siteId: 'site-1',
        scanId: 'scan-1',
        type: 'scan_summary',
        status: 'rendering',
        fileKey: null,
        fileSize: null,
        branded: false,
        requestedBy: memberId,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/reports/rep-pending-1/download`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REPORT_NOT_READY');
    });

    it('enforces multi-tenancy: returns 404 for report belonging to another org', async () => {
      vi.mocked(repos.reports.findById).mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/reports/rep-cross-org/download`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/orgs/:orgId/reports/:id/send', () => {
    it('sends report via email to up to 10 recipients', async () => {
      vi.mocked(repos.reports.findById).mockResolvedValueOnce({
        id: 'rep-ready-1',
        orgId,
        siteId: 'site-1',
        scanId: 'scan-1',
        type: 'scan_summary',
        status: 'ready',
        siteName: 'Oakhaus Furniture',
        fileKey: `reports/${orgId}/rep-ready-1.pdf`,
        fileSize: 1024,
        branded: false,
        requestedBy: memberId,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports/rep-ready-1/send`)
        .set('Cookie', [memberCookie])
        .send({
          recipients: ['client@example.com', 'developer@example.com'],
          message: 'Please review our weekly accessibility report.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.sent).toBe(true);
      expect(res.body.data.recipientCount).toBe(2);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'report.sent',
        }),
      );
    });

    it('rejects more than 10 recipients with 400', async () => {
      const elevenRecipients = Array.from({ length: 11 }, (_, i) => `user${i}@example.com`);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/reports/rep-ready-1/send`)
        .set('Cookie', [memberCookie])
        .send({
          recipients: elevenRecipients,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('Worker job: handleReportRender', () => {
  it('renders report PDF and transitions status to ready', async () => {
    const storage = new MemoryStorageService();
    const updateStatus = vi.fn().mockResolvedValue({ id: 'rep-1', status: 'ready' });
    const writeAudit = vi.fn().mockResolvedValue(undefined);

    const repos = {
      reports: {
        findRawById: vi.fn().mockResolvedValue({
          id: 'rep-1',
          orgId: '11111111-1111-4111-a111-111111111111',
          siteId: 'site-1',
          scanId: 'scan-1',
          type: 'scan_summary',
          status: 'queued',
          scanScore: 84,
          requestedBy: 'user-1',
        }),
        updateStatus,
      },
      scans: {
        findRawById: vi.fn().mockResolvedValue({
          id: 'scan-1',
          score: 84,
          rawKey: null,
        }),
      },
      sites: {
        findRawById: vi.fn().mockResolvedValue({
          id: 'site-1',
          name: 'Oakhaus Furniture',
          rootUrl: 'https://oakhaus.com',
          platform: 'shopify',
        }),
      },
      auditLog: {
        write: writeAudit,
      },
    } as any;

    await handleReportRender({ reportId: 'rep-1' }, { repos, storage });

    // Status updated to rendering first, then ready
    expect(updateStatus).toHaveBeenCalledWith('rep-1', 'rendering');
    expect(updateStatus).toHaveBeenCalledWith(
      'rep-1',
      'ready',
      expect.objectContaining({
        fileKey: 'reports/11111111-1111-4111-a111-111111111111/rep-1.pdf',
      }),
    );

    // File saved in storage
    const pdf = await storage.getObject('reports/11111111-1111-4111-a111-111111111111/rep-1.pdf');
    expect(pdf).not.toBeNull();
    expect(pdf?.toString('utf-8')).toContain('%PDF');

    // Audit log written
    expect(writeAudit).toHaveBeenCalledWith(
      '11111111-1111-4111-a111-111111111111',
      expect.objectContaining({
        action: 'report.generated',
      }),
    );
  });
});
