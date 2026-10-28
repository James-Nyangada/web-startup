import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';
import { handleTrialLifecycle } from '../../src/worker/jobs/trial-lifecycle.js';
import { renderEmail } from '../../src/emails/renderer.js';
import type { WorkerContext } from '../../src/worker/types.js';
import type { EmailSender } from '../../src/emails/sender.js';
import type { StorageService } from '../../src/storage/index.js';

describe('Chunk P4-05: Trial lifecycle and read-only mode', () => {
  const orgId = asOrgId('018f0000-0000-7000-8000-000000000001');

  function setupAuth(
    opts: {
      billingStatus?: 'trialing' | 'active' | 'read_only' | 'past_due' | 'canceled';
      plan?: 'trial' | 'store' | 'growth' | 'agency' | 'agency_pro';
      trialEndsAt?: Date | null;
    } = {},
  ) {
    const {
      billingStatus = 'read_only',
      plan = 'trial',
      trialEndsAt = new Date(Date.now() - 1000),
    } = opts;

    const user = {
      id: 'usr-owner-1',
      email: 'owner@example.com',
      name: 'Org Owner',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      avatarUrl: null,
      timeZone: 'UTC',
      isStaff: false,
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      lastMfaAt: null,
      lastActiveOrgId: orgId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const org = {
      id: orgId,
      name: 'Brightline Studio',
      slug: 'brightline',
      type: 'agency' as const,
      plan,
      billingStatus,
      trialEndsAt,
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
    vi.mocked(repos.memberships.findOwner).mockResolvedValue({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return { app, repos, org, user };
  }

  describe('Read-Only Mode Enforcement (Spec Section 1.4 & P4-05)', () => {
    it('blocks mutating endpoints on read-only org with 402 BILLING_REQUIRED', async () => {
      const { app, org } = setupAuth({ billingStatus: 'read_only' });

      // 1. Creating a site
      const siteRes = await request(app)
        .post(`/v1/orgs/${org.id}/sites`)
        .send({ name: 'New Site', rootUrl: 'https://newsite.example.com' })
        .expect(402);

      expect(siteRes.body.error.code).toBe('BILLING_REQUIRED');
      expect(siteRes.body.error.message).toContain('read-only mode');

      // 2. Inviting a member
      const inviteRes = await request(app)
        .post(`/v1/orgs/${org.id}/invitations`)
        .send({ email: 'newdev@example.com', role: 'member' })
        .expect(402);

      expect(inviteRes.body.error.code).toBe('BILLING_REQUIRED');

      // 3. Updating org settings
      const patchOrgRes = await request(app)
        .patch(`/v1/orgs/${org.id}`)
        .send({ name: 'Renamed Studio' })
        .expect(402);

      expect(patchOrgRes.body.error.code).toBe('BILLING_REQUIRED');
    });

    it('allows read requests (GET) on read-only org so users can view everything', async () => {
      const { app, org, repos } = setupAuth({ billingStatus: 'read_only' });
      vi.mocked(repos.sites.list).mockResolvedValue([]);
      vi.mocked(repos.sites.count).mockResolvedValue(0);
      vi.mocked(repos.memberships.count).mockResolvedValue(1);

      // View org details
      const orgRes = await request(app).get(`/v1/orgs/${org.id}`).expect(200);
      expect(orgRes.body.data.org.billingStatus).toBe('read_only');

      // View sites list
      const sitesRes = await request(app).get(`/v1/orgs/${org.id}/sites`).expect(200);
      expect(sitesRes.body.data.sites).toEqual([]);
    });

    it('allows billing endpoints on read-only org so owner can upgrade or change plan', async () => {
      const { app, org } = setupAuth({ billingStatus: 'read_only' });

      // GET billing settings
      const billingRes = await request(app).get(`/v1/orgs/${org.id}/billing`).expect(200);
      expect(billingRes.body.data.billingStatus).toBe('read_only');

      // POST checkout to purchase a subscription
      const checkoutRes = await request(app)
        .post(`/v1/orgs/${org.id}/billing/checkout`)
        .send({ plan: 'growth', interval: 'month', acceptedPolicies: true })
        .expect(200);
      expect(checkoutRes.body.data.priceId).toBe('pri_sandbox_growth_monthly');
    });

    it('allows mutating endpoints when organization billingStatus is active', async () => {
      const { app, org, repos } = setupAuth({ billingStatus: 'active', plan: 'growth' });
      vi.mocked(repos.organizations.isSlugAvailable).mockResolvedValue(true);
      vi.mocked(repos.organizations.update).mockResolvedValue(org);

      const res = await request(app)
        .patch(`/v1/orgs/${org.id}`)
        .send({ name: 'Updated Studio' })
        .expect(200);

      expect(res.body.data.org.id).toBe(org.id);
    });
  });

  describe('Trial Lifecycle Background Job (Spec Section 9 & P4-05)', () => {
    function setupWorkerCtx() {
      const { repos } = buildTestApp();
      const sendMock = vi.fn().mockResolvedValue({ ok: true, id: 'msg-123' });
      const emailSender = { send: sendMock } as unknown as EmailSender;

      const ctx: WorkerContext = {
        repos,
        storage: {} as unknown as StorageService,
        emailSender,
      };

      return { ctx, repos, sendMock };
    }

    it('sends E-14 trial reminder on day 10 (4 days remaining)', async () => {
      const { ctx, repos, sendMock } = setupWorkerCtx();
      const trialEndsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000); // 4 days left

      const trialingOrg = {
        id: orgId,
        name: 'Acme Growth',
        slug: 'acme-growth',
        type: 'store' as const,
        plan: 'trial' as const,
        billingStatus: 'trialing' as const,
        trialEndsAt,
        paddleCustomerId: null,
        pastDueSince: null,
        planOverride: null,
        planOverrideExpiresAt: null,
        planOverrideReason: null,
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([trialingOrg]);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue(null);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue({
        userId: 'usr-1',
        email: 'acme-owner@example.com',
        name: 'Acme Owner',
      });

      const res = await handleTrialLifecycle(ctx);

      expect(res.processed).toBe(1);
      expect(res.remindersDay10).toBe(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'acme-owner@example.com',
          templateId: 'E-14',
          data: expect.objectContaining({ daysLeft: 4, orgName: 'Acme Growth' }),
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'trial.reminder_day_10' }),
      );
    });

    it('sends E-14 trial reminder on day 13 (1 day remaining)', async () => {
      const { ctx, repos, sendMock } = setupWorkerCtx();
      const trialEndsAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day left

      const trialingOrg = {
        id: orgId,
        name: 'Beta Agency',
        slug: 'beta-agency',
        type: 'agency' as const,
        plan: 'trial' as const,
        billingStatus: 'trialing' as const,
        trialEndsAt,
        paddleCustomerId: null,
        pastDueSince: null,
        planOverride: null,
        planOverrideExpiresAt: null,
        planOverrideReason: null,
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([trialingOrg]);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue(null);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue({
        userId: 'usr-2',
        email: 'beta-owner@example.com',
        name: 'Beta Owner',
      });

      const res = await handleTrialLifecycle(ctx);

      expect(res.remindersDay13).toBe(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'beta-owner@example.com',
          templateId: 'E-14',
          data: expect.objectContaining({ daysLeft: 1, orgName: 'Beta Agency' }),
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'trial.reminder_day_13' }),
      );
    });

    it('transitions expired trial to read_only mode, writes audit log, and sends E-15', async () => {
      const { ctx, repos, sendMock } = setupWorkerCtx();
      const trialEndsAt = new Date(Date.now() - 3600 * 1000); // Expired 1 hour ago

      const expiredOrg = {
        id: orgId,
        name: 'Expired Store',
        slug: 'expired-store',
        type: 'store' as const,
        plan: 'trial' as const,
        billingStatus: 'trialing' as const,
        trialEndsAt,
        paddleCustomerId: null,
        pastDueSince: null,
        planOverride: null,
        planOverrideExpiresAt: null,
        planOverrideReason: null,
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([expiredOrg]);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue({
        userId: 'usr-3',
        email: 'expired-owner@example.com',
        name: 'Expired Owner',
      });

      const res = await handleTrialLifecycle(ctx);

      expect(res.expiredCount).toBe(1);
      expect(repos.organizations.update).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ billingStatus: 'read_only' }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'trial_expired' }),
      );
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'expired-owner@example.com',
          templateId: 'E-15',
          data: expect.objectContaining({ orgName: 'Expired Store' }),
        }),
      );
    });

    it('sends E-20 data deletion warning 7 days before permanent purge', async () => {
      const { ctx, repos, sendMock } = setupWorkerCtx();
      // Org expired 23 days ago -> 7 days remaining until 30-day purge
      const expiredAt = new Date(Date.now() - 23 * 24 * 60 * 60 * 1000);

      const readOnlyOrg = {
        id: orgId,
        name: 'Dormant Agency',
        slug: 'dormant-agency',
        type: 'agency' as const,
        plan: 'trial' as const,
        billingStatus: 'read_only' as const,
        trialEndsAt: expiredAt,
        paddleCustomerId: null,
        pastDueSince: null,
        planOverride: null,
        planOverrideExpiresAt: null,
        planOverrideReason: null,
        timeZone: 'UTC',
        createdAt: expiredAt,
        updatedAt: expiredAt,
        deletedAt: null,
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([readOnlyOrg]);
      vi.mocked(repos.auditLog.findRecentAction).mockImplementation((_oid, action) => {
        if (action === 'trial_expired') {
          return Promise.resolve({
            id: 'aud-1',
            orgId,
            actorId: null,
            actorType: 'system' as const,
            action: 'trial_expired',
            targetType: null,
            targetId: null,
            ip: null,
            userAgent: null,
            data: {},
            createdAt: expiredAt,
          });
        }
        return Promise.resolve(null);
      });
      vi.mocked(repos.memberships.findOwner).mockResolvedValue({
        userId: 'usr-4',
        email: 'dormant-owner@example.com',
        name: 'Dormant Owner',
      });

      const res = await handleTrialLifecycle(ctx);

      expect(res.warnings7d).toBe(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'dormant-owner@example.com',
          templateId: 'E-20',
          data: expect.objectContaining({
            daysUntilDeletion: 7,
            orgName: 'Dormant Agency',
          }),
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'deletion.warning_7d' }),
      );
    });

    it('is idempotent: does not duplicate reminder or warning emails when already sent', async () => {
      const { ctx, repos, sendMock } = setupWorkerCtx();
      const trialEndsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

      const trialingOrg = {
        id: orgId,
        name: 'Acme Growth',
        slug: 'acme-growth',
        type: 'store' as const,
        plan: 'trial' as const,
        billingStatus: 'trialing' as const,
        trialEndsAt,
        paddleCustomerId: null,
        pastDueSince: null,
        planOverride: null,
        planOverrideExpiresAt: null,
        planOverrideReason: null,
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([trialingOrg]);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue({
        id: 'aud-2',
        orgId,
        actorId: null,
        actorType: 'system' as const,
        action: 'trial.reminder_day_10',
        targetType: null,
        targetId: null,
        ip: null,
        userAgent: null,
        data: {},
        createdAt: new Date(),
      });

      const res = await handleTrialLifecycle(ctx);

      expect(res.remindersDay10).toBe(0);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('Email Templates Rendering (E-14, E-15, E-20)', () => {
    it('renders E-14 trial ending email with accessible preheader and upgrade link', () => {
      const rendered = renderEmail('E-14', {
        daysLeft: 4,
        orgName: 'Acme Studio',
        upgradeUrl: 'https://app.everyvisitor.example.com/settings/billing',
        trialEndsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(rendered.subject).toContain('trial ends in 4 days');
      expect(rendered.html).toContain('Acme Studio');
      expect(rendered.html).toContain('Choose a subscription plan');
      expect(rendered.text).toContain('https://app.everyvisitor.example.com/settings/billing');
    });

    it('renders E-15 trial ended email explaining read-only mode and data safety', () => {
      const rendered = renderEmail('E-15', {
        orgName: 'Acme Studio',
        upgradeUrl: 'https://app.everyvisitor.example.com/settings/billing',
      });

      expect(rendered.subject).toContain('trial has ended — account in read-only mode');
      expect(rendered.html).toContain('read-only mode');
      expect(rendered.html).toContain(
        'All existing scan histories, issue records, notes, and PDF reports remain completely safe',
      );
      expect(rendered.html).toContain('Upgrade to resume monitoring');
    });

    it('renders E-20 data deletion warning email with reactivate and export links', () => {
      const rendered = renderEmail('E-20', {
        orgName: 'Acme Studio',
        daysUntilDeletion: 7,
        reactivateUrl: 'https://app.everyvisitor.example.com/settings/billing',
        exportUrl: 'https://app.everyvisitor.example.com/settings/account#export',
        deletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(rendered.subject).toContain('Data deletion notice for Acme Studio (7 days remaining)');
      expect(rendered.html).toContain('Reactivate subscription');
      expect(rendered.html).toContain('https://app.everyvisitor.example.com/settings/account#export');
    });
  });
});
