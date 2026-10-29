import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { sessionStore, PersistentShopSessionStore } from '../src/shopify.js';
import type { AppConfig } from '../src/config.js';

const mockConfig: AppConfig = {
  apiKey: 'test_client_id_123',
  apiSecret: 'shpss_secret_456',
  scopes: ['read_themes'],
  host: 'https://testapp.everyvisitor.app',
  port: 3001,
  everyvisitorApiUrl: 'https://api.everyvisitor.app',
  appUrl: 'https://everyvisitor.app',
};

function signWebhook(body: object, secret: string): string {
  const json = JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(Buffer.from(json, 'utf8')).digest('base64');
}

function createMockAppBridgeToken(options: {
  shop: string;
  secret: string;
  apiKey: string;
  expired?: boolean;
  audience?: string;
  tamperSig?: boolean;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: `https://${options.shop}/admin`,
      dest: `https://${options.shop}`,
      aud: options.audience ?? options.apiKey,
      sub: 'user_123',
      exp: options.expired ? now - 3600 : now + 3600,
      nbf: now - 60,
      iat: now,
    }),
  ).toString('base64url');

  const data = `${header}.${payload}`;
  const sig = crypto
    .createHmac('sha256', options.tamperSig ? 'wrong_secret' : options.secret)
    .update(data)
    .digest('base64url');

  return `${data}.${sig}`;
}

