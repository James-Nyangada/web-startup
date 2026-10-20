import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';
import {
  assertWithinPlan,
  getPlanDefinition,
  getPlanLimits,
  PlanLimitError,
} from '../../src/shared/plans.js';
import { ErrorCode } from '../../src/shared/errors.js';

type PublicPlan = {
  id: string;
  priceMonthly: number;
  priceAnnual: number;
  maxSites: number;
  features: Record<string, unknown>;
};

describe('Public Plans API (Chunk P3-02, Screen S-02, Section 7.10)', () => {
  it('returns list of public plans at GET /public/plans and GET /v1/public/plans', async () => {
    const { app } = buildTestApp();

    const res1 = await request(app).get('/public/plans').expect(200);
    const plans = res1.body.data.plans as PublicPlan[];
    expect(plans).toHaveLength(4);
    expect(plans.map((p: { id: string }) => p.id)).toEqual([
      'store',
      'growth',
      'agency',
      'agency_pro',
    ]);

    const res2 = await request(app).get('/v1/public/plans').expect(200);
    expect(res2.body.data.plans).toEqual(res1.body.data.plans);

    // Verify properties of Store and Agency
    const store = plans.find((p: { id: string }) => p.id === 'store')!;
    expect(store.priceMonthly).toBe(29);
    expect(store.priceAnnual).toBe(290);
    expect(store.maxSites).toBe(1);

    const agency = plans.find((p: { id: string }) => p.id === 'agency')!;
    expect(agency.priceMonthly).toBe(199);
    expect(agency.priceAnnual).toBe(1990);
    expect(agency.maxSites).toBe(25);
    expect(agency.features.whiteLabel).toBe(true);
  });
});

