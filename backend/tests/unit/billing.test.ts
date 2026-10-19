import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';
import { getPriceIdForPlan, getPlanForPriceId } from '../../src/shared/plans.js';
import { verifyPaddleWebhookSignature, processPaddleEvent } from '../../src/billing/paddle.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';

describe('Chunk P4-02: Billing and Paddle Checkout', () => {
  describe('Price IDs and Plan Resolution (Spec Section 12.1 & 12.2)', () => {
    it('maps all paid plans and intervals to price IDs', () => {
      expect(getPriceIdForPlan('store', 'month')).toBe('pri_sandbox_store_monthly');
      expect(getPriceIdForPlan('store', 'year')).toBe('pri_sandbox_store_annual');
      expect(getPriceIdForPlan('growth', 'month')).toBe('pri_sandbox_growth_monthly');
      expect(getPriceIdForPlan('growth', 'year')).toBe('pri_sandbox_growth_annual');
      expect(getPriceIdForPlan('agency', 'month')).toBe('pri_sandbox_agency_monthly');
      expect(getPriceIdForPlan('agency', 'year')).toBe('pri_sandbox_agency_annual');
      expect(getPriceIdForPlan('agency_pro', 'month')).toBe('pri_sandbox_agency_pro_monthly');
      expect(getPriceIdForPlan('agency_pro', 'year')).toBe('pri_sandbox_agency_pro_annual');
    });

    it('throws when requesting price ID for trial plan', () => {
      expect(() => getPriceIdForPlan('trial', 'month')).toThrow();
    });

    it('resolves price IDs back to plan and interval', () => {
      const storeMonth = getPlanForPriceId('pri_sandbox_store_monthly');
      expect(storeMonth).toEqual({ plan: 'store', interval: 'month' });

      const agencyYear = getPlanForPriceId('pri_sandbox_agency_annual');
      expect(agencyYear).toEqual({ plan: 'agency', interval: 'year' });

      const unknown = getPlanForPriceId('pri_unknown_999');
      expect(unknown).toBeNull();
    });
  });

  describe('Paddle Webhook Signature Verification (Spec Section 12.2)', () => {
    const secret = 'pdl_ntfset_secret_test_123';
    const payload = JSON.stringify({ event_type: 'subscription.created', data: { id: 'sub_1' } });

    it('verifies valid signature within 5 minutes', () => {
      const ts = Math.floor(Date.now() / 1000);
      const signed = `${ts}:${payload}`;
      const h1 = crypto.createHmac('sha256', secret).update(signed).digest('hex');
      const signatureHeader = `ts=${ts};h1=${h1}`;

      const valid = verifyPaddleWebhookSignature({
        rawBody: payload,
        signatureHeader,
        secret,
        isProduction: true,
      });

      expect(valid).toBe(true);
    });

    it('rejects signature older than 5 minutes (> 300 seconds)', () => {
      const ts = Math.floor(Date.now() / 1000) - 350; // 350 seconds ago
      const signed = `${ts}:${payload}`;
      const h1 = crypto.createHmac('sha256', secret).update(signed).digest('hex');
      const signatureHeader = `ts=${ts};h1=${h1}`;

      const valid = verifyPaddleWebhookSignature({
        rawBody: payload,
        signatureHeader,
        secret,
        isProduction: true,
      });

      expect(valid).toBe(false);
    });

    it('rejects tampered body or invalid signature', () => {
      const ts = Math.floor(Date.now() / 1000);
      const signatureHeader = `ts=${ts};h1=deadbeef00112233445566778899aabbccddeeff`;

      const valid = verifyPaddleWebhookSignature({
        rawBody: payload,
        signatureHeader,
        secret,
        isProduction: true,
      });

      expect(valid).toBe(false);
    });

    it('rejects missing or malformed header in production', () => {
      expect(
        verifyPaddleWebhookSignature({
          rawBody: payload,
          signatureHeader: undefined,
          secret,
          isProduction: true,
        }),
      ).toBe(false);

      expect(
        verifyPaddleWebhookSignature({
          rawBody: payload,
          signatureHeader: 'malformed_header_without_ts_and_h1',
          secret,
          isProduction: true,
        }),
      ).toBe(false);
    });
  });

  describe('Paddle Event Processing (Spec Section 12.2)', () => {
    it('is idempotent: ignores duplicate events', async () => {
      const { repos } = buildTestApp();
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(false);

      const result = await processPaddleEvent(
        {
          event_id: 'evt_duplicate_1',
          event_type: 'subscription.created',
          data: { id: 'sub_1' },
        },
        repos,
      );

      expect(result.handled).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('ignores unknown price IDs without changing state', async () => {
      const { repos } = buildTestApp();
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(true);

      const result = await processPaddleEvent(
        {
          event_id: 'evt_unknown_price',
          event_type: 'subscription.created',
          data: {
            id: 'sub_1',
            custom_data: { orgId: 'org-1' },
            items: [{ price: { id: 'pri_nonexistent' } }],
          },
        },
        repos,
      );

      expect(result.handled).toBe(true);
      expect(result.error).toContain('Unknown price ID');
      expect(repos.organizations.update).not.toHaveBeenCalled();
      expect(repos.subscriptions.upsert).not.toHaveBeenCalled();
    });

    it('handles customer.created and updates paddleCustomerId on org', async () => {
      const { repos } = buildTestApp();
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(true);

      await processPaddleEvent(
        {
          event_id: 'evt_customer_1',
          event_type: 'customer.created',
          data: {
            id: 'ctm_123',
            custom_data: { orgId: 'org-1' },
          },
        },
        repos,
      );

      expect(repos.organizations.update).toHaveBeenCalledWith(
        asOrgId('org-1'),
        expect.objectContaining({ paddleCustomerId: 'ctm_123' }),
      );
    });

    it('handles subscription.activated and sets org plan to active', async () => {
      const { repos } = buildTestApp();
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(true);

      await processPaddleEvent(
        {
          event_id: 'evt_sub_activated_1',
          event_type: 'subscription.activated',
          data: {
            id: 'sub_paddle_1',
            customer_id: 'ctm_123',
            status: 'active',
            custom_data: { orgId: 'org-1' },
            current_billing_period: {
              starts_at: '2026-10-19T00:00:00.000Z',
              ends_at: '2026-11-19T00:00:00.000Z',
            },
            items: [{ price: { id: 'pri_sandbox_agency_monthly' } }],
          },
        },
        repos,
      );

      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: asOrgId('org-1'),
          paddleSubscriptionId: 'sub_paddle_1',
          plan: 'agency',
          interval: 'month',
          status: 'active',
        }),
      );

      expect(repos.organizations.update).toHaveBeenCalledWith(
        asOrgId('org-1'),
        expect.objectContaining({
          plan: 'agency',
          billingStatus: 'active',
          paddleCustomerId: 'ctm_123',
        }),
      );
    });

    it('handles subscription.past_due, paused, and canceled', async () => {
      const { repos } = buildTestApp();
      vi.mocked(repos.paddleEvents.record).mockResolvedValue(true);

      // past_due
      await processPaddleEvent(
        {
          event_id: 'evt_past_due',
          event_type: 'subscription.past_due',
          data: { id: 'sub_1', custom_data: { orgId: 'org-1' } },
        },
        repos,
      );
      expect(repos.organizations.update).toHaveBeenCalledWith(
        asOrgId('org-1'),
        expect.objectContaining({ billingStatus: 'past_due' }),
      );

      // paused
      await processPaddleEvent(
        {
          event_id: 'evt_paused',
          event_type: 'subscription.paused',
          data: { id: 'sub_1', custom_data: { orgId: 'org-1' } },
        },
        repos,
      );
      expect(repos.organizations.update).toHaveBeenCalledWith(
        asOrgId('org-1'),
        expect.objectContaining({ billingStatus: 'paused' }),
      );

      // canceled
      await processPaddleEvent(
        {
          event_id: 'evt_canceled',
          event_type: 'subscription.canceled',
          data: { id: 'sub_1', custom_data: { orgId: 'org-1' } },
        },
        repos,
      );
      expect(repos.organizations.update).toHaveBeenCalledWith(
        asOrgId('org-1'),
        expect.objectContaining({ billingStatus: 'canceled' }),
      );
    });

    it('handles transaction.completed and saves invoice', async () => {
      const { repos } = buildTestApp();
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(true);

      await processPaddleEvent(
        {
          event_id: 'evt_txn_1',
          event_type: 'transaction.completed',
          data: {
            id: 'txn_123',
            custom_data: { orgId: 'org-1' },
            details: {
              totals: {
                total: 19900,
                currency_code: 'USD',
              },
            },
            status: 'completed',
            billed_at: '2026-10-19T10:00:00.000Z',
            invoice_pdf_url: 'https://paddle.com/invoices/inv_123.pdf',
          },
        },
        repos,
      );

      expect(repos.invoices.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: asOrgId('org-1'),
          paddleTransactionId: 'txn_123',
          amountCents: 19900,
          currency: 'USD',
          status: 'completed',
          invoiceUrl: 'https://paddle.com/invoices/inv_123.pdf',
        }),
      );
    });
  });

  describe('Billing API Endpoints (Spec Section 7.9, Owner Only)', () => {
    function setupAuth(role: 'owner' | 'admin' | 'member' = 'owner') {
      const user = {
        id: 'usr-1',
        email: 'owner@example.com',
        name: 'Org Owner',
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
      const org = {
        id: '018f0000-0000-7000-8000-000000000001',
        name: 'Acme Agency',
        slug: 'acme',
        type: 'agency' as const,
        plan: 'trial' as const,
        billingStatus: 'trialing' as const,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        paddleCustomerId: 'ctm_123',
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
      vi.mocked(repos.memberships.findRole).mockResolvedValue(role);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId: org.id,
        userId: user.id,
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { app, repos, org, user };
    }

    it('requires owner role on GET /v1/orgs/:orgId/billing', async () => {
      // Member gets 403
      const { app: memberApp, org } = setupAuth('member');
      const forbiddenRes = await request(memberApp).get(`/v1/orgs/${org.id}/billing`).expect(403);
      expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

      // Owner gets 200 with plan, limits, and usage
      const { app: ownerApp } = setupAuth('owner');
      const okRes = await request(ownerApp).get(`/v1/orgs/${org.id}/billing`).expect(200);

      expect(okRes.body.data.plan).toBe('trial');
      expect(okRes.body.data.billingStatus).toBe('trialing');
      expect(okRes.body.data.usage).toHaveProperty('sites');
      expect(okRes.body.data.usage).toHaveProperty('teamMembers');
      expect(okRes.body.data.usage).toHaveProperty('aiSuggestions');
      expect(okRes.body.data.customerPortalUrl).toContain('customer-portal.paddle.com');
    });

    it('returns checkout settings on POST /v1/orgs/:orgId/billing/checkout', async () => {
      const { app, org, user } = setupAuth('owner');

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/checkout`)
        .send({ plan: 'growth', interval: 'month' })
        .expect(200);

      expect(res.body.data.priceId).toBe('pri_sandbox_growth_monthly');
      expect(res.body.data.customerEmail).toBe(user.email);
      expect(res.body.data.customData.orgId).toBe(org.id);
      expect(res.body.data.paddleEnvironment).toBe('sandbox');
    });

    it('schedules cancellation on POST /v1/orgs/:orgId/billing/cancel', async () => {
      const { app, org, repos } = setupAuth('owner');
      vi.mocked(repos.subscriptions.findByOrgId).mockResolvedValue({
        id: 'sub-1',
        paddleSubscriptionId: 'sub_paddle_1',
        paddlePriceId: 'pri_1',
        plan: 'agency',
        interval: 'month',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        orgId: org.id,
      });

      const res = await request(app)
        .post(`/v1/orgs/${org.id}/billing/cancel`)
        .send({ reason: 'Too expensive' })
        .expect(200);

      expect(res.body.data.cancelAtPeriodEnd).toBe(true);
      expect(repos.subscriptions.setCancelAtPeriodEnd).toHaveBeenCalledWith(asOrgId(org.id), true);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({ action: 'billing.subscription_cancelled' }),
      );
    });

    it('resumes scheduled cancellation on POST /v1/orgs/:orgId/billing/resume', async () => {
      const { app, org, repos } = setupAuth('owner');
      vi.mocked(repos.subscriptions.findByOrgId).mockResolvedValue({
        id: 'sub-1',
        paddleSubscriptionId: 'sub_paddle_1',
        paddlePriceId: 'pri_1',
        plan: 'agency',
        interval: 'month',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: true,
        scheduledChange: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        orgId: org.id,
      });

      const res = await request(app).post(`/v1/orgs/${org.id}/billing/resume`).send({}).expect(200);

      expect(res.body.data.cancelAtPeriodEnd).toBe(false);
      expect(repos.subscriptions.setCancelAtPeriodEnd).toHaveBeenCalledWith(asOrgId(org.id), false);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({ action: 'billing.subscription_resumed' }),
      );
    });

    it('returns customer portal URL on GET /v1/orgs/:orgId/billing/portal', async () => {
      const { app, org } = setupAuth('owner');

      const res = await request(app).get(`/v1/orgs/${org.id}/billing/portal`).expect(200);

      expect(res.body.data.url).toContain('customer-portal.paddle.com');
    });

    it('returns invoices on GET /v1/orgs/:orgId/invoices', async () => {
      const { app, org, repos } = setupAuth('owner');
      vi.mocked(repos.invoices.listByOrgId).mockResolvedValue([
        {
          id: 'inv-1',
          orgId: org.id,
          paddleTransactionId: 'txn-1',
          amountCents: 19900,
          currency: 'USD',
          status: 'paid',
          billedAt: new Date(),
          invoiceUrl: 'https://example.com/inv.pdf',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app).get(`/v1/orgs/${org.id}/invoices`).expect(200);

      expect(res.body.data.invoices).toHaveLength(1);
      expect(res.body.data.invoices[0].amountCents).toBe(19900);
    });

    it('processes webhook via POST /webhooks/paddle and activates sandbox purchase immediately', async () => {
      const { app, org, repos } = setupAuth('owner');

      const webhookPayload = {
        event_id: 'evt_sandbox_purchase_99',
        event_type: 'subscription.activated',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_sandbox_1',
          customer_id: 'ctm_sandbox_1',
          status: 'active',
          custom_data: { orgId: org.id },
          current_billing_period: {
            starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          items: [{ price: { id: 'pri_sandbox_agency_pro_monthly' } }],
        },
      };

      // Signature verification passes in dev/test
      const res = await request(app)
        .post('/webhooks/paddle')
        .set('paddle-signature', `ts=${Math.floor(Date.now() / 1000)};h1=dummy_in_dev`)
        .send(webhookPayload)
        .expect(200);

      expect(res.body.received).toBe(true);
      expect(res.body.handled).toBe(true);

      // Verify plan was upgraded
      expect(repos.organizations.update).toHaveBeenCalledWith(
        asOrgId(org.id),
        expect.objectContaining({
          plan: 'agency_pro',
          billingStatus: 'active',
        }),
      );
    });
  });
});
