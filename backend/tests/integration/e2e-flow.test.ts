import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';
import { assertCrossOrg404 } from '../helpers/cross-org.js';

import { verifyOwnership } from '../../src/scanner/verification/verify.js';

vi.mock('../../src/scanner/verification/verify.js', () => ({
  verifyOwnership: vi.fn(),
}));

describe('Phase 2 End-to-End Core App Flow (Section 13.2, Chunk P2-23)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const otherOrgId = '22222222-2222-4222-a222-222222222222';
  const siteId = '11111111-2222-4333-a444-555555555555';
  const scanId = '66666666-7777-4888-a999-000000000000';
  const issueId = 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee';
  const reportId = 'ffffffff-1111-4222-a333-444444444444';
  const userId = 'user-owner-123';
  const newMemberId = 'user-member-456';

  const ownerCookie = 'better-auth.session_token=token-owner';

  const mockOrg = {
    id: orgId,
    name: 'Brightline Studio',
    slug: 'brightline',
    type: 'agency' as const,
    plan: 'agency' as const,
    billingStatus: 'active' as const,
    timeZone: 'Europe/London',
    trialEndsAt: null,
    paddleCustomerId: null,
    pastDueSince: null,
    planOverride: null,
    planOverrideExpiresAt: null,
    planOverrideReason: null,
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
    verifyMethod: 'file' as const,
    verifyToken: 'ps_verify_tok_123',
    verifiedAt: new Date(),
    verifyFailureCount: 0,
    scanFrequency: 'weekly' as const,
    scanDay: 1,
    scanHour: 2,
    pageLimit: 50,
    standard: 'wcag22aa' as const,
    pinnedUrls: [],
    excludedPaths: [],
    authNote: null,
    score: 82,
    lastScanId: scanId,
    nextScanAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockIssue = {
    id: issueId,
    orgId,
    siteId,
    fingerprint: 'fp-contrast-1',
    ruleId: 'color-contrast',
    title: 'Text has insufficient contrast against background',
    description: 'Ensure text contrast meets 4.5:1 ratio',
    impact: 'critical' as const,
    wcagCriteria: ['1.4.3 Contrast (Minimum)'],
    wcagLevel: 'AA' as const,
    templateKey: 'product',
    selector: '.product-price',
    htmlSnippet: '<span class="product-price">$45.00</span>',
    failureSummary: 'Element has insufficient color contrast of 2.8:1',
    status: 'open' as const,
    ignoredReason: null,
    ignoredNote: null,
    isRegression: false,
    regressionCount: 0,
    occurrenceCount: 3,
    assigneeId: null,
    assigneeName: null,
    dueDate: null,
    needsReview: false,
    firstSeenScanId: scanId,
    lastSeenScanId: scanId,
    fixedScanId: null,
    fixedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createMockAuth() {
    const mockUser = {
      id: userId,
      email: 'owner@brightline.studio',
      name: 'Daniel Mwangi',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      avatarUrl: null,
      timeZone: 'Europe/London',
      isStaff: false,
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      lastActiveOrgId: orgId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const mockSession = {
      id: 'session-owner-123',
      userId: mockUser.id,
      token: 'token-owner',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const api = {
      getSession: vi
        .fn()
        .mockImplementation(
          ({ headers }: { headers?: Headers | Record<string, string | undefined> }) => {
            let cookie = '';
            if (headers instanceof Headers) {
              cookie = headers.get('cookie') || '';
            } else if (headers && typeof headers === 'object' && 'cookie' in headers) {
              cookie = String(headers.cookie || '');
            }
            if (cookie.includes('token-owner')) {
              return Promise.resolve({ user: mockUser, session: mockSession });
            }
            if (cookie.includes('token-member')) {
              return Promise.resolve({
                user: {
                  ...mockUser,
                  id: newMemberId,
                  email: 'member@brightline.studio',
                  name: 'Aisha Kamau',
                },
                session: { ...mockSession, userId: newMemberId, token: 'token-member' },
              });
            }
            return Promise.resolve(null);
          },
        ),
      listSessions: vi.fn().mockResolvedValue([mockSession]),
      revokeSession: vi.fn().mockResolvedValue({ success: true }),
      changePassword: vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
      signOut: vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    };

    return { api, mockUser, mockSession };
  }

  let mockAuth: ReturnType<typeof createMockAuth>;

  beforeEach(() => {
    mockAuth = createMockAuth();
  });

  it('completes the full flow: onboarding -> site -> scan -> issues -> ignore -> export CSV -> report -> invite', async () => {
    const { app, repos } = buildTestApp({ auth: mockAuth as unknown as Auth });

    // Mock initial user and memberships
    vi.mocked(repos.users.findById).mockResolvedValue(mockAuth.mockUser);
    vi.mocked(repos.organizations.findByIdOrSlug).mockImplementation((param: string) => {
      if (param === orgId || param === mockOrg.slug) {
        return Promise.resolve(mockOrg as never);
      }
      return Promise.resolve(null);
    });
    vi.mocked(repos.organizations.findById).mockImplementation((param: string) => {
      if (param === orgId) {
        return Promise.resolve(mockOrg as never);
      }
      return Promise.resolve(null);
    });
    vi.mocked(repos.memberships.findRole).mockResolvedValue('owner');
    vi.mocked(repos.memberships.find).mockImplementation((oid: string, uid: string) => {
      if (oid === orgId && uid === userId) {
        return Promise.resolve({
          id: 'mem-1',
          orgId,
          userId,
          role: 'owner',
          createdAt: new Date(),
        } as never);
      }
      return Promise.resolve(null);
    });
    vi.mocked(repos.sites.findById).mockResolvedValue(mockSite);
    vi.mocked(repos.sites.count).mockResolvedValue(1);
    vi.mocked(verifyOwnership).mockResolvedValue({
      ok: true,
      method: 'file',
    });

    // 1. Account details check (S-48 Account settings)
    const meRes = await request(app).get('/v1/me').set('Cookie', ownerCookie).expect(200);

    expect(meRes.body.data.user.email).toBe('owner@brightline.studio');
    expect(meRes.body.data.user.name).toBe('Daniel Mwangi');

    // 2. Profile update (PATCH /v1/me)
    vi.mocked(repos.users.update).mockResolvedValueOnce({
      ...mockAuth.mockUser,
      timeZone: 'Europe/Paris',
    });

    const patchMeRes = await request(app)
      .patch('/v1/me')
      .set('Cookie', ownerCookie)
      .send({ timeZone: 'Europe/Paris' })
      .expect(200);

    expect(patchMeRes.body.data.user.timeZone).toBe('Europe/Paris');

    // 3. Site verification check (POST /v1/orgs/:orgId/sites/:siteId/verify)
    vi.mocked(repos.sites.setVerified).mockResolvedValueOnce({
      ...mockSite,
      status: 'active',
    } as never);

    // Using verification endpoint
    const verifyRes = await request(app)
      .post(`/v1/orgs/${orgId}/sites/${siteId}/verify`)
      .set('Cookie', ownerCookie)
      .send({ method: 'file' })
      .expect(200);

    expect(verifyRes.body.data.verified).toBe(true);

    // 4. Trigger on-demand scan (POST /v1/orgs/:orgId/sites/:siteId/scans)
    vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValue(null);
    vi.mocked(repos.scans.create).mockResolvedValueOnce({
      id: scanId,
      orgId,
      siteId,
      number: 1,
      status: 'queued',
      trigger: 'manual',
      score: null,
      errorReason: null,
      startedAt: null,
      finishedAt: null,
      cancelledAt: null,
      pagesScanned: 0,
      pagesTotal: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const scanRes = await request(app)
      .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
      .set('Cookie', ownerCookie)
      .send({ trigger: 'manual' })
      .expect(201);

    expect(scanRes.body.data.scan.id).toBe(scanId);

    // 5. Query issues list (GET /v1/orgs/:orgId/sites/:siteId/issues)
    vi.mocked(repos.issues.listBySite).mockResolvedValue([mockIssue]);
    vi.mocked(repos.issues.countBySite).mockResolvedValue(1);
    vi.mocked(repos.issues.getSeverityCounts).mockResolvedValue({
      critical: 1,
      serious: 0,
      moderate: 0,
      minor: 0,
    });

    const issuesRes = await request(app)
      .get(`/v1/orgs/${orgId}/sites/${siteId}/issues?status=open`)
      .set('Cookie', ownerCookie)
      .expect(200);

    expect(issuesRes.body.data.items).toHaveLength(1);
    expect(issuesRes.body.data.items[0].ruleId).toBe('color-contrast');

    // 6. Ignore issue with reason and note (POST /v1/orgs/:orgId/issues/:issueId/ignore)
    vi.mocked(repos.issues.findById).mockResolvedValueOnce(mockIssue as never);
    vi.mocked(repos.issues.ignore).mockResolvedValueOnce({
      ...mockIssue,
      status: 'ignored',
      ignoredReason: 'accepted_risk',
      ignoredNote: 'Approved brand tertiary accent color.',
    } as never);

    const ignoreRes = await request(app)
      .post(`/v1/orgs/${orgId}/issues/${issueId}/ignore`)
      .set('Cookie', ownerCookie)
      .send({
        reason: 'accepted_risk',
        note: 'Approved brand tertiary accent color.',
      })
      .expect(200);

    expect(ignoreRes.body.data.issue.status).toBe('ignored');

    // 7. CSV Export (GET /v1/orgs/:orgId/sites/:siteId/issues/export.csv)
    vi.mocked(repos.issues.listBySite).mockResolvedValueOnce([mockIssue]);

    const csvRes = await request(app)
      .get(`/v1/orgs/${orgId}/sites/${siteId}/issues/export.csv`)
      .set('Cookie', ownerCookie)
      .expect(200);

    expect(csvRes.headers['content-type']).toContain('text/csv');
    // Ensure UTF-8 BOM is prepended
    expect(csvRes.text.charCodeAt(0)).toBe(0xfeff);
    expect(csvRes.text).toContain('Issue ID,Rule ID,Rule Title,Impact');
    expect(csvRes.text).toContain('color-contrast');

    // 8. Generate Report R-01 (POST /v1/orgs/:orgId/reports)
    vi.mocked(repos.scans.findById).mockResolvedValue({
      id: scanId,
      orgId,
      siteId,
      number: 1,
      status: 'completed',
      rawKey: `scans/${orgId}/${scanId}/raw.json`,
      trigger: 'manual',
      score: 82,
      errorReason: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      cancelledAt: null,
      pagesScanned: 50,
      pagesTotal: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.mocked(repos.reports.create).mockResolvedValueOnce({
      id: reportId,
      orgId,
      siteId,
      scanId,
      type: 'scan_summary',
      status: 'queued',
      paperSize: 'a4',
      branding: true,
      fileKey: null,
      fileSize: null,
      failureReason: null,
      renderStartedAt: null,
      renderedAt: null,
      expiresAt: new Date(Date.now() + 86400000 * 30),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const reportRes = await request(app)
      .post(`/v1/orgs/${orgId}/reports`)
      .set('Cookie', ownerCookie)
      .send({
        type: 'scan_summary',
        scanId,
        siteId,
      })
      .expect(201);

    expect(reportRes.body.data.id).toBe(reportId);

    // 9. Download Report signed URL (GET /v1/orgs/:orgId/reports/:id/download)
    vi.mocked(repos.reports.findById).mockResolvedValueOnce({
      id: reportId,
      orgId,
      siteId,
      scanId,
      type: 'scan_summary',
      status: 'ready',
      paperSize: 'a4',
      branding: true,
      fileKey: `reports/${orgId}/${reportId}.pdf`,
      fileSize: 102400,
      failureReason: null,
      renderStartedAt: new Date(),
      renderedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000 * 30),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const downloadRes = await request(app)
      .get(`/v1/orgs/${orgId}/reports/${reportId}/download`)
      .set('Cookie', ownerCookie)
      .expect(200);

    expect(downloadRes.body.data.downloadUrl).toContain('/v1/reports/download/');
    expect(downloadRes.body.data.expiresAt).toBeDefined();

    // 10. Invite team member (POST /v1/orgs/:orgId/invitations)
    vi.mocked(repos.invitations.create).mockResolvedValueOnce({
      invitation: {
        id: 'inv-123',
        orgId,
        email: 'aisha@brightline.studio',
        role: 'member',
        siteIds: [],
        tokenHash: 'hashed_tok',
        invitedBy: userId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      rawToken: 'mock_raw_token_xyz',
    } as never);

    const inviteRes = await request(app)
      .post(`/v1/orgs/${orgId}/invitations`)
      .set('Cookie', ownerCookie)
      .send({
        email: 'aisha@brightline.studio',
        role: 'member',
      })
      .expect(201);

    expect(inviteRes.body.data.invitation.email).toBe('aisha@brightline.studio');

    // 11. Multi-tenant boundary check: Cross-org access returns 404
    await assertCrossOrg404(app, {
      method: 'get',
      path: `/v1/orgs/${otherOrgId}/sites/${siteId}/issues`,
      sessionCookie: ownerCookie,
    });
  });
});
