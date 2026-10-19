import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  processPaddleEvent,
  replayPaddleEventById,
  replayFailedPaddleEvents,
  replayPaddlePayload,
  type PaddleEventPayload,
} from '../../src/billing/paddle.js';
import { fakeRepos } from '../helpers/fakes.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures/paddle');

function loadFixture(filename: string): PaddleEventPayload {
  const filePath = path.join(fixturesDir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PaddleEventPayload;
}

describe('Chunk P4-03: Paddle Webhooks and Staff Replay Tooling', () => {
  const testOrgId = asOrgId('00000000-0000-0000-0000-000000000001');

  describe('Recorded Webhook Payloads (Section 12.2)', () => {
    it('processes subscription.created fixture payload and records plan_changed audit log', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.created.json');

      const result = await processPaddleEvent(payload, repos);

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe('subscription.created');
      expect(repos.paddleEvents.record).toHaveBeenCalledWith(
        payload.event_id,
        payload.event_type,
        payload,
      );
      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: testOrgId,
          paddleSubscriptionId: 'sub_paddle_live_001',
          plan: 'store',
          interval: 'month',
          status: 'active',
        }),
      );
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          plan: 'store',
          billingStatus: 'active',
          paddleCustomerId: 'ctm_paddle_001',
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'plan_changed',
          data: expect.objectContaining({ plan: 'store', isReplay: false }),
        }),
      );
    });

    it('processes subscription.updated fixture payload and updates plan', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.updated.json');

      const result = await processPaddleEvent(payload, repos);

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe('subscription.updated');
      expect(repos.subscriptions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: testOrgId,
          paddleSubscriptionId: 'sub_paddle_live_001',
          plan: 'growth',
        }),
      );
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          plan: 'growth',
        }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'plan_changed',
          data: expect.objectContaining({ plan: 'growth', isReplay: false }),
        }),
      );
    });

    it('processes subscription.past_due fixture payload', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.past_due.json');

      const result = await processPaddleEvent(payload, repos);

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe('subscription.past_due');
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          billingStatus: 'past_due',
        }),
      );
    });

    it('processes subscription.canceled fixture payload', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.canceled.json');

      const result = await processPaddleEvent(payload, repos);

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe('subscription.canceled');
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          billingStatus: 'canceled',
        }),
      );
    });

    it('processes transaction.completed fixture payload and records invoice', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('transaction.completed.json');

      const result = await processPaddleEvent(payload, repos);

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe('transaction.completed');
      expect(repos.invoices.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: testOrgId,
          paddleTransactionId: 'txn_paddle_live_001',
          amountCents: 4900,
          currency: 'USD',
          status: 'paid',
        }),
      );
    });
  });

  describe('Duplicate and Out-of-Order Handling (Spec Section 12.2 #3)', () => {
    it('ignores duplicate events without re-applying side effects', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.created.json');

      // Simulate first event succeeds
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(true);
      const first = await processPaddleEvent(payload, repos);
      expect(first.duplicate).toBeFalsy();
      expect(repos.organizations.update).toHaveBeenCalledTimes(1);

      // Simulate second event with identical event_id is rejected by record (returns false)
      vi.mocked(repos.paddleEvents.record).mockResolvedValueOnce(false);
      const duplicate = await processPaddleEvent(payload, repos);
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.handled).toBe(true);
      // organizations.update should NOT have been called a second time
      expect(repos.organizations.update).toHaveBeenCalledTimes(1);
    });

    it('ignores out-of-order subscription.updated events where occurred_at is older than stored updatedAt', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.updated.json');
      // Set existing subscription updatedAt to a future date relative to payload.occurred_at
      const newerDate = new Date('2026-10-19T15:00:00.000Z');
      vi.mocked(repos.subscriptions.findByPaddleSubscriptionId).mockResolvedValueOnce({
        id: 'sub-db-id',
        orgId: testOrgId,
        paddleSubscriptionId: 'sub_paddle_live_001',
        paddlePriceId: 'pri_agency_monthly',
        plan: 'agency',
        interval: 'month',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        createdAt: new Date(),
        updatedAt: newerDate, // Newer than payload (11:00:00Z)
      });

      const result = await processPaddleEvent(payload, repos);

      expect(result.handled).toBe(true);
      expect(result.error).toBe('Out-of-order event ignored');
      // Must not overwrite subscription or org with older payload data
      expect(repos.subscriptions.upsert).not.toHaveBeenCalled();
      expect(repos.organizations.update).not.toHaveBeenCalled();
    });
  });

  describe('Staff Replay Tooling', () => {
    it('replays an event by ID and flags isReplay in audit log', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.created.json');
      vi.mocked(repos.paddleEvents.findById).mockResolvedValueOnce({
        eventId: payload.event_id,
        eventType: payload.event_type,
        receivedAt: new Date(),
        processedAt: new Date(),
        payload,
        error: null,
      });

      const result = await replayPaddleEventById(repos, payload.event_id);

      expect(result.handled).toBe(true);
      // During replay, record() should NOT be called to avoid conflict
      expect(repos.paddleEvents.record).not.toHaveBeenCalled();
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'plan_changed',
          data: expect.objectContaining({ isReplay: true }),
        }),
      );
    });

    it('throws when replaying an unknown event ID', async () => {
      const { repos } = fakeRepos();
      vi.mocked(repos.paddleEvents.findById).mockResolvedValueOnce(null);

      await expect(replayPaddleEventById(repos, 'nonexistent_evt')).rejects.toThrow(/not found/i);
    });

    it('replays all failed events and returns summary', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.created.json');
      vi.mocked(repos.paddleEvents.listFailed).mockResolvedValueOnce([
        {
          eventId: 'evt_failed_01',
          eventType: 'subscription.created',
          receivedAt: new Date(),
          processedAt: new Date(),
          payload,
          error: 'Connection timeout',
        },
      ]);

      const summary = await replayFailedPaddleEvents(repos);

      expect(summary.total).toBe(1);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(repos.organizations.update).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({ plan: 'store' }),
      );
    });

    it('replays payload directly via replayPaddlePayload', async () => {
      const { repos } = fakeRepos();
      const payload = loadFixture('subscription.created.json');

      const result = await replayPaddlePayload(repos, payload);

      expect(result.handled).toBe(true);
      expect(repos.paddleEvents.record).not.toHaveBeenCalled();
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        testOrgId,
        expect.objectContaining({
          action: 'plan_changed',
          data: expect.objectContaining({ isReplay: true }),
        }),
      );
    });
  });
});
