import { describe, expect, it, vi } from 'vitest';
import { processPaddleEvent, type PaddleEventPayload } from '../../src/billing/paddle.js';
import { handleTrialLifecycle } from '../../src/worker/jobs/trial-lifecycle.js';
import {
  renderPaymentFailed,
  renderSubscriptionCanceled,
  renderPlanChanged,
} from '../../src/emails/templates/index.js';
import { renderEmail, getSampleTemplateData } from '../../src/emails/renderer.js';
import { fakeRepos } from '../helpers/fakes.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';
import type { WorkerContext } from '../../src/worker/types.js';
import type { EmailSender } from '../../src/emails/sender.js';
import type {
  PaymentFailedData,
  SubscriptionCanceledData,
  PlanChangedData,
} from '../../src/emails/types.js';

import type { StorageService } from '../../src/storage/index.js';

describe('Chunk P4-06: Payment Problems (Past-Due, 7-Day Grace Period, E-17, E-18, E-19)', () => {
  const testOrgId = asOrgId('00000000-0000-0000-0000-000000000001');

  const sampleOrg = {
    id: testOrgId,
    name: 'Acme Test Store',
    slug: 'acme-test-store',
    type: 'store' as const,
    plan: 'store' as const,
    billingStatus: 'active' as const,
    trialEndsAt: null,
    paddleCustomerId: 'ctm_123',
    timeZone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const sampleOwner = {
    userId: 'usr-1',
    email: 'owner@example.com',
    name: 'Acme Owner',
  };

  describe('Paddle Webhook: subscription.past_due', () => {
    it('sets billingStatus to past_due, writes audit log, and sends E-17 to owner', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.organizations.findById).mockResolvedValue(sampleOrg);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue(sampleOwner);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue(null);

      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const payload: PaddleEventPayload = {
        event_id: 'evt_past_due_1',
        event_type: 'subscription.past_due',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_123',
          custom_data: { orgId: testOrgId },
          status: 'past_due',
        },
      };

      const result = await processPaddleEvent(payload, repos, { emailSender: mockEmailSender });

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe('subscription.past_due');
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({ billingStatus: 'past_due' }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'subscription.past_due',
          data: expect.objectContaining({ paddleSubscriptionId: 'sub_123' }),
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'payment.warning_e17',
        }),
      );
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          templateId: 'E-17',
          data: expect.objectContaining({
            orgName: 'Acme Test Store',
            daysRemaining: 7,
          }),
        }),
      );
    });

    it('does not send duplicate E-17 if already sent recently', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.organizations.findById).mockResolvedValue(sampleOrg);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue(sampleOwner);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue({
        id: 'aud-prev',
        orgId: testOrgId,
        actorId: null,
        actorType: 'system',
        action: 'payment.warning_e17',
        targetType: null,
        targetId: null,
        ip: null,
        userAgent: null,
        data: {},
        createdAt: new Date(),
      });

      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const payload: PaddleEventPayload = {
        event_id: 'evt_past_due_2',
        event_type: 'subscription.past_due',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_123',
          custom_data: { orgId: testOrgId },
          status: 'past_due',
        },
      };

      const result = await processPaddleEvent(payload, repos, { emailSender: mockEmailSender });

      expect(result.handled).toBe(true);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('Paddle Webhook: transaction.payment_failed', () => {
    it('records payment_failed audit log and sends E-17 if not already sent', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.organizations.findById).mockResolvedValue(sampleOrg);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue(sampleOwner);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue(null);

      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const payload: PaddleEventPayload = {
        event_id: 'evt_txn_fail_1',
        event_type: 'transaction.payment_failed',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'txn_fail_123',
          custom_data: { orgId: testOrgId },
          details: {
            totals: {
              total: 4900,
              currency_code: 'USD',
            },
          },
        },
      };

      const result = await processPaddleEvent(payload, repos, { emailSender: mockEmailSender });

      expect(result.handled).toBe(true);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'payment_failed',
          data: expect.objectContaining({ paddleTransactionId: 'txn_fail_123', amount: 4900 }),
        }),
      );
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          templateId: 'E-17',
          data: expect.objectContaining({
            orgName: 'Acme Test Store',
            amountFormatted: '$49.00',
          }),
        }),
      );
    });
  });

  describe('Paddle Webhook: subscription.canceled', () => {
    it('sets billingStatus to canceled and sends E-18 to owner', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.organizations.findById).mockResolvedValue(sampleOrg);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue(sampleOwner);

      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const payload: PaddleEventPayload = {
        event_id: 'evt_cancel_1',
        event_type: 'subscription.canceled',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_123',
          custom_data: { orgId: testOrgId },
          status: 'canceled',
          current_billing_period: {
            ends_at: '2026-11-01T00:00:00Z',
          },
        },
      };

      const result = await processPaddleEvent(payload, repos, { emailSender: mockEmailSender });

      expect(result.handled).toBe(true);
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({ billingStatus: 'canceled' }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'subscription.canceled',
          data: expect.objectContaining({ paddleSubscriptionId: 'sub_123' }),
        }),
      );
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          templateId: 'E-18',
          data: expect.objectContaining({
            orgName: 'Acme Test Store',
            isImmediate: true,
          }),
        }),
      );
    });
  });

  describe('Paddle Webhook: subscription.updated with plan change', () => {
    it('updates plan and sends E-19 to owner', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.organizations.findById).mockResolvedValue(sampleOrg);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue(sampleOwner);
      vi.mocked(repos.subscriptions.findByPaddleSubscriptionId).mockResolvedValue({
        id: 'sub-db-1',
        orgId: testOrgId,
        paddleSubscriptionId: 'sub_123',
        paddlePriceId: 'pri_store_monthly',
        plan: 'store',
        interval: 'month',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        createdAt: new Date(),
        updatedAt: new Date(Date.now() - 60000),
      });

      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const payload: PaddleEventPayload = {
        event_id: 'evt_update_plan_1',
        event_type: 'subscription.updated',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_123',
          custom_data: { orgId: testOrgId },
          items: [{ price: { id: 'pri_sandbox_growth_monthly' } }],
        },
      };

      const result = await processPaddleEvent(payload, repos, { emailSender: mockEmailSender });

      expect(result.handled).toBe(true);
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({ plan: 'growth' }),
      );
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          templateId: 'E-19',
          data: expect.objectContaining({
            orgName: 'Acme Test Store',
            newPlanName: 'Growth',
            oldPlanName: 'Store',
          }),
        }),
      );
    });
  });

  describe('7-Day Grace Period in handleTrialLifecycle', () => {
    it('does not transition past_due org to read_only if less than 7 days have passed', async () => {
      const { repos } = fakeRepos();
      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const pastDueOrg = {
        ...sampleOrg,
        billingStatus: 'past_due' as const,
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([pastDueOrg]);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue({
        id: 'aud-pd',
        orgId: testOrgId,
        actorId: null,
        actorType: 'system',
        action: 'subscription.past_due',
        targetType: null,
        targetId: null,
        ip: null,
        userAgent: null,
        data: {},
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      });

      const ctx: WorkerContext = {
        repos,
        storage: {} as unknown as StorageService,
        emailSender: mockEmailSender,
      };

      const res = await handleTrialLifecycle(ctx);

      expect(res.pastDueExpiredCount).toBe(0);
      expect(repos.organizations.update).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('transitions past_due org to read_only after 7 days grace period and sends E-15', async () => {
      const { repos } = fakeRepos();
      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
      const mockEmailSender = { send: sendMock } as unknown as EmailSender;

      const pastDueOrg = {
        ...sampleOrg,
        billingStatus: 'past_due' as const,
        updatedAt: new Date(Date.now() - 7.5 * 24 * 60 * 60 * 1000), // 7.5 days ago
      };

      vi.mocked(repos.organizations.findDueForTrialLifecycle).mockResolvedValue([pastDueOrg]);
      vi.mocked(repos.memberships.findOwner).mockResolvedValue(sampleOwner);
      vi.mocked(repos.auditLog.findRecentAction).mockResolvedValue({
        id: 'aud-pd',
        orgId: testOrgId,
        actorId: null,
        actorType: 'system',
        action: 'subscription.past_due',
        targetType: null,
        targetId: null,
        ip: null,
        userAgent: null,
        data: {},
        createdAt: new Date(Date.now() - 7.5 * 24 * 60 * 60 * 1000),
      });

      const ctx: WorkerContext = {
        repos,
        storage: {} as unknown as StorageService,
        emailSender: mockEmailSender,
      };

      const res = await handleTrialLifecycle(ctx);

      expect(res.pastDueExpiredCount).toBe(1);
      expect(repos.organizations.update).toHaveBeenCalledWith(testOrgId, {
        billingStatus: 'read_only',
      });
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'past_due_expired',
        }),
      );
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          templateId: 'E-15',
          data: expect.objectContaining({
            orgName: 'Acme Test Store',
          }),
        }),
      );
    });
  });

  describe('Email Templates: E-17, E-18, E-19 Rendering', () => {
    it('renders E-17 payment failed email with accessible HTML and plain text', () => {
      const output = renderPaymentFailed({
        orgName: 'Acme Test Store',
        updateBillingUrl: 'http://localhost:3000/settings/billing',
        daysRemaining: 7,
        amountFormatted: '$49.00',
      });

      expect(output.subject).toContain('Payment failed');
      expect(output.subject).toContain('Acme Test Store');
      expect(output.html).toContain('http://localhost:3000/settings/billing');
      expect(output.html).toContain('7 days');
      expect(output.html).toContain('$49.00');
      expect(output.text).toContain('7 days');
    });

    it('renders E-18 subscription canceled email', () => {
      const output = renderSubscriptionCanceled({
        orgName: 'Acme Test Store',
        effectiveDate: new Date('2026-11-01T00:00:00Z'),
        reactivateUrl: 'http://localhost:3000/settings/billing',
        isImmediate: false,
      });

      expect(output.subject).toContain('canceled');
      expect(output.subject).toContain('Acme Test Store');
      expect(output.html).toContain('30 days');
      expect(output.html).toContain('Nov 1, 2026');
      expect(output.text).toContain('http://localhost:3000/settings/billing');
    });

    it('renders E-19 plan changed email', () => {
      const output = renderPlanChanged({
        orgName: 'Acme Test Store',
        oldPlanName: 'Store',
        newPlanName: 'Growth',
        interval: 'month',
        billingUrl: 'http://localhost:3000/settings/billing',
      });

      expect(output.subject).toContain('Growth');
      expect(output.html).toContain('Growth');
      expect(output.html).toContain('Monthly');
      expect(output.text).toContain('Growth');
    });

    it('renderer dispatcher and sample data work for E-17, E-18, E-19', () => {
      const s17 = getSampleTemplateData('E-17') as PaymentFailedData;
      const s18 = getSampleTemplateData('E-18') as SubscriptionCanceledData;
      const s19 = getSampleTemplateData('E-19') as PlanChangedData;

      const r17 = renderEmail('E-17', s17);
      const r18 = renderEmail('E-18', s18);
      const r19 = renderEmail('E-19', s19);

      expect(r17.subject).toContain('Payment failed');
      expect(r18.subject).toContain('canceled');
      expect(r19.subject).toContain('Growth');
    });
  });
});
