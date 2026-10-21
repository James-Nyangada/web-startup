import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Repositories } from '../../src/db/repositories/index.js';
import { buildTestApp } from '../helpers/fakes.js';
import { handleScanProcess } from '../../src/worker/jobs/scan-process.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import type { Auth } from '../../src/lib/auth.js';
import type { EmailSender } from '../../src/emails/sender.js';
import type pg from 'pg';

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

describe('Notifications & Preferences API (P5-05)', () => {
  let app: Express;
  let repos: Repositories;

  const orgId = '018f0000-0000-7000-8000-000000000001';
  const userId = '018f0000-0000-7000-8000-000000000002';
  const memberCookie = `token-${userId}`;

  beforeEach(() => {
    const { auth } = createMockAuth(userId);
    const testApp = buildTestApp({ auth });
    app = testApp.app;
    repos = testApp.repos;

    const mockOrg = {
      id: orgId,
      name: 'Brightline Agency',
      slug: 'brightline',
      plan: 'agency' as const,
      status: 'active' as const,
      billingStatus: 'active',
      timeZone: 'UTC',
      retentionDays: 90,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(repos.organizations.findById).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findBySlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.memberships.findRole).mockResolvedValue('member');

    repos.memberships.find = vi.fn().mockResolvedValue({
      id: 'mem-1',
      orgId,
      userId,
      role: 'member',
    });
    repos.users.listMemberships = vi.fn().mockResolvedValue([{ orgId, role: 'member' }]);
  });

  describe('GET /v1/orgs/:orgId/notifications', () => {
    it('returns user notifications and unread count', async () => {
      repos.notifications.listInAppByUser = vi.fn().mockResolvedValue([
        {
          id: 'notif-1',
          orgId,
          userId,
          type: 'regression_alert',
          title: 'Regression detected',
          body: 'Image alt missing',
          link: '/sites/site-1/issues',
          readAt: null,
          createdAt: new Date(),
        },
      ]);
      repos.notifications.countUnreadInApp = vi.fn().mockResolvedValue(1);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/notifications`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.unreadCount).toBe(1);
      expect(res.body.data.items[0].title).toBe('Regression detected');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/v1/orgs/${orgId}/notifications`);
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /v1/orgs/:orgId/notifications/:id/read', () => {
    it('marks a notification as read', async () => {
      repos.notifications.markInAppRead = vi.fn().mockResolvedValue(true);

      const res = await request(app)
        .patch(`/v1/orgs/${orgId}/notifications/notif-1/read`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(repos.notifications.markInAppRead).toHaveBeenCalledWith(orgId, userId, 'notif-1');
    });
  });

  describe('POST /v1/orgs/:orgId/notifications/read-all', () => {
    it('marks all notifications as read', async () => {
      repos.notifications.markAllInAppRead = vi.fn().mockResolvedValue(3);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/notifications/read-all`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.updatedCount).toBe(3);
    });
  });

  describe('Notification Preferences (/notification-preferences)', () => {
    it('gets user notification preferences', async () => {
      repos.notifications.getPreferences = vi.fn().mockResolvedValue({
        scanCompleted: 'all',
        regressions: true,
        weeklyDigest: true,
        billing: true,
      });

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/notification-preferences`)
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.preferences.regressions).toBe(true);
    });

    it('updates user notification preferences with validation', async () => {
      repos.notifications.updatePreferences = vi.fn().mockResolvedValue({
        scanCompleted: 'issues_only',
        regressions: false,
        weeklyDigest: true,
        billing: true,
      });

      const res = await request(app)
        .put(`/v1/orgs/${orgId}/notification-preferences`)
        .set('Cookie', [memberCookie])
        .send({
          scanCompleted: 'issues_only',
          regressions: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.preferences.scanCompleted).toBe('issues_only');
      expect(res.body.data.preferences.regressions).toBe(false);
    });
  });

  describe('Scan Process Regression Alert & Idempotency', () => {
    it('sends regression alert once and skips duplicate alert for the same regression event', async () => {
      const storage = new MemoryStorageService();
      const emailSender = {
        send: vi.fn().mockResolvedValue({ id: 'msg-1', ok: true }),
      };

      const auditEntries: Array<{ action: string; key: string }> = [];
      const hasActionWithKey = vi.fn().mockImplementation((_orgId, action, key) => {
        return Promise.resolve(auditEntries.some((e) => e.action === action && e.key === key));
      });
      const writeAudit = vi.fn().mockImplementation((_orgId, entry) => {
        if (entry.data?.idempotencyKey) {
          auditEntries.push({
            action: entry.action,
            key: entry.data.idempotencyKey as string,
          });
        }
        return Promise.resolve(undefined);
      });

      const mockRepos = {
        scans: {
          findRawById: vi.fn().mockResolvedValue({
            id: 'scan-1',
            orgId,
            siteId: 'site-1',
            status: 'processing',
            requestedBy: userId,
            rawKey: 'scans/raw-1.json',
          }),
          updateRaw: vi.fn().mockResolvedValue(undefined),
        },
        sites: {
          findRawById: vi.fn().mockResolvedValue({
            id: 'site-1',
            name: 'Oakhaus Furniture',
            score: 75,
          }),
        },
        pages: {
          listBySite: vi.fn().mockResolvedValue([]),
        },
        issues: {
          listForDiff: vi.fn().mockResolvedValue([]),
          applyScanDiff: vi.fn().mockResolvedValue({
            createdCount: 0,
            fixedCount: 0,
            regressedCount: 1,
            fixedIssues: [],
            regressedIssues: [
              {
                id: 'iss-reg-1',
                ruleId: 'image-alt',
                regressionCount: 2,
              },
            ],
          }),
        },
        evidenceEvents: {
          record: vi.fn().mockResolvedValue(undefined),
        },
        notifications: {
          listOptedInMembers: vi
            .fn()
            .mockImplementation((_orgId: string, pref: string) =>
              Promise.resolve(
                pref === 'regressions'
                  ? [{ userId, email: 'dev@example.com', name: 'Developer' }]
                  : [],
              ),
            ),
          createInAppBatch: vi.fn().mockResolvedValue(undefined),
        },
        auditLog: {
          hasActionWithKey,
          write: writeAudit,
        },
      } as unknown as Repositories;

      // Seed raw scan JSON
      await storage.putObject(
        'scans/raw-1.json',
        Buffer.from(
          JSON.stringify({
            score: 75,
            pagesScanned: 5,
            pagesPlanned: 5,
            status: 'completed',
            pages: [],
            issues: [],
          }),
        ),
      );

      const workerCtx = {
        repos: mockRepos,
        storage,
        emailSender: emailSender as unknown as EmailSender,
        pool: {} as unknown as pg.Pool,
      };

      // Run 1: First time regression is detected -> Sends alert email E-08
      await handleScanProcess({ scanId: 'scan-1' }, workerCtx);

      expect(emailSender.send).toHaveBeenCalledTimes(1);
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'dev@example.com',
          templateId: 'E-08',
        }),
      );
      expect(writeAudit).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'alert.regression',
          data: expect.objectContaining({
            idempotencyKey: 'regression:iss-reg-1:2',
          }),
        }),
      );

      // Run 2: Re-run same scan / duplicate event -> Idempotency skips sending duplicate alert
      emailSender.send.mockClear();
      await handleScanProcess({ scanId: 'scan-1' }, workerCtx);

      expect(emailSender.send).not.toHaveBeenCalled();
    });
  });
});
