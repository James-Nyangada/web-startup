import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { OrgId } from '../../src/db/repositories/org-scope.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp } from '../helpers/fakes.js';
import {
  computeNextScanAt,
  getZonedParts,
} from '../../src/lib/schedule.js';
import { handleScanSchedule } from '../../src/worker/jobs/scan-schedule.js';
import type { WorkerContext } from '../../src/worker/types.js';
import type { scans, sites } from '../../src/db/schema/index.js';

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
  return {
    mockUser,
    mockSession,
    api,
  } as unknown as Auth;
}

describe('Scheduling and Manual Scans (Chunk P2-09)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const siteId = 'site-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const scanId = 'scan-bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const userId = 'user-admin-123';

  const mockOrg = {
    id: orgId,
    name: 'Brightline Studio',
    slug: 'brightline',
    plan: 'trial' as const,
    billingStatus: 'active' as const,
    timeZone: 'Europe/London',
    trialEndsAt: null,
    paddleCustomerId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSite: typeof sites.$inferSelect = {
    id: siteId,
    orgId,
    name: 'Oakhaus Furniture',
    rootUrl: 'https://oakhaus.com',
    platform: 'shopify' as const,
    clientName: 'Mark Otieno',
    status: 'active' as const,
    verifyMethod: 'meta' as const,
    verifyToken: 'ps_test_token',
    verifiedAt: new Date(),
    scanFrequency: 'weekly' as const,
    scanDay: 1, // Monday
    scanHour: 2, // 02:00
    pageLimit: 50,
    standard: 'wcag22aa' as const,
    pinnedUrls: [],
    excludedPaths: [],
    authNote: null,
    score: 84,
    lastScanId: null,
    nextScanAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockScan: typeof scans.$inferSelect = {
    id: scanId,
    orgId,
    siteId,
    trigger: 'manual' as const,
    status: 'queued' as const,
    queuedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    pagesDiscovered: 10,
    pagesPlanned: 10,
    pagesScanned: 0,
    pagesFailed: 0,
    templatesFound: 1,
    axeVersion: '4.14.0',
    engineVersion: '1.0.0',
    standard: 'wcag22aa' as const,
    score: null,
    counts: {},
    rawKey: null,
    errorCode: null,
    errorMessage: null,
    requestedBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let auth: Auth;
  let repos: Repositories;
  let app: Express;

  beforeEach(() => {
    auth = createMockAuth(userId);
    const testApp = buildTestApp({ auth });
    app = testApp.app;
    repos = testApp.repos;

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
              id: 'mem-1',
              orgId,
              userId,
              role: 'admin',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as never)
          : null,
      ),
    );
    vi.mocked(repos.memberships.findRole).mockImplementation((oid: string, uid: string) =>
      Promise.resolve(oid === orgId && uid === userId ? 'admin' : null),
    );
    vi.mocked(repos.sites.findById).mockImplementation((oid: string, sid: string) =>
      Promise.resolve(oid === orgId && sid === siteId ? (mockSite as never) : null),
    );
    vi.mocked(repos.scans.create).mockResolvedValue(mockScan);
    vi.mocked(repos.scans.findById).mockImplementation((oid: string, scid: string) =>
      Promise.resolve(oid === orgId && scid === scanId ? (mockScan as never) : null),
    );
    vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValue(null);
    vi.mocked(repos.scans.countManualScansSince).mockResolvedValue(0);
  });

  describe('DST and Wall-Clock Time Calculation', () => {
    it('weekly scan fires at the configured day/hour ± 10 minutes across London DST Spring-Forward', () => {
      // In 2026, London jumps from GMT (UTC+0) to BST (UTC+1) on Sunday March 29, 2026 at 01:00 UTC -> 02:00 BST.
      // Scheduled: Monday at 02:00 local London time.
      const timeZone = 'Europe/London';

      // 1. Before DST: Reference date Sunday 2026-03-22 10:00 UTC
      const beforeDstRef = new Date(Date.UTC(2026, 2, 22, 10, 0, 0));
      const nextBefore = computeNextScanAt({
        frequency: 'weekly',
        scanDay: 1, // Monday
        scanHour: 2, // 02:00 London time
        timeZone,
        from: beforeDstRef,
      });

      expect(nextBefore).not.toBeNull();
      // On Monday 2026-03-23, London is in GMT (+00:00), so 02:00 London == 02:00 UTC
      expect(nextBefore!.toISOString()).toBe('2026-03-23T02:00:00.000Z');
      const partsBefore = getZonedParts(nextBefore!, timeZone);
      expect(partsBefore.hour).toBe(2);
      expect(partsBefore.minute).toBe(0);

      // 2. Across DST jump: Reference date Sunday 2026-03-29 10:00 UTC (jump happened earlier today at 01:00 UTC)
      const afterDstRef = new Date(Date.UTC(2026, 2, 29, 10, 0, 0));
      const nextAfter = computeNextScanAt({
        frequency: 'weekly',
        scanDay: 1, // Monday
        scanHour: 2, // 02:00 London time
        timeZone,
        from: afterDstRef,
      });

      expect(nextAfter).not.toBeNull();
      // On Monday 2026-03-30, London is in BST (+01:00), so 02:00 London == 01:00 UTC!
      expect(nextAfter!.toISOString()).toBe('2026-03-30T01:00:00.000Z');
      const partsAfter = getZonedParts(nextAfter!, timeZone);
      expect(partsAfter.hour).toBe(2);
      expect(partsAfter.minute).toBe(0);

      // Difference in wall-clock local time across DST is exactly 0 minutes (satisfies ± 10 min spec)
      expect(Math.abs(partsAfter.hour - 2)).toBe(0);
      expect(partsAfter.minute).toBe(0);
    });

    it('weekly scan fires at the configured day/hour ± 10 minutes across New York DST Fall-Back', () => {
      // In 2026, New York falls back from EDT (UTC-4) to EST (UTC-5) on Sunday November 1, 2026 at 02:00 local.
      // Scheduled: Monday at 09:00 local New York time.
      const timeZone = 'America/New_York';

      // 1. Before Fall-back: Reference date Friday 2026-10-23
      const beforeRef = new Date(Date.UTC(2026, 9, 23, 12, 0, 0));
      const nextBefore = computeNextScanAt({
        frequency: 'weekly',
        scanDay: 1, // Monday
        scanHour: 9, // 09:00 NY time
        timeZone,
        from: beforeRef,
      });

      expect(nextBefore).not.toBeNull();
      // Monday 2026-10-26 in EDT (UTC-4): 09:00 NY == 13:00 UTC
      expect(nextBefore!.toISOString()).toBe('2026-10-26T13:00:00.000Z');
      const partsBefore = getZonedParts(nextBefore!, timeZone);
      expect(partsBefore.hour).toBe(9);
      expect(partsBefore.minute).toBe(0);

      // 2. After Fall-back: Reference date Sunday 2026-11-01 12:00 UTC
      const afterRef = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));
      const nextAfter = computeNextScanAt({
        frequency: 'weekly',
        scanDay: 1, // Monday
        scanHour: 9, // 09:00 NY time
        timeZone,
        from: afterRef,
      });

      expect(nextAfter).not.toBeNull();
      // Monday 2026-11-02 in EST (UTC-5): 09:00 NY == 14:00 UTC
      expect(nextAfter!.toISOString()).toBe('2026-11-02T14:00:00.000Z');
      const partsAfter = getZonedParts(nextAfter!, timeZone);
      expect(partsAfter.hour).toBe(9);
      expect(partsAfter.minute).toBe(0);
    });

    it('daily scan computes candidate for today if hour is in the future, or tomorrow if passed', () => {
      const timeZone = 'UTC';
      const refMorning = new Date(Date.UTC(2026, 5, 10, 1, 0, 0)); // 01:00 UTC
      const nextToday = computeNextScanAt({
        frequency: 'daily',
        scanDay: 0,
        scanHour: 3, // 03:00 UTC
        timeZone,
        from: refMorning,
      });
      expect(nextToday!.toISOString()).toBe('2026-06-10T03:00:00.000Z');

      const refAfternoon = new Date(Date.UTC(2026, 5, 10, 5, 0, 0)); // 05:00 UTC
      const nextTomorrow = computeNextScanAt({
        frequency: 'daily',
        scanDay: 0,
        scanHour: 3, // 03:00 UTC
        timeZone,
        from: refAfternoon,
      });
      expect(nextTomorrow!.toISOString()).toBe('2026-06-11T03:00:00.000Z');
    });

    it('returns null when scanFrequency is manual', () => {
      const next = computeNextScanAt({
        frequency: 'manual',
        scanDay: 1,
        scanHour: 2,
        timeZone: 'UTC',
      });
      expect(next).toBeNull();
    });
  });

  describe('Single Running Scan Guarantee (409 SCAN_IN_PROGRESS)', () => {
    it('returns 409 SCAN_IN_PROGRESS when a scan is already running on the site', async () => {
      vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValueOnce({
        id: 'scan-active-123',
        status: 'scanning',
      } as unknown as typeof scans.$inferSelect);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send({ trigger: 'manual' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.SCAN_IN_PROGRESS);
      expect(res.body.error.message).toContain('already running');
      expect(repos.scans.create).not.toHaveBeenCalled();
    });
  });

  describe('Manual Scan Plan Limits (422 PLAN_LIMIT)', () => {
    it('enforces Trial plan limit (2 manual scans/day/site)', async () => {
      vi.mocked(repos.organizations.findById).mockResolvedValueOnce({
        ...mockOrg,
        plan: 'trial',
      });
      // Already 2 manual scans today
      vi.mocked(repos.scans.countManualScansSince).mockResolvedValueOnce(2);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send({ trigger: 'manual' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
      expect(res.body.error.details.limit).toBe(2);
      expect(res.body.error.details.current).toBe(2);
      expect(repos.scans.create).not.toHaveBeenCalled();
    });

    it('allows manual scan when under plan limit', async () => {
      vi.mocked(repos.organizations.findById).mockResolvedValueOnce({
        ...mockOrg,
        plan: 'trial',
      });
      // 1 manual scan today (under limit of 2)
      vi.mocked(repos.scans.countManualScansSince).mockResolvedValueOnce(1);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send({ trigger: 'manual' });

      expect(res.status).toBe(201);
      expect(repos.scans.create).toHaveBeenCalled();
    });

    it('enforces Growth plan limit (5 manual scans/day/site)', async () => {
      vi.mocked(repos.organizations.findById).mockResolvedValueOnce({
        ...mockOrg,
        plan: 'growth',
      });
      vi.mocked(repos.scans.countManualScansSince).mockResolvedValueOnce(5);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send({ trigger: 'manual' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
      expect(res.body.error.details.limit).toBe(5);
    });

    it('enforces Agency plan limit (3 manual scans/day/site)', async () => {
      vi.mocked(repos.organizations.findById).mockResolvedValueOnce({
        ...mockOrg,
        plan: 'agency',
      });
      vi.mocked(repos.scans.countManualScansSince).mockResolvedValueOnce(3);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/scans`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send({ trigger: 'manual' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
      expect(res.body.error.details.limit).toBe(3);
    });
  });

  describe('Scan Cancellation Endpoint (POST /v1/orgs/:orgId/scans/:scanId/cancel)', () => {
    it('returns 404 when scan does not exist in org', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/scans/${scanId}/cancel`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns 409 when scan is already completed, failed, or canceled', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValueOnce({
        ...mockScan,
        status: 'completed',
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/scans/${scanId}/cancel`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
      expect(res.body.error.message).toContain('already completed');
      expect(repos.scans.cancelScan).not.toHaveBeenCalled();
    });

    it('successfully cancels a queued or running scan and logs audit event', async () => {
      vi.mocked(repos.scans.findById).mockResolvedValueOnce({
        ...mockScan,
        status: 'scanning',
      });
      vi.mocked(repos.scans.cancelScan).mockResolvedValueOnce({
        ...mockScan,
        status: 'canceled',
        finishedAt: new Date(),
      });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/scans/${scanId}/cancel`)
        .set('Cookie', [`better-auth.session_token=token-${userId}`])
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.scan.status).toBe('canceled');
      expect(repos.scans.cancelScan).toHaveBeenCalledWith(orgId as OrgId, scanId);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'scan.canceled',
          targetId: scanId,
        }),
      );
    });
  });

  describe('scan.schedule Cron Runner (handleScanSchedule)', () => {
    let mockBoss: { send: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockBoss = {
        send: vi.fn().mockResolvedValue('job-id-123'),
      };
    });

    it('enqueues scan.run, updates next_scan_at, and spreads load (max 20 per tick)', async () => {
      vi.mocked(repos.sites.findDueForScheduledScan).mockResolvedValueOnce([
        {
          site: mockSite,
          orgTimeZone: 'Europe/London',
          orgPlan: 'trial',
          orgBillingStatus: 'active',
        },
      ]);

      const ctx: WorkerContext = {
        repos,
        storage: null as unknown as WorkerContext['storage'],
        boss: mockBoss as unknown as PgBoss,
      };

      const scheduled = await handleScanSchedule(ctx);

      expect(scheduled).toBe(1);
      expect(repos.sites.findDueForScheduledScan).toHaveBeenCalledWith(20);
      expect(repos.scans.create).toHaveBeenCalledWith(
        orgId as OrgId,
        expect.objectContaining({
          siteId,
          trigger: 'scheduled',
          pagesPlanned: 50,
          requestedBy: null,
        }),
      );
      expect(repos.sites.updateNextScanAt).toHaveBeenCalledWith(siteId, expect.any(Date));
      expect(mockBoss.send).toHaveBeenCalledWith('scan.run', { scanId }, expect.any(Object));
    });

    it('skips site if a scan is already running on that site', async () => {
      vi.mocked(repos.sites.findDueForScheduledScan).mockResolvedValueOnce([
        {
          site: mockSite,
          orgTimeZone: 'Europe/London',
          orgPlan: 'trial',
          orgBillingStatus: 'active',
        },
      ]);
      vi.mocked(repos.scans.findRunningScanForSite).mockResolvedValueOnce(mockScan);

      const ctx: WorkerContext = {
        repos,
        storage: null as unknown as WorkerContext['storage'],
        boss: mockBoss as unknown as PgBoss,
      };

      const scheduled = await handleScanSchedule(ctx);

      expect(scheduled).toBe(0);
      expect(repos.scans.create).not.toHaveBeenCalled();
      expect(mockBoss.send).not.toHaveBeenCalled();
    });
  });
});
