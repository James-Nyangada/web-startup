import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaddleClient } from '../../src/billing/paddle-api.js';

describe('PaddleClient API Integration', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Configuration & Simulation Mode', () => {
    it('reports not configured when apiKey is missing', () => {
      const client = new PaddleClient({ apiKey: '', environment: 'sandbox' });
      expect(client.isConfigured()).toBe(false);
      expect(client.getEnvironment()).toBe('sandbox');
    });

    it('simulates updateSubscription when not configured', async () => {
      const client = new PaddleClient({ apiKey: '', environment: 'sandbox' });
      const res = await client.updateSubscription('sub_123', {
        priceId: 'pri_456',
        prorationBillingMode: 'prorated_immediately',
      });
      expect(res.id).toBe('sub_123');
      expect(res.status).toBe('active');
    });

    it('simulates cancelSubscription when not configured', async () => {
      const client = new PaddleClient({ apiKey: '', environment: 'sandbox' });
      const res = await client.cancelSubscription('sub_123');
      expect(res.id).toBe('sub_123');
      expect(res.scheduledChange?.action).toBe('cancel');
    });

    it('simulates resumeSubscription when not configured', async () => {
      const client = new PaddleClient({ apiKey: '', environment: 'sandbox' });
      const res = await client.resumeSubscription('sub_123');
      expect(res.id).toBe('sub_123');
      expect(res.scheduledChange).toBeNull();
    });

    it('returns default customer portal URL when not configured', async () => {
      const client = new PaddleClient({ apiKey: '', environment: 'sandbox' });
      const res = await client.createCustomerPortalSession('ctm_123');
      expect(res.url).toBe('https://sandbox-customer-portal.paddle.com');
    });
  });

  describe('Live Paddle API HTTP Requests (when configured)', () => {
    const apiKey = 'pdl_api_test_key_xyz';
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
    });

    it('calls PATCH /subscriptions/:id with correct authorization and prorationBillingMode on upgrade', async () => {
      const client = new PaddleClient({ apiKey, environment: 'sandbox' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: {
                id: 'sub_live_123',
                status: 'active',
                items: [{ price: { id: 'pri_agency' } }],
              },
            }),
          ),
      });

      const res = await client.updateSubscription('sub_live_123', {
        priceId: 'pri_agency',
        prorationBillingMode: 'prorated_immediately',
      });

      expect(res.id).toBe('sub_live_123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sandbox-api.paddle.com/subscriptions/sub_live_123',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            items: [{ price_id: 'pri_agency', quantity: 1 }],
            proration_billing_mode: 'prorated_immediately',
          }),
        }),
      );
    });

    it('calls POST /subscriptions/:id/cancel with effective_from', async () => {
      const client = new PaddleClient({ apiKey, environment: 'sandbox' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: {
                id: 'sub_live_123',
                status: 'active',
                scheduled_change: { action: 'cancel', effective_at: '2026-11-01T00:00:00Z' },
              },
            }),
          ),
      });

      const res = await client.cancelSubscription('sub_live_123', {
        effectiveFrom: 'next_billing_period',
      });

      expect(res.id).toBe('sub_live_123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sandbox-api.paddle.com/subscriptions/sub_live_123/cancel',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${apiKey}` }),
          body: JSON.stringify({ effective_from: 'next_billing_period' }),
        }),
      );
    });

    it('calls PATCH /subscriptions/:id with scheduled_change: null on resume', async () => {
      const client = new PaddleClient({ apiKey, environment: 'sandbox' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: {
                id: 'sub_live_123',
                status: 'active',
                scheduled_change: null,
              },
            }),
          ),
      });

      const res = await client.resumeSubscription('sub_live_123');
      expect(res.id).toBe('sub_live_123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sandbox-api.paddle.com/subscriptions/sub_live_123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ scheduled_change: null }),
        }),
      );
    });

    it('calls POST /customers/:id/portal-sessions and returns portal session URL', async () => {
      const client = new PaddleClient({ apiKey, environment: 'sandbox' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: {
                id: 'cpt_session_456',
                customer_id: 'ctm_123',
                urls: {
                  general: {
                    overview: 'https://sandbox-customer-portal.paddle.com/session/abc123xyz',
                  },
                },
              },
            }),
          ),
      });

      const res = await client.createCustomerPortalSession('ctm_123', ['sub_live_123']);
      expect(res.url).toBe('https://sandbox-customer-portal.paddle.com/session/abc123xyz');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sandbox-api.paddle.com/customers/ctm_123/portal-sessions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ subscription_ids: ['sub_live_123'] }),
        }),
      );
    });

    it('throws AppError when Paddle returns an error response', async () => {
      const client = new PaddleClient({ apiKey, environment: 'sandbox' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                type: 'request_error',
                code: 'subscription_locked',
                message: 'Subscription is locked for editing',
              },
            }),
          ),
      });

      await expect(
        client.updateSubscription('sub_live_123', {
          priceId: 'pri_agency',
          prorationBillingMode: 'prorated_immediately',
        }),
      ).rejects.toThrow('Subscription is locked for editing');
    });
  });
});
