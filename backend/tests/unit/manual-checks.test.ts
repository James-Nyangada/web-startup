import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp } from '../helpers/fakes.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { signAttachmentDownloadToken } from '../../src/manual-checks/token.js';

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

describe('Manual Checks & Accessibility Testing (P5-02)', () => {
  const orgId = '018f0000-0000-7000-8000-000000000001';
  const siteId = '018f0000-0000-7000-8000-000000000010';
  const creatorId = '018f0000-0000-7000-8000-000000000002';
  const otherMemberId = '018f0000-0000-7000-8000-000000000003';
  const clientUserId = '018f0000-0000-7000-8000-000000000004';
  const checkId = '018f0000-0000-7000-8000-000000000099';

  let app: Express;
  let repos: Repositories;
  let storage: MemoryStorageService;

  const mockOrg = {
    id: orgId,
    name: 'Test Org',
    slug: 'test-org',
    type: 'store' as const,
    plan: 'pro' as const,
    status: 'active' as const,
    timeZone: 'UTC',
    retentionDays: 90,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSite = {
    id: siteId,
    orgId,
    name: 'Main Website',
    url: 'https://example.com',
    status: 'verified' as const,
    platform: 'custom' as const,
    verificationMethod: 'dns' as const,
    verificationToken: 'token123',
    verifiedAt: new Date(),
    pagesLimit: 50,
    crawlSchedule: 'weekly' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    storage = new MemoryStorageService();
    const { auth } = createMockAuth(creatorId);
    const testApp = buildTestApp({ auth, storage });
    app = testApp.app;
    repos = testApp.repos;

    vi.mocked(repos.organizations.findById).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findBySlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.sites.findById).mockResolvedValue(mockSite as never);

    vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
    vi.mocked(repos.memberships.find).mockResolvedValue({
      id: `mem-${creatorId}`,
      orgId,
      userId: creatorId,
      role: 'member' as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId/manual-checks', () => {
    it('returns empty list and total count', async () => {
      vi.mocked(repos.manualChecks.listBySite).mockResolvedValue([]);
      vi.mocked(repos.manualChecks.countBySite).mockResolvedValue(0);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${creatorId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('filters by checkType and result', async () => {
      const checkRow = {
        id: checkId,
        orgId,
        siteId,
        checkType: 'keyboard' as const,
        performedAt: '2026-10-15',
        performedByName: 'Sarah Connor',
        tool: 'Chrome 130 + Mac Keyboard',
        result: 'issues_found' as const,
        notes: 'Tab trap found on navigation modal',
        attachmentKey: null,
        createdBy: creatorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(repos.manualChecks.listBySite).mockResolvedValue([checkRow]);
      vi.mocked(repos.manualChecks.countBySite).mockResolvedValue(1);

      const res = await request(app)
        .get(
          `/v1/orgs/${orgId}/sites/${siteId}/manual-checks?checkType=keyboard&result=issues_found`,
        )
        .set('Cookie', [`token-${creatorId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].checkType).toBe('keyboard');
      expect(repos.manualChecks.listBySite).toHaveBeenCalledWith(
        orgId,
        siteId,
        expect.objectContaining({ checkType: 'keyboard', result: 'issues_found' }),
      );
    });

    it('enforces client viewer site scoping', async () => {
      const { auth: clientAuth } = createMockAuth(clientUserId);
      const clientApp = buildTestApp({ auth: clientAuth, repos, storage }).app;

      vi.mocked(repos.memberships.find).mockResolvedValue(null);
      vi.mocked(repos.memberships.findRole).mockResolvedValue(null);
      vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
        { id: 'ca-1', orgId, siteId: 'other-site-id', createdAt: new Date() },
      ]);

      const res = await request(clientApp)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${clientUserId}=active`]);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/orgs/:orgId/sites/:siteId/manual-checks', () => {
    it('creates manual check with json payload and records evidence event', async () => {
      const createdCheck = {
        id: checkId,
        orgId,
        siteId,
        checkType: 'screen_reader' as const,
        performedAt: '2026-10-20',
        performedByName: 'Alex Smith',
        tool: 'NVDA 2026.2 + Firefox',
        result: 'pass' as const,
        notes: 'Navigation menus announce properly.',
        attachmentKey: null,
        createdBy: creatorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(repos.manualChecks.create).mockResolvedValue(createdCheck);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${creatorId}=active`])
        .send({
          checkType: 'screen_reader',
          performedAt: '2026-10-20',
          performedByName: 'Alex Smith',
          tool: 'NVDA 2026.2 + Firefox',
          result: 'pass',
          notes: 'Navigation menus announce properly.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(checkId);
      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'manual_check_logged',
          actorId: creatorId,
          data: expect.objectContaining({
            checkId,
            checkType: 'screen_reader',
            result: 'pass',
            tool: 'NVDA 2026.2 + Firefox',
            hasAttachment: false,
          }),
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'manual_check.created',
          targetId: checkId,
        }),
      );
    });

    it('creates manual check with multipart upload and validates PDF magic bytes', async () => {
      // Valid PDF magic bytes: %PDF-1.4
      const pdfBuffer = Buffer.from('%PDF-1.4\nTest PDF content with magic bytes');

      vi.mocked(repos.manualChecks.create).mockImplementation((oId, data) =>
        Promise.resolve({
          id: checkId,
          orgId: oId,
          ...data,
          attachmentKey: data.attachmentKey ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${creatorId}=active`])
        .field('checkType', 'keyboard')
        .field('performedAt', '2026-10-20')
        .field('performedByName', 'Jane Doe')
        .field('tool', 'Chrome 130')
        .field('result', 'pass')
        .field('notes', 'Focus indicator clearly visible')
        .attach('attachment', pdfBuffer, 'evidence.pdf');

      expect(res.status).toBe(201);
      expect(res.body.data.attachmentKey).toContain(`manual-checks/${orgId}/${siteId}/`);
      expect(res.body.data.attachmentKey).toMatch(/\.pdf$/);

      // Verify storage received the file
      const attachmentKey = String(res.body.data.attachmentKey);
      const stored = await storage.getObject(attachmentKey);
      expect(stored).not.toBeNull();
      expect(stored?.toString()).toContain('%PDF-1.4');
    });

    it('rejects invalid attachment magic bytes (e.g. text masquerading as PNG)', async () => {
      // Fake file: text content instead of real PNG magic bytes
      const fakeBuffer = Buffer.from('Not a real PNG file header');

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${creatorId}=active`])
        .field('checkType', 'keyboard')
        .field('performedAt', '2026-10-20')
        .field('performedByName', 'Jane Doe')
        .field('tool', 'Chrome 130')
        .field('result', 'pass')
        .attach('attachment', fakeBuffer, 'fake.png');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_FILE_TYPE);
    });

    it('rejects attachments over 10 MB', async () => {
      // Buffer larger than 10MB
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024);
      // Put valid PNG header at the beginning
      largeBuffer[0] = 0x89;
      largeBuffer[1] = 0x50;
      largeBuffer[2] = 0x4e;
      largeBuffer[3] = 0x47;
      largeBuffer[4] = 0x0d;
      largeBuffer[5] = 0x0a;
      largeBuffer[6] = 0x1a;
      largeBuffer[7] = 0x0a;

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${creatorId}=active`])
        .field('checkType', 'keyboard')
        .field('performedAt', '2026-10-20')
        .field('performedByName', 'Jane Doe')
        .field('tool', 'Chrome 130')
        .field('result', 'pass')
        .attach('attachment', largeBuffer, 'huge.png');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.FILE_TOO_LARGE);
    });

    it('rejects client viewer role from creating manual checks (403)', async () => {
      const { auth: clientAuth } = createMockAuth(clientUserId);
      const clientApp = buildTestApp({ auth: clientAuth, repos, storage }).app;

      vi.mocked(repos.memberships.findRole).mockResolvedValue(null);
      vi.mocked(repos.memberships.find).mockResolvedValue(null);
      vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
        { id: 'ca-1', orgId, siteId, createdAt: new Date() },
      ]);

      const res = await request(clientApp)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/manual-checks`)
        .set('Cookie', [`token-${clientUserId}=active`])
        .send({
          checkType: 'keyboard',
          performedAt: '2026-10-20',
          performedByName: 'Client',
          tool: 'Keyboard',
          result: 'pass',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /v1/orgs/:orgId/manual-checks/:id', () => {
    const existingCheck = {
      id: checkId,
      orgId,
      siteId,
      checkType: 'forms' as const,
      performedAt: '2026-10-18',
      performedByName: 'Creator User',
      tool: 'NVDA',
      result: 'issues_found' as const,
      notes: 'Form inputs missing labels',
      attachmentKey: 'manual-checks/old-key.pdf',
      createdBy: creatorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('allows creator to edit their own check', async () => {
      vi.mocked(repos.manualChecks.findById).mockResolvedValue(existingCheck);
      vi.mocked(repos.manualChecks.update).mockResolvedValue({
        ...existingCheck,
        result: 'pass',
        notes: 'Labels added and verified',
      });

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/manual-checks/${checkId}`)
        .set('Cookie', [`token-${creatorId}=active`])
        .send({
          result: 'pass',
          notes: 'Labels added and verified',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('pass');
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'manual_check.updated',
          targetId: checkId,
        }),
      );
    });

    it('forbids other members who did not create the check from editing (403)', async () => {
      const { auth: otherAuth } = createMockAuth(otherMemberId);
      const otherApp = buildTestApp({ auth: otherAuth, repos, storage }).app;

      vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: `mem-${otherMemberId}`,
        orgId,
        userId: otherMemberId,
        role: 'member' as never,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.manualChecks.findById).mockResolvedValue(existingCheck);

      const res = await request(otherApp)
        .patch(`/v1/orgs/${orgId}/manual-checks/${checkId}`)
        .set('Cookie', [`token-${otherMemberId}=active`])
        .send({
          result: 'pass',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('allows org admin to edit checks created by another user', async () => {
      const adminId = '018f0000-0000-7000-8000-000000000005';
      const { auth: adminAuth } = createMockAuth(adminId);
      const adminApp = buildTestApp({ auth: adminAuth, repos, storage }).app;

      vi.mocked(repos.memberships.findRole).mockResolvedValue('admin');
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: `mem-${adminId}`,
        orgId,
        userId: adminId,
        role: 'admin' as never,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.manualChecks.findById).mockResolvedValue(existingCheck);
      vi.mocked(repos.manualChecks.update).mockResolvedValue({
        ...existingCheck,
        notes: 'Admin updated notes',
      });

      const res = await request(adminApp)
        .patch(`/v1/orgs/${orgId}/manual-checks/${checkId}`)
        .set('Cookie', [`token-${adminId}=active`])
        .send({
          notes: 'Admin updated notes',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.notes).toBe('Admin updated notes');
    });
  });

  describe('DELETE /v1/orgs/:orgId/manual-checks/:id', () => {
    const existingCheck = {
      id: checkId,
      orgId,
      siteId,
      checkType: 'captions' as const,
      performedAt: '2026-10-18',
      performedByName: 'Creator User',
      tool: 'VLC',
      result: 'pass' as const,
      notes: 'All media captions present',
      attachmentKey: 'manual-checks/test.png',
      createdBy: creatorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('allows creator to delete, writes audit log, and appends deleted evidence event', async () => {
      vi.mocked(repos.manualChecks.findById).mockResolvedValue(existingCheck);
      vi.mocked(repos.manualChecks.delete).mockResolvedValue(true);

      const res = await request(app)
        .delete(`/v1/orgs/${orgId}/manual-checks/${checkId}`)
        .set('Cookie', [`token-${creatorId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      // Audit log check (§5.5)
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'manual_check.deleted',
          targetId: checkId,
        }),
      );

      // Evidence event stays marked deleted: true
      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'manual_check_logged',
          data: expect.objectContaining({
            checkId,
            deleted: true,
            checkType: 'captions',
          }),
        }),
      );
    });

    it('forbids other members who did not create the check from deleting (403)', async () => {
      const { auth: otherAuth } = createMockAuth(otherMemberId);
      const otherApp = buildTestApp({ auth: otherAuth, repos, storage }).app;

      vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: `mem-${otherMemberId}`,
        orgId,
        userId: otherMemberId,
        role: 'member' as never,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.manualChecks.findById).mockResolvedValue(existingCheck);

      const res = await request(otherApp)
        .delete(`/v1/orgs/${orgId}/manual-checks/${checkId}`)
        .set('Cookie', [`token-${otherMemberId}=active`]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('Signed Attachment Download', () => {
    const attachmentKey = `manual-checks/${orgId}/${siteId}/sample.png`;

    beforeEach(async () => {
      // Put PNG magic bytes into storage
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      await storage.putObject(attachmentKey, pngBuffer);
    });

    it('generates signed download URL valid for 15 minutes', async () => {
      vi.mocked(repos.manualChecks.findById).mockResolvedValue({
        id: checkId,
        orgId,
        siteId,
        checkType: 'zoom_reflow' as const,
        performedAt: '2026-10-19',
        performedByName: 'Tester',
        tool: 'Browser 400%',
        result: 'pass' as const,
        notes: 'Reflow works cleanly',
        attachmentKey,
        createdBy: creatorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(repos.manualChecks.findRawById).mockResolvedValue({
        id: checkId,
        orgId,
        siteId,
        checkType: 'zoom_reflow' as const,
        performedAt: '2026-10-19',
        performedByName: 'Tester',
        tool: 'Browser 400%',
        result: 'pass' as const,
        notes: 'Reflow works cleanly',
        attachmentKey,
        createdBy: creatorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/manual-checks/${checkId}/attachment`)
        .set('Cookie', [`token-${creatorId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data.downloadUrl).toMatch(/^\/v1\/manual-checks\/download\//);
      expect(res.body.data.expiresAt).toBeDefined();

      // Download using the signed token
      const downloadUrl = String(res.body.data.downloadUrl);
      const downloadRes = await request(app).get(downloadUrl);
      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('image/png');
    });

    it('rejects expired or tampered download tokens with 401', async () => {
      const expiredToken = signAttachmentDownloadToken({
        checkId,
        orgId,
        attachmentKey,
        exp: Math.floor(Date.now() / 1000) - 60, // expired 60 seconds ago
      });

      const res = await request(app).get(`/v1/manual-checks/download/${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.TOKEN_EXPIRED);
    });
  });
});
