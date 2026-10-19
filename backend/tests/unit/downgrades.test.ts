import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';

describe('Chunk P4-04: Plan changes, downgrades, and site pausing', () => {
  function setupTest(
    opts: {
      currentPlan?: 'agency' | 'store' | 'trial' | 'growth' | 'agency_pro';
      sitesCount?: number;
      subOverrides?: Record<string, unknown>;
    } = {},
  ) {
    const { currentPlan = 'agency', sitesCount = 5, subOverrides = {} } = opts;

    const user = {
      id: 'usr-owner-1',
      email: 'owner@example.com',
      name: 'Owner User',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      avatarUrl: null,
      timeZone: 'UTC',
      isStaff: false,
      lastActiveOrgId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const orgId = asOrgId('018f0000-0000-7000-8000-000000000001');
    const org = {
      id: orgId,
      name: 'Brightline Agency',
      slug: 'brightline',
      type: 'agency' as const,
      plan: currentPlan,
      billingStatus: 'active' as const,
      trialEndsAt: null,
      paddleCustomerId: 'ctm_test_123',
      timeZone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const subscription = {
      id: 'sub-1',
      orgId,
      paddleSubscriptionId: 'sub_paddle_123',
      paddlePriceId: 'pri_sandbox_agency_monthly',
      plan: currentPlan,
      interval: 'month',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      scheduledChange: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...subOverrides,
    };

    const activeSites = Array.from({ length: sitesCount }, (_, i) => ({
      id: `site-00${i + 1}`,
      orgId,
      name: `Client Site ${i + 1}`,
      rootUrl: `https://site${i + 1}.example.com`,
      platform: 'custom' as const,
      clientName: `Client ${i + 1}`,
      status: 'active' as const,
      verifyMethod: null,
      verifyToken: 'ps_test_token',
      verifiedAt: new Date(),
      scanFrequency: 'weekly' as const,
      scanDay: 1,
      scanHour: 2,
      pageLimit: 50,
      standard: 'wcag22aa' as const,
      pinnedUrls: [] as string[],
      excludedPaths: [] as string[],
      authNote: null,
      score: 85 - i * 5,
      lastScanId: null,
      nextScanAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }));

    const auth: Auth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          session: { id: 'sess-1', userId: user.id },
          user,
        }),
      },
    } as unknown as Auth;

    const { app, repos } = buildTestApp({ auth });
    vi.mocked(repos.organizations.findById).mockResolvedValue(org);
    vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(org);
    vi.mocked(repos.memberships.findRole).mockResolvedValue('owner');
    vi.mocked(repos.memberships.find).mockResolvedValue({
      id: 'mem-1',
      orgId,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(repos.subscriptions.findByOrgId).mockResolvedValue(subscription);
    vi.mocked(repos.sites.list).mockResolvedValue(activeSites);
    vi.mocked(repos.sites.countActive).mockResolvedValue(activeSites.length);

    return { app, repos, org, user, subscription, activeSites };
  }

  describe('Plan change preview (Spec Section 12.3)', () => {
    it('previews immediate upgrade with proration from growth to agency', async () => {
      const { app, org } = setupTest({ currentPlan: 'growth', sitesCount: 2 });

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/change-plan`)
        .send({ plan: 'agency', interval: 'month', preview: true })
        .expect(200);

      expect(res.body.data.preview).toBe(true);
      expect(res.body.data.isUpgrade).toBe(true);
      expect(res.body.data.isDowngrade).toBe(false);
      expect(res.body.data.proration).toBe('immediate_prorated');
      expect(res.body.data.requiresPause).toBe(false);
      expect(res.body.data.excessSites).toBe(0);
    });

    it('previews downgrade without pause when site count fits in target plan', async () => {
      // Agency (25 sites) down to Growth (3 sites), but only 2 sites are active
      const { app, org } = setupTest({ currentPlan: 'agency', sitesCount: 2 });

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/change-plan`)
        .send({ plan: 'growth', interval: 'month', preview: true })
        .expect(200);

      expect(res.body.data.preview).toBe(true);
      expect(res.body.data.isUpgrade).toBe(false);
      expect(res.body.data.isDowngrade).toBe(true);
      expect(res.body.data.proration).toBe('next_period');
      expect(res.body.data.requiresPause).toBe(false);
      expect(res.body.data.excessSites).toBe(0);
    });

    it('previews downgrade and flags excess sites requiring pause', async () => {
      // Agency down to Growth (3 max), but 5 sites are active -> 2 excess sites
      const { app, org } = setupTest({ currentPlan: 'agency', sitesCount: 5 });

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/change-plan`)
        .send({ plan: 'growth', interval: 'month', preview: true })
        .expect(200);

      expect(res.body.data.preview).toBe(true);
      expect(res.body.data.isDowngrade).toBe(true);
      expect(res.body.data.requiresPause).toBe(true);
      expect(res.body.data.excessSites).toBe(2);
      expect(res.body.data.activeSites).toHaveLength(5);
    });
  });

  describe('Downgrade execution and site pausing (Spec Section 12.3)', () => {
    it('rejects downgrade with 422 PLAN_LIMIT if fewer sites are paused than required', async () => {
      const { app, org, repos } = setupTest({ currentPlan: 'agency', sitesCount: 5 });

      // Target plan growth allows 3 sites. 5 active, so 2 must be paused. User only sends 1 site.
      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/change-plan`)
        .send({
          plan: 'growth',
          interval: 'month',
          pauseSiteIds: ['site-001'],
        })
        .expect(422);

      expect(res.body.error.code).toBe('PLAN_LIMIT');
      expect(res.body.error.message).toContain('You must select at least 2 site(s) to pause');
      expect(repos.sites.pause).not.toHaveBeenCalled();
      expect(repos.subscriptions.upsert).not.toHaveBeenCalled();
    });

    it('pauses selected sites (no data deleted) and schedules downgrade on renewal', async () => {
      const { app, org, repos, subscription } = setupTest({ currentPlan: 'agency', sitesCount: 5 });

      // Pause 2 sites as required: site-004 and site-005
      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/change-plan`)
        .send({
          plan: 'growth',
          interval: 'month',
          pauseSiteIds: ['site-004', 'site-005'],
        })
        .expect(200);

      expect(res.body.data.success).toBe(true);
      expect(res.body.data.isDowngrade).toBe(true);
      expect(res.body.data.scheduled).toBe(true);

      // Verify repos.sites.pause was called for both sites (data preserved, status set to paused)
      expect(repos.sites.pause).toHaveBeenCalledWith(org.id, 'site-004');
      expect(repos.sites.pause).toHaveBeenCalledWith(org.id, 'site-005');

      // Verify audit logs written for site pauses
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({
          action: 'site.paused',
          targetId: 'site-004',
          data: { reason: 'downgrade_overflow' },
        }),
      );

      // Verify subscription scheduledChange updated
      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: subscription.id,
          scheduledChange: expect.objectContaining({
            action: 'downgrade',
            plan: 'growth',
            pauseSiteIds: ['site-004', 'site-005'],
          }),
        }),
      );
    });

    it('executes immediate upgrade and updates subscription and organization', async () => {
      const { app, org, repos } = setupTest({ currentPlan: 'store', sitesCount: 1 });

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/change-plan`)
        .send({
          plan: 'agency',
          interval: 'month',
        })
        .expect(200);

      expect(res.body.data.success).toBe(true);
      expect(res.body.data.isUpgrade).toBe(true);
      expect(res.body.data.scheduled).toBe(false);

      expect(repos.organizations.update).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({
          plan: 'agency',
          billingStatus: 'active',
        }),
      );

      expect(repos.auditLog.write).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({
          action: 'billing.upgraded',
        }),
      );
    });
  });

  describe('Cancellation survey and resume flow', () => {
    it('records structured survey reasons and feedback upon cancellation', async () => {
      const { app, org, repos, subscription } = setupTest();

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/cancel`)
        .send({
          reason: 'too_expensive',
          feedback: 'Cutting back on SaaS spending this quarter.',
        })
        .expect(200);

      expect(res.body.data.cancelAtPeriodEnd).toBe(true);
      expect(repos.subscriptions.setCancelAtPeriodEnd).toHaveBeenCalledWith(org.id, true);
      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: subscription.id,
          cancelAtPeriodEnd: true,
          scheduledChange: expect.objectContaining({
            action: 'cancel',
            reason: 'too_expensive',
            feedback: 'Cutting back on SaaS spending this quarter.',
          }),
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({
          action: 'billing.subscription_cancelled',
          data: expect.objectContaining({
            reason: 'too_expensive',
          }),
        }),
      );
    });

    it('clears cancellation schedule upon resumption', async () => {
      const { app, org, repos, subscription } = setupTest({
        subOverrides: {
          cancelAtPeriodEnd: true,
          scheduledChange: { action: 'cancel', reason: 'too_expensive' },
        },
      });

      const res = await request(app).post(`/v1/orgs/${org.id}/billing/resume`).send({}).expect(200);

      expect(res.body.data.cancelAtPeriodEnd).toBe(false);
      expect(repos.subscriptions.setCancelAtPeriodEnd).toHaveBeenCalledWith(org.id, false);
      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: subscription.id,
          cancelAtPeriodEnd: false,
          scheduledChange: null,
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({
          action: 'billing.subscription_resumed',
        }),
      );
    });
  });
});