describe('Shopify App (P7-02)', () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    app = createServer(mockConfig);
  });

  describe('Health & Basics', () => {
    it('returns 200 on /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('OAuth & Validation', () => {
    it('rejects invalid shop domain during auth initiation', async () => {
      const res = await request(app).get('/api/auth?shop=malicious-domain.com');
      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid shop domain');
    });

    it('redirects to Shopify OAuth authorize URL on valid shop domain', async () => {
      const res = await request(app).get('/api/auth?shop=my-valid-store.myshopify.com');
      expect(res.status).toBe(302);
      expect(res.header.location).toContain('my-valid-store.myshopify.com/admin/oauth/authorize');
      expect(res.header.location).toContain('client_id=test_client_id_123');
      expect(res.header['set-cookie']).toBeDefined();
    });

    it('rejects OAuth callback with invalid HMAC', async () => {
      const res = await request(app).get(
        '/api/auth/callback?shop=my-valid-store.myshopify.com&code=123&state=xyz&hmac=invalid_hmac',
      );
      expect(res.status).toBe(400);
      expect(res.text).toContain('HMAC validation failed');
    });
  });

  describe('Mandatory Privacy Webhooks (GDPR compliance)', () => {
    it('handles customers/data_request webhook with valid HMAC', async () => {
      const payload = {
        shop_id: 123456,
        shop_domain: 'my-store.myshopify.com',
        customer: { id: 789, email: 'shopper@example.com' },
        orders_requested: [],
      };
      const hmac = signWebhook(payload, mockConfig.apiSecret);

      const res = await request(app)
        .post('/api/webhooks/customers/data_request')
        .set('x-shopify-hmac-sha256', hmac)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.customer_data).toBeNull();
    });

    it('handles customers/redact webhook with valid HMAC', async () => {
      const payload = {
        shop_id: 123456,
        shop_domain: 'my-store.myshopify.com',
        customer: { id: 789, email: 'shopper@example.com' },
      };
      const hmac = signWebhook(payload, mockConfig.apiSecret);

      const res = await request(app)
        .post('/api/webhooks/customers/redact')
        .set('x-shopify-hmac-sha256', hmac)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Acknowledged');
    });

    it('handles shop/redact webhook and cleans up store session', async () => {
      const shop = 'redact-store.myshopify.com';
      sessionStore.set(shop, {
        shop,
        accessToken: 'token_123',
        scope: 'read_themes',
        installedAt: new Date().toISOString(),
      });
      expect(sessionStore.has(shop)).toBe(true);

      const payload = {
        shop_id: 9999,
        shop_domain: shop,
      };
      const hmac = signWebhook(payload, mockConfig.apiSecret);

      const res = await request(app)
        .post('/api/webhooks/shop/redact')
        .set('x-shopify-hmac-sha256', hmac)
        .send(payload);

      expect(res.status).toBe(200);
      expect(sessionStore.has(shop)).toBe(false);
    });

    it('rejects webhooks with missing or invalid HMAC', async () => {
      const payload = { shop_domain: 'store.myshopify.com' };
      const res = await request(app)
        .post('/api/webhooks/customers/data_request')
        .set('x-shopify-hmac-sha256', 'wrong_hmac')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('HMAC verification failed');
    });

    it('handles app_subscriptions/update webhook and updates plan', async () => {
      const shop = 'sub-update.myshopify.com';
      sessionStore.set(shop, {
        shop,
        accessToken: 'token_sub',
        scope: 'read_themes',
        plan: 'trial',
        installedAt: new Date().toISOString(),
      });

      const payload = {
        app_subscription: {
          admin_graphql_api_id: 'gid://shopify/AppSubscription/998877',
          name: 'EveryVisitor Growth Plan',
          status: 'ACTIVE',
        },
      };
      const hmac = signWebhook(payload, mockConfig.apiSecret);

      const res = await request(app)
        .post('/api/webhooks/app_subscriptions/update')
        .set('x-shopify-hmac-sha256', hmac)
        .set('x-shopify-shop-domain', shop)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(sessionStore.get(shop)?.plan).toBe('growth');
      expect(sessionStore.get(shop)?.subscriptionId).toBe('gid://shopify/AppSubscription/998877');
    });
  });

  describe('Shopify Billing API', () => {
    const shop = 'bill-store.myshopify.com';
    const tokenFor = (s = shop) =>
      createMockAppBridgeToken({ shop: s, secret: mockConfig.apiSecret, apiKey: mockConfig.apiKey });
    const link = (extra: object = {}) =>
      sessionStore.set(shop, {
        shop,
        accessToken: 'shpat_bill',
        scope: 'read_themes',
        apiKey: 'psk_bill',
        siteId: 'site_bill',
        orgId: 'org_bill',
        installedAt: new Date().toISOString(),
        ...extra,
      });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it('requires an App Bridge token to subscribe', async () => {
      link();
      const res = await request(app).post('/api/billing/subscribe').send({ shop, planId: 'store' });
      expect(res.status).toBe(401);
    });

    it('refuses to start a paid subscription for a store that is not linked yet', async () => {
      sessionStore.set(shop, { shop, accessToken: 'shpat_bill', scope: 'read_themes', installedAt: new Date().toISOString() });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const res = await request(app)
        .post('/api/billing/subscribe')
        .set('Authorization', `Bearer ${tokenFor()}`)
        .send({ planId: 'store' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('not_connected');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('only ever acts on the shop in the verified token, not the body', async () => {
      link();
      sessionStore.set('other.myshopify.com', { shop: 'other.myshopify.com', accessToken: 't', scope: 'read_themes', apiKey: 'psk_o', installedAt: new Date().toISOString() });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { plan: 'trial' } }) }));
      await request(app)
        .post('/api/billing/subscribe')
        .set('Authorization', `Bearer ${tokenFor()}`)
        .send({ shop: 'other.myshopify.com', planId: 'trial' });
      expect(sessionStore.get('other.myshopify.com')?.plan).toBeUndefined();
    });

    it('sets the trial plan without a GraphQL call', async () => {
      link();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { plan: 'trial' } }) }));
      const res = await request(app)
        .post('/api/billing/subscribe')
        .set('Authorization', `Bearer ${tokenFor()}`)
        .send({ planId: 'trial' });
      expect(res.status).toBe(200);
      expect(res.body.plan).toBe('trial');
    });

    it('does not mark a shop whose name contains "dev" as a test charge in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const devShop = 'devon-bakery.myshopify.com';
      sessionStore.set(devShop, { shop: devShop, accessToken: 'shpat_d', scope: 'read_themes', apiKey: 'psk_d', installedAt: new Date().toISOString() });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { appSubscriptionCreate: { confirmationUrl: 'https://x/confirm', userErrors: [] } } }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await request(app)
        .post('/api/billing/subscribe')
        .set('Authorization', `Bearer ${tokenFor(devShop)}`)
        .send({ planId: 'store' });
      const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(sent.variables.test).toBe(false);
    });

    it('stores the plan the backend verified, not the plan named in the confirm URL', async () => {
      link({ plan: 'trial' });
      // The merchant tampers with planId=growth, but Shopify only confirmed the Store plan.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { plan: 'store' } }) }));
      const res = await request(app).get(`/api/billing/confirm?shop=${shop}&planId=growth`);
      expect(res.status).toBe(302);
      expect(sessionStore.get(shop)?.plan).toBe('store');
    });

    it('keeps the old plan when the backend cannot confirm the subscription', async () => {
      link({ plan: 'trial' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
      await request(app).get(`/api/billing/confirm?shop=${shop}&planId=growth`);
      expect(sessionStore.get(shop)?.plan).toBe('trial');
    });
  });

  describe('Persistent Session Storage', () => {
    const tmpStorageFile = path.join(process.cwd(), '.storage', 'test-session-store.json');

    afterEach(() => {
      if (fs.existsSync(tmpStorageFile)) {
        fs.unlinkSync(tmpStorageFile);
      }
    });

    it('persists sessions across store instantiations', () => {
      const store1 = new PersistentShopSessionStore(tmpStorageFile);
      store1.set('persisted.myshopify.com', {
        shop: 'persisted.myshopify.com',
        accessToken: 'token_persisted',
        scope: 'read_themes',
        apiKey: 'psk_shop_123',
        siteId: 'site_shop_456',
        installedAt: new Date().toISOString(),
      });

      // Create new instance pointing to same storage file
      const store2 = new PersistentShopSessionStore(tmpStorageFile);
      expect(store2.has('persisted.myshopify.com')).toBe(true);
      const session = store2.get('persisted.myshopify.com');
      expect(session?.apiKey).toBe('psk_shop_123');
      expect(session?.siteId).toBe('site_shop_456');
    });
  });

  describe('App Bridge Session Token (JWT) Verification', () => {
    const shop = 'jwt-store.myshopify.com';

    beforeEach(() => {
      sessionStore.set(shop, {
        shop,
        accessToken: 'token_jwt',
        scope: 'read_themes',
        installedAt: new Date().toISOString(),
      });
    });

    it('accepts a valid session token but refuses to scan an unlinked store', async () => {
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
      });

      const res = await request(app)
        .post('/api/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('not_connected');
    });

    it('queues a scan with the shop key once the store is linked', async () => {
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
      });
      const session = sessionStore.get(shop)!;
      sessionStore.set(shop, { ...session, apiKey: 'psk_shop_key', siteId: 'site_1' });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { scan: {} } }) });
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app)
        .post('/api/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      vi.unstubAllGlobals();

      expect(res.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${mockConfig.everyvisitorApiUrl}/v1/sites/site_1/scans`);
      expect(init.headers.Authorization).toBe('Bearer psk_shop_key');
    });

    it('rejects tampered session token with 401', async () => {
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
        tamperSig: true,
      });

      const res = await request(app)
        .post('/api/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('rejects expired session token with 401', async () => {
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
        expired: true,
      });

      const res = await request(app)
        .post('/api/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('rejects token with audience mismatch with 401', async () => {
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
        audience: 'different_api_key',
      });

      const res = await request(app)
        .post('/api/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('strictly rejects /api/scan without session token even if shop is in body', async () => {
      const res = await request(app)
        .post('/api/scan')
        .send({ shop });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Missing or invalid');
    });
  });

  describe('Merchant Account Linking', () => {
    it('redirects /api/connect-start to web app connect handshake', async () => {
      const shop = 'connect-store.myshopify.com';
      const res = await request(app).get(`/api/connect-start?shop=${shop}`);
      expect(res.status).toBe(302);
      expect(res.header.location).toContain(`${mockConfig.appUrl}/connect/start`);
      expect(res.header.location).toContain(`platform=shopify`);
      expect(res.header.location).toContain(`url=https%3A%2F%2F${encodeURIComponent(shop)}`);
    });

    it('rejects /api/connect-manual without an App Bridge token', async () => {
      const shop = 'manual-noauth.myshopify.com';
      sessionStore.set(shop, {
        shop,
        accessToken: 'token_manual',
        scope: 'read_themes',
        installedAt: new Date().toISOString(),
      });
      const res = await request(app).post('/api/connect-manual').send({ shop, apiKey: 'psk_attacker' });
      expect(res.status).toBe(401);
      expect(sessionStore.get(shop)?.apiKey).toBeUndefined();
    });

    it('stores site-scoped key via /api/connect-manual for the token shop only', async () => {
      const shop = 'manual-link.myshopify.com';
      const victim = 'victim-store.myshopify.com';
      for (const s of [shop, victim]) {
        sessionStore.set(s, {
          shop: s,
          accessToken: 'token_manual',
          scope: 'read_themes',
          installedAt: new Date().toISOString(),
        });
      }
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
      });

      // The body tries to name another shop; only the verified token shop may be changed.
      const res = await request(app)
        .post('/api/connect-manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ shop: victim, apiKey: 'psk_test_scoped_merchant_key', siteId: 'site_12345' });

      expect(res.status).toBe(200);
      expect(sessionStore.get(shop)?.apiKey).toBe('psk_test_scoped_merchant_key');
      expect(sessionStore.get(shop)?.siteId).toBe('site_12345');
      expect(sessionStore.get(victim)?.apiKey).toBeUndefined();
    });

    describe('/api/connect-callback', () => {
      const shop = 'callback-store.myshopify.com';

      beforeEach(() => {
        sessionStore.set(shop, {
          shop,
          accessToken: 'token_cb',
          scope: 'read_themes',
          installedAt: new Date().toISOString(),
        });
      });
      afterEach(() => vi.unstubAllGlobals());

      it('rejects a callback without the matching state cookie', async () => {
        const res = await request(app).get(`/api/connect-callback?shop=${shop}&code=ev_code_abcdefghij&state=x`);
        expect(res.status).toBe(400);
        expect(sessionStore.get(shop)?.apiKey).toBeUndefined();
      });

      it('redeems the single-use code server-side and stores the shop key', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: { siteId: 'site_abc', orgId: 'org_abc', apiKey: { secret: 'psk_from_exchange' } },
          }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const res = await request(app)
          .get(`/api/connect-callback?shop=${shop}&code=ev_code_abcdefghij&state=s1`)
          .set('Cookie', 'ev_link_state=s1');

        expect(res.status).toBe(302);
        expect(fetchMock.mock.calls[0]![0]).toBe(`${mockConfig.everyvisitorApiUrl}/v1/sites/connect/exchange`);
        expect(sessionStore.get(shop)?.apiKey).toBe('psk_from_exchange');
        expect(sessionStore.get(shop)?.siteId).toBe('site_abc');
      });

      it('does not store a key when the code is rejected', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
        const res = await request(app)
          .get(`/api/connect-callback?shop=${shop}&code=ev_code_expired000&state=s1`)
          .set('Cookie', 'ev_link_state=s1');
        expect(res.status).toBe(502);
        expect(sessionStore.get(shop)?.apiKey).toBeUndefined();
      });
    });
  });

  describe('Embedded Dashboard', () => {
    it('rejects unauthenticated dashboard request without token or hmac with 401', async () => {
      const res = await request(app).get('/?shop=my-store.myshopify.com');
      expect(res.status).toBe(401);
      expect(res.text).toContain('Unauthorized');
    });

    it('renders Polaris embedded dashboard HTML when verified id_token is provided', async () => {
      const shop = 'my-store.myshopify.com';
      const token = createMockAppBridgeToken({
        shop,
        secret: mockConfig.apiSecret,
        apiKey: mockConfig.apiKey,
      });

      const res = await request(app).get(`/?shop=${shop}&id_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/html');
      expect(res.text).toContain('EveryVisitor Accessibility');
      expect(res.text).toContain('WCAG 2.2 Score');
      expect(res.text).toContain('Top Theme Accessibility Issues');
      // Unlinked store: prompts to connect instead of showing fake data.
      expect(res.text).toContain('Connect your EveryVisitor account');
      expect(res.text).not.toContain('Store ownership verified via Shopify');
      expect(res.text).not.toContain('sections/header.liquid');
      expect(res.text).toContain('/css/polaris.css');
      expect(res.text).toContain('/js/app-bridge.js');
    });

    it('shows real score, counts and top issues for a linked store', async () => {
      const shop = 'linked-store.myshopify.com';
      sessionStore.set(shop, {
        shop,
        accessToken: 'tok',
        scope: 'read_themes',
        siteId: 'site_9',
        apiKey: 'psk_linked',
        installedAt: new Date().toISOString(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              site: { id: 'site_9' },
              score: 72,
              severityCounts: { critical: 2, serious: 5 },
              latestScanSummary: { finishedAt: '2026-10-01T10:00:00Z' },
              topIssues: [
                { title: 'Images <b>need</b> alt text', ruleId: 'image-alt', impact: 'critical', templateKey: 'product' },
              ],
            },
          }),
        }),
      );
      const token = createMockAppBridgeToken({ shop, secret: mockConfig.apiSecret, apiKey: mockConfig.apiKey });
      const res = await request(app).get(`/?shop=${shop}&id_token=${token}`);
      vi.unstubAllGlobals();

      expect(res.status).toBe(200);
      expect(res.text).toContain('Store ownership verified via Shopify');
      expect(res.text).toContain('72');
      expect(res.text).toContain('sections/main-product.liquid');
      expect(res.text).toContain('Images &lt;b&gt;need&lt;/b&gt; alt text');
      expect(res.text).not.toContain('Images <b>need</b>');
    });
  });
});