describe('Plan Limits & Enforcement (Chunk P4-01 & Section 1.4 / 12.3)', () => {
  describe('Plan Definitions & Limits Lookup', () => {
    it('returns exact limits specified in Section 1.4 matrix', () => {
      const trial = getPlanLimits('trial');
      expect(trial.maxSites).toBe(3);
      expect(trial.maxPagesPerScan).toBe(50);
      expect(trial.scheduledFrequency).toBe('weekly');
      expect(trial.maxDailySites).toBe(0);
      expect(trial.manualScansPerDayPerSite).toBe(2);
      expect(trial.teamMembers).toBe(3);
      expect(trial.clientViewers).toBe(0);

      const store = getPlanLimits('store');
      expect(store.maxSites).toBe(1);
      expect(store.maxPagesPerScan).toBe(250);
      expect(store.scheduledFrequency).toBe('weekly');
      expect(store.maxDailySites).toBe(0);
      expect(store.manualScansPerDayPerSite).toBe(2);
      expect(store.teamMembers).toBe(2);
      expect(store.clientViewers).toBe(0);

      const growth = getPlanLimits('growth');
      expect(growth.maxSites).toBe(3);
      expect(growth.maxPagesPerScan).toBe(500);
      expect(growth.scheduledFrequency).toBe('daily');
      expect(growth.manualScansPerDayPerSite).toBe(5);
      expect(growth.teamMembers).toBe(5);
      expect(growth.clientViewers).toBe(0);

      const agency = getPlanLimits('agency');
      expect(agency.maxSites).toBe(25);
      expect(agency.maxPagesPerScan).toBe(250);
      expect(agency.scheduledFrequency).toBe('weekly');
      expect(agency.maxDailySites).toBe(5);
      expect(agency.manualScansPerDayPerSite).toBe(3);
      expect(agency.teamMembers).toBe(10);
      expect(agency.clientViewers).toBe(Number.POSITIVE_INFINITY);

      const agencyPro = getPlanLimits('agency_pro');
      expect(agencyPro.maxSites).toBe(75);
      expect(agencyPro.maxPagesPerScan).toBe(500);
      expect(agencyPro.scheduledFrequency).toBe('daily');
      expect(agencyPro.manualScansPerDayPerSite).toBe(10);
      expect(agencyPro.teamMembers).toBe(Number.POSITIVE_INFINITY);
      expect(agencyPro.clientViewers).toBe(Number.POSITIVE_INFINITY);
    });

    it('returns feature flags matching Section 1.4', () => {
      expect(getPlanDefinition('trial').features.whiteLabel).toBe(false);
      expect(getPlanDefinition('trial').features.slackWebhook).toBe(false);

      expect(getPlanDefinition('store').features.whiteLabel).toBe(false);
      expect(getPlanDefinition('store').features.slackWebhook).toBe(false);

      expect(getPlanDefinition('growth').features.whiteLabel).toBe(false);
      expect(getPlanDefinition('growth').features.slackWebhook).toBe(true);

      expect(getPlanDefinition('agency').features.whiteLabel).toBe(true);
      expect(getPlanDefinition('agency').features.customDomain).toBe(false);
      expect(getPlanDefinition('agency').features.publicApi).toBe(false);

      expect(getPlanDefinition('agency_pro').features.whiteLabel).toBe(true);
      expect(getPlanDefinition('agency_pro').features.customDomain).toBe(true);
      expect(getPlanDefinition('agency_pro').features.publicApi).toBe(true);
    });
  });

  describe('assertWithinPlan enforcement per feature', () => {
    it('enforces site creation / active sites limits', () => {
      // Trial: 3 sites allowed, 4th fails
      expect(() => assertWithinPlan('trial', 'sites', 3)).not.toThrow();
      expect(() => assertWithinPlan('trial', 'sites', 4)).toThrow(PlanLimitError);
      try {
        assertWithinPlan('trial', 'sites', 4);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.status).toBe(422);
        expect(error.code).toBe(ErrorCode.PLAN_LIMIT);
        expect(error.details.limit).toBe(3);
        expect(error.details.current).toBe(3);
        expect(error.details.upgradeTo).toBe('agency');
      }

      // Store: 1 site allowed, 2nd fails
      expect(() => assertWithinPlan('store', 'sites', 1)).not.toThrow();
      try {
        assertWithinPlan('store', 'sites', 2);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(1);
        expect(error.details.current).toBe(1);
        expect(error.details.upgradeTo).toBe('growth');
      }

      // Agency: 25 sites allowed, 26th fails
      expect(() => assertWithinPlan('agency', 'sites', 25)).not.toThrow();
      try {
        assertWithinPlan('agency', 'sites', 26);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(25);
        expect(error.details.upgradeTo).toBe('agency_pro');
      }
    });

    it('enforces page limit per scan', () => {
      // Trial: 50 pages allowed
      expect(() => assertWithinPlan('trial', 'pages', 50)).not.toThrow();
      expect(() => assertWithinPlan('trial', 'pages', 51)).toThrow(PlanLimitError);

      // Store: 250 pages allowed, 500 requests upgrade to Growth
      expect(() => assertWithinPlan('store', 'pages', 250)).not.toThrow();
      try {
        assertWithinPlan('store', 'pages', 300);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(250);
        expect(error.details.upgradeTo).toBe('growth');
      }

      // Agency: 250 pages allowed, 500 requests upgrade to Agency Pro
      expect(() => assertWithinPlan('agency', 'pages', 250)).not.toThrow();
      try {
        assertWithinPlan('agency', 'pages', 500);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(250);
        expect(error.details.upgradeTo).toBe('agency_pro');
      }
    });

    it('enforces scan frequency limits', () => {
      // Trial and Store reject daily frequency
      expect(() => assertWithinPlan('trial', 'daily_scans')).toThrow(PlanLimitError);
      try {
        assertWithinPlan('store', 'daily_scans');
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe('weekly');
        expect(error.details.current).toBe('daily');
        expect(error.details.upgradeTo).toBe('growth');
      }

      // Growth allows daily frequency
      expect(() => assertWithinPlan('growth', 'daily_scans')).not.toThrow();

      // Agency allows up to 5 daily sites, 6th fails
      expect(() => assertWithinPlan('agency', 'daily_scans', 5)).not.toThrow();
      try {
        assertWithinPlan('agency', 'daily_scans', 6);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(5);
        expect(error.details.current).toBe(5);
        expect(error.details.upgradeTo).toBe('agency_pro');
      }

      // Agency Pro allows unlimited daily sites
      expect(() => assertWithinPlan('agency_pro', 'daily_scans', 20)).not.toThrow();
    });

    it('enforces manual scans per site per day', () => {
      // Trial: 2 manual scans
      expect(() => assertWithinPlan('trial', 'manual_scans', 2)).not.toThrow();
      expect(() => assertWithinPlan('trial', 'manual_scans', 3)).toThrow(PlanLimitError);

      // Agency: 3 manual scans
      expect(() => assertWithinPlan('agency', 'manual_scans', 3)).not.toThrow();
      try {
        assertWithinPlan('agency', 'manual_scans', 4);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(3);
        expect(error.details.current).toBe(3);
        expect(error.details.upgradeTo).toBe('agency_pro');
      }
    });

    it('enforces team member seats', () => {
      // Store: 2 seats
      expect(() => assertWithinPlan('store', 'team_members', 2)).not.toThrow();
      try {
        assertWithinPlan('store', 'team_members', 3);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(2);
        expect(error.details.upgradeTo).toBe('growth');
      }

      // Agency: 10 seats
      expect(() => assertWithinPlan('agency', 'team_members', 10)).not.toThrow();
      try {
        assertWithinPlan('agency', 'team_members', 11);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(10);
        expect(error.details.upgradeTo).toBe('agency_pro');
      }

      // Agency Pro: unlimited
      expect(() => assertWithinPlan('agency_pro', 'team_members', 100)).not.toThrow();
    });

    it('enforces client viewers', () => {
      expect(() => assertWithinPlan('trial', 'client_viewers')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('store', 'client_viewers')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('growth', 'client_viewers')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('agency', 'client_viewers')).not.toThrow();
      expect(() => assertWithinPlan('agency_pro', 'client_viewers')).not.toThrow();
    });

    it('enforces white-label branding', () => {
      expect(() => assertWithinPlan('trial', 'white_label')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('store', 'white_label')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('growth', 'white_label')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('agency', 'white_label')).not.toThrow();
      expect(() => assertWithinPlan('agency_pro', 'white_label')).not.toThrow();
    });

    it('enforces custom domain', () => {
      expect(() => assertWithinPlan('agency', 'custom_domain')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('agency_pro', 'custom_domain')).not.toThrow();
    });

    it('enforces scheduled client reports', () => {
      expect(() => assertWithinPlan('growth', 'scheduled_reports')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('agency', 'scheduled_reports')).not.toThrow();
      expect(() => assertWithinPlan('agency_pro', 'scheduled_reports')).not.toThrow();
    });

    it('enforces Slack webhooks', () => {
      expect(() => assertWithinPlan('trial', 'slack_webhook')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('store', 'slack_webhook')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('growth', 'slack_webhook')).not.toThrow();
      expect(() => assertWithinPlan('agency', 'slack_webhook')).not.toThrow();
    });

    it('enforces public API and API keys', () => {
      expect(() => assertWithinPlan('agency', 'public_api')).toThrow(PlanLimitError);
      expect(() => assertWithinPlan('agency_pro', 'public_api')).not.toThrow();
    });

    it('enforces AI suggestions monthly quota', () => {
      expect(() => assertWithinPlan('trial', 'ai_suggestions', 20)).not.toThrow();
      try {
        assertWithinPlan('trial', 'ai_suggestions', 21);
      } catch (err: unknown) {
        const error = err as PlanLimitError;
        expect(error.details.limit).toBe(20);
        expect(error.details.current).toBe(20);
      }
    });
  });

  describe('GET /v1/orgs/:orgId/usage endpoint', () => {
    it('returns resource usage and plan limits for the organisation', async () => {
      const orgId = '11111111-1111-4111-a111-111111111111';
      const userId = 'user-1';

      const mockOrg = {
        id: orgId,
        name: 'Agency One',
        slug: 'agency-one',
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

      const mockUser = {
        id: userId,
        email: 'user@example.com',
        name: 'User 1',
        isStaff: false,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSession = {
        id: 'sess-1',
        userId,
        token: 'token-1',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const auth = {
        api: {
          getSession: vi.fn().mockResolvedValue({ user: mockUser, session: mockSession }),
        },
      } as unknown as Auth;

      const { app, repos } = buildTestApp({ auth });
      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId,
        userId,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
      vi.mocked(repos.sites.count).mockResolvedValue(4);
      vi.mocked(repos.sites.countDailySites).mockResolvedValue(2);
      vi.mocked(repos.memberships.count).mockResolvedValue(3);
      vi.mocked(repos.invitations.countClientViewers).mockResolvedValue(1);
      vi.mocked(repos.aiSuggestions.getMonthlyUsage).mockResolvedValue(12);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/usage`)
        .set('Cookie', ['better-auth.session_token=token-1'])
        .expect(200);

      expect(res.body.data.plan).toBe('agency');
      expect(res.body.data.planName).toBe('Agency');
      expect(res.body.data.limits.maxSites).toBe(25);
      expect(res.body.data.limits.maxDailySites).toBe(5);
      expect(res.body.data.usage.sites).toBe(4);
      expect(res.body.data.usage.dailySites).toBe(2);
      expect(res.body.data.usage.teamMembers).toBe(3);
      expect(res.body.data.usage.clientViewers).toBe(1);
      expect(res.body.data.usage.aiSuggestionsThisMonth).toBe(12);
      expect(res.body.data.features.whiteLabel).toBe(true);
    });
  });
});
