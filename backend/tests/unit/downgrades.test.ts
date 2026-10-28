import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { buildTestApp, fakeRepos } from '../helpers/fakes.js';
import { processPaddleEvent } from '../../src/billing/paddle.js';
import { paddleWebhookRouter } from '../../src/routes/billing.js';
import { handleTrialLifecycle } from '../../src/worker/jobs/trial-lifecycle.js';
import type { StorageService } from '../../src/storage/index.js';
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
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      lastMfaAt: null,
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
      pastDueSince: null,
      planOverride: null,
      planOverrideExpiresAt: null,
      planOverrideReason: null,
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
      framework: null,
      clientName: `Client ${i + 1}`,
      status: 'active' as const,
      verifyMethod: null,
      verifyToken: 'ps_test_token',
      verifiedAt: new Date(),
      verifyFailureCount: 0,
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

  describe('Scheduled downgrade timing and webhook delivery', () => {
    const orgId = asOrgId('018f0000-0000-7000-8000-000000000001');
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const agencySub = {
      id: 'sub-1',
      orgId,
      paddleSubscriptionId: 'sub_paddle_123',
      paddlePriceId: 'pri_sandbox_agency_monthly',
      plan: 'agency',
      interval: 'month',
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    };

    it('keeps the current plan when Paddle confirms a downgrade scheduled for period end', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.subscriptions.findByPaddleSubscriptionId).mockResolvedValue({
        ...agencySub,
        scheduledChange: {
          action: 'downgrade',
          plan: 'growth',
          interval: 'month',
          effectiveAt: periodEnd.toISOString(),
        },
      });

      await processPaddleEvent(
        {
          event_id: 'evt_downgrade_confirm_1',
          event_type: 'subscription.updated',
          occurred_at: new Date().toISOString(),
          data: {
            id: 'sub_paddle_123',
            status: 'active',
            custom_data: { orgId },
            items: [{ price: { id: 'pri_sandbox_growth_monthly' } }],
          },
        },
        repos,
      );

      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'agency',
          scheduledChange: expect.objectContaining({ action: 'downgrade', plan: 'growth' }),
        }),
      );
      expect(repos.organizations.update).not.toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ plan: 'growth' }),
      );
    });

    it('applies the downgrade in trial.lifecycle once the period has ended', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([]);
      vi.mocked(repos.subscriptions.listDueScheduledDowngrades).mockResolvedValue([
        {
          ...agencySub,
          currentPeriodEnd: new Date(Date.now() - 60 * 1000),
          scheduledChange: {
            action: 'downgrade',
            plan: 'growth',
            interval: 'month',
            effectiveAt: new Date(Date.now() - 60 * 1000).toISOString(),
          },
        },
      ]);

      const result = await handleTrialLifecycle({
        repos,
        storage: {} as unknown as StorageService,
      });

      expect(result.downgradesApplied).toBe(1);
      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'growth',
          paddlePriceId: 'pri_sandbox_growth_monthly',
          scheduledChange: null,
        }),
      );
      expect(repos.organizations.update).toHaveBeenCalledWith(orgId, { plan: 'growth' });
    });

    it('treats a repeated webhook delivery as a no-op', async () => {
      const { repos } = fakeRepos();
      const app = express();
      app.use(express.json());
      app.use('/webhooks/paddle', paddleWebhookRouter(repos));

      const payload = {
        event_id: 'evt_redelivered_1',
        event_type: 'subscription.activated',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_paddle_123',
          status: 'active',
          custom_data: { orgId },
          items: [{ price: { id: 'pri_sandbox_agency_monthly' } }],
        },
      };
      const send = () =>
        request(app)
          .post('/webhooks/paddle')
          .set('paddle-signature', `ts=${Math.floor(Date.now() / 1000)};h1=dummy_test`)
          .send(payload)
          .expect(200);

      const first = await send();
      const second = await send();

      expect(first.body.duplicate).toBe(false);
      expect(second.body.duplicate).toBe(true);
      expect(repos.organizations.update).toHaveBeenCalledTimes(1);
    });
  });
});
