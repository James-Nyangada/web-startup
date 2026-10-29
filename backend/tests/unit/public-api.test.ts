import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_KEY_PREFIX,
  generateApiKeySecret,
  hashApiKey,
} from '../../src/db/repositories/api-keys.js';
import { buildOpenApiDocument } from '../../src/openapi/document.js';
import { PUBLIC_API_ROUTES, matchPublicApiRoute } from '../../src/routes/public-api.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { storeConnectExchangeCode } from '../../src/lib/connect-codes.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const ORG_ID = '018f0000-0000-7000-8000-0000000000d1';
const SITE_ID = '018f0000-0000-7000-8000-0000000000d2';
const KEY_ID = '018f0000-0000-7000-8000-0000000000d3';

function org(plan = 'agency_pro', billingStatus = 'active') {
  return {
    id: ORG_ID,
    name: 'Acme Agency',
    slug: 'acme',
    type: 'agency',
    plan,
    billingStatus,
    trialEndsAt: null,
    paddleCustomerId: null,
    pastDueSince: null,
    planOverride: null,
    planOverrideExpiresAt: null,
    planOverrideReason: null,
    timeZone: 'UTC',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function key(scopes = ['read'], siteIds: string[] = []) {
  return {
    id: KEY_ID,
    orgId: ORG_ID,
    name: 'CI',
    prefix: 'psk_abcd1234',
    scopes,
    siteIds,
    lastUsedAt: null,
    revokedAt: null,
    createdBy: 'user-owner',
    createdAt: new Date(),
  };
}

const SECRET = `${API_KEY_PREFIX}test-secret-value`;

function setup(options: { scopes?: string[]; siteIds?: string[]; plan?: string; billingStatus?: string } = {}) {
  const built = buildTestApp();
  vi.mocked(built.repos.apiKeys.findActiveBySecret).mockImplementation((secret: string) =>
    Promise.resolve(
      secret === SECRET
        ? ({ key: key(options.scopes, options.siteIds), org: org(options.plan, options.billingStatus) } as never)
        : null,
    ),
  );
  return built;
}

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${SECRET}`);

describe('P6-06: API keys', () => {
  it('generates prefixed secrets and stores only a SHA-256 hash', () => {
    const { secret, prefix, keyHash } = generateApiKeySecret();
    expect(secret.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(40);
    expect(prefix).toBe(secret.slice(0, 12));
    expect(keyHash).toBe(hashApiKey(secret));
    expect(keyHash).not.toContain(secret);
  });

  describe('S-47 management (owners, Agency Pro)', () => {
    function manage(role: 'owner' | 'admin', plan = 'agency_pro') {
      const a = mockAuth('user-owner');
      const built = buildTestApp({ auth: a });
      vi.mocked(built.repos.organizations.findByIdOrSlug).mockResolvedValue(org(plan) as never);
      vi.mocked(built.repos.memberships.find).mockResolvedValue({
        id: 'm1',
        orgId: ORG_ID,
        userId: 'user-owner',
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { ...built, cookie: a.cookie };
    }

    it('creates a key, returns the secret once, adds read to scan:write, and audits', async () => {
      const { app, repos, cookie } = manage('owner');
      vi.mocked(repos.apiKeys.create).mockResolvedValue({
        key: key(['scan:write', 'read']),
        secret: 'psk_once',
      } as never);
      const res = await request(app)
        .post(`/v1/orgs/${ORG_ID}/api-keys`)
        .set('Cookie', cookie)
        .send({ name: 'CI', scopes: ['scan:write'] })
        .expect(201);
      expect(res.body.data.secret).toBe('psk_once');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(repos.apiKeys.create).toHaveBeenCalledWith(ORG_ID, {
        name: 'CI',
        scopes: ['scan:write', 'read'],
        createdBy: 'user-owner',
      });
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ action: 'api_key.created' }),
      );
    });

    it('refuses key creation below Agency Pro', async () => {
      const { app, cookie } = manage('owner', 'agency');
      const res = await request(app)
        .post(`/v1/orgs/${ORG_ID}/api-keys`)
        .set('Cookie', cookie)
        .send({ name: 'CI', scopes: ['read'] })
        .expect(422);
      expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
    });

    it('is owner-only (admins get 403)', async () => {
      const { app, cookie } = manage('admin');
      await request(app).get(`/v1/orgs/${ORG_ID}/api-keys`).set('Cookie', cookie).expect(403);
    });

    it('revokes a key and returns 404 for unknown ids', async () => {
      const { app, repos, cookie } = manage('owner');
      vi.mocked(repos.apiKeys.revoke).mockResolvedValueOnce({
        ...key(),
        revokedAt: new Date(),
      } as never);
      await request(app)
        .delete(`/v1/orgs/${ORG_ID}/api-keys/${KEY_ID}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ action: 'api_key.revoked' }),
      );
      await request(app)
        .delete(`/v1/orgs/${ORG_ID}/api-keys/${KEY_ID}`)
        .set('Cookie', cookie)
        .expect(404);
    });
  });
});

describe('P6-06: public REST API', () => {
  it('rejects an unknown or revoked key with 401', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/v1/sites')
      .set('Authorization', 'Bearer psk_wrong')
      .expect(401);
    expect(res.body.error.code).toBe(ErrorCode.API_KEY_INVALID);
    expect(res.headers['www-authenticate']).toContain('Bearer');
  });

  it('lists sites scoped to the key’s org', async () => {
    const { app, repos } = setup();
    await auth(request(app).get('/v1/sites')).expect(200);
    expect(repos.sites.list).toHaveBeenCalledWith(ORG_ID, expect.any(Object));
    expect(repos.apiKeys.touchLastUsed).toHaveBeenCalledWith(KEY_ID);
  });

  it('returns 404 for a site in another org (repository scoped by org)', async () => {
    const { app, repos } = setup();
    vi.mocked(repos.sites.findById).mockResolvedValue(null);
    const res = await auth(request(app).get(`/v1/sites/${SITE_ID}`)).expect(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(repos.sites.findById).toHaveBeenCalledWith(ORG_ID, SITE_ID);
  });

  it('exposes only the allow-listed operations', async () => {
    const { app } = setup({ scopes: ['read', 'scan:write'] });
    await auth(request(app).patch(`/v1/sites/${SITE_ID}`).send({ name: 'x' })).expect(404);
    await auth(request(app).delete(`/v1/sites/${SITE_ID}`)).expect(404);
    await auth(request(app).get(`/v1/scans/${SITE_ID}/raw`)).expect(404);
    await auth(request(app).get(`/v1/orgs/${ORG_ID}`)).expect(404);
  });

  it('needs the scan:write scope to start a scan', async () => {
    const { app } = setup({ scopes: ['read'] });
    const res = await auth(request(app).post(`/v1/sites/${SITE_ID}/scans`).send({})).expect(403);
    expect(res.body.error.code).toBe(ErrorCode.API_KEY_SCOPE);
  });

  it('starts an API scan recorded against the key, not a user', async () => {
    const { app, repos } = setup({ scopes: ['read', 'scan:write'] });
    vi.mocked(repos.organizations.findById).mockResolvedValue(org() as never);
    vi.mocked(repos.sites.findById).mockResolvedValue({
      id: SITE_ID,
      orgId: ORG_ID,
      status: 'active',
      standard: 'wcag22aa',
      pageLimit: 100,
    } as never);
    vi.mocked(repos.scans.create).mockResolvedValue({ id: 'scan-1', status: 'queued' } as never);

    await auth(
      request(app).post(`/v1/sites/${SITE_ID}/scans`).send({ trigger: 'onboarding' }),
    ).expect(201);

    expect(repos.scans.create).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ trigger: 'api', requestedBy: null }),
    );
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        actorType: 'api_key',
        actorId: null,
        data: expect.objectContaining({ apiKeyId: KEY_ID }),
      }),
    );
  });

  it('connects and auto-verifies a site via POST /v1/sites/connect', async () => {
    const { app, repos } = setup({ scopes: ['read', 'scan:write'] });
    vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(null);
    vi.mocked(repos.sites.count).mockResolvedValue(0);
    vi.mocked(repos.organizations.findById).mockResolvedValue(org() as never);
    vi.mocked(repos.sites.create).mockResolvedValue({
      id: 'site-wp-1',
      orgId: ORG_ID,
      name: 'WP Store',
      rootUrl: 'https://example.com',
      platform: 'wordpress',
      status: 'pending_verification',
    } as never);
    vi.mocked(repos.sites.setVerified).mockResolvedValue({
      id: 'site-wp-1',
      orgId: ORG_ID,
      name: 'WP Store',
      rootUrl: 'https://example.com',
      platform: 'wordpress',
      status: 'active',
      verifyMethod: 'plugin',
      verifiedAt: new Date(),
    } as never);
    vi.mocked(repos.sites.listSummaries).mockResolvedValue(
      new Map([['site-wp-1', { score: 92, openCritical: 0, openSerious: 1 }]]) as never,
    );

    const res = await auth(
      request(app).post('/v1/sites/connect').send({
        url: 'https://example.com',
        name: 'WP Store',
        platform: 'wordpress',
      }),
    ).expect(201);

    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.method).toBe('plugin');
    expect(res.body.data.site.score).toBe(92);
    expect(repos.sites.setVerified).toHaveBeenCalledWith(ORG_ID, 'site-wp-1', 'plugin');
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ action: 'site.verified' }),
    );
    expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ type: 'site_verified' }),
    );
  });

  it('connects a site and issues a site-scoped API key when issueKey is true', async () => {
    const { app, repos } = setup({ scopes: ['read', 'scan:write', 'plugin'] });
    vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(null);
    vi.mocked(repos.sites.count).mockResolvedValue(0);
    vi.mocked(repos.sites.create).mockResolvedValue({
      id: 'site-wp-key',
      orgId: ORG_ID,
      name: 'WP Keyed Store',
      rootUrl: 'https://keyed-example.com',
      platform: 'wordpress',
      status: 'pending_verification',
    } as never);
    vi.mocked(repos.sites.setVerified).mockResolvedValue({
      id: 'site-wp-key',
      orgId: ORG_ID,
      name: 'WP Keyed Store',
      rootUrl: 'https://keyed-example.com',
      platform: 'wordpress',
      status: 'active',
      verifyMethod: 'plugin',
      verifiedAt: new Date(),
    } as never);
    vi.mocked(repos.apiKeys.create).mockResolvedValue({
      key: { id: 'key-wp-scoped', prefix: 'psk_abcd1234' } as never,
      secret: 'psk_abcd1234_secret_token_value',
    });
    vi.mocked(repos.sites.listSummaries).mockResolvedValue(new Map());

    const res = await auth(
      request(app).post('/v1/sites/connect').send({
        url: 'https://keyed-example.com',
        name: 'WP Keyed Store',
        platform: 'wordpress',
        issueKey: true,
      }),
    ).expect(201);

    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.apiKey).toBeDefined();
    expect(res.body.data.apiKey.secret).toBe('psk_abcd1234_secret_token_value');
    expect(res.body.data.apiKey.prefix).toBe('psk_abcd1234');
    expect(repos.apiKeys.create).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        scopes: ['read', 'scan:write', 'plugin'],
      }),
    );
  });

  it('connects existing site and verifies via shopify method', async () => {
    const { app, repos } = setup({ scopes: ['read', 'scan:write', 'plugin'] });
    vi.mocked(repos.sites.findByRootUrl).mockResolvedValue({
      id: 'site-shopify-1',
      orgId: ORG_ID,
      name: 'My Shopify Store',
      rootUrl: 'https://my-store.myshopify.com',
      platform: 'unknown',
      status: 'pending_verification',
    } as never);
    vi.mocked(repos.sites.update).mockResolvedValue({} as never);
    vi.mocked(repos.sites.setVerified).mockResolvedValue({
      id: 'site-shopify-1',
      orgId: ORG_ID,
      name: 'My Shopify Store',
      rootUrl: 'https://my-store.myshopify.com',
      platform: 'shopify',
      status: 'active',
      verifyMethod: 'shopify',
      verifiedAt: new Date(),
    } as never);
    vi.mocked(repos.sites.listSummaries).mockResolvedValue(new Map());

    const res = await auth(
      request(app).post('/v1/sites/connect').send({
        url: 'https://my-store.myshopify.com',
        platform: 'shopify',
      }),
    ).expect(201);

    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.method).toBe('shopify');
    expect(repos.sites.setVerified).toHaveBeenCalledWith(ORG_ID, 'site-shopify-1', 'shopify');
  });

  it('rejects POST /v1/sites/connect with invalid URL format', async () => {
    const { app } = setup({ scopes: ['read', 'scan:write', 'plugin'] });
    const res = await auth(
      request(app).post('/v1/sites/connect').send({
        url: 'not-a-valid-url',
        platform: 'wordpress',
      }),
    ).expect(400);

    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  describe('POST /sites/shopify-plan-sync', () => {
    const SHOP = 'acme-store.myshopify.com';
    const PLUGIN = ['read', 'scan:write', 'plugin'];

    function linked(
      repos: ReturnType<typeof setup>['repos'],
      session: Record<string, unknown> = {},
    ) {
      vi.mocked(repos.shopifySessions.findByShop).mockResolvedValue({
        shop: SHOP,
        accessToken: 'test_token',
        scope: 'read_themes',
        siteId: 'site-shopify-1',
        apiKey: null,
        orgId: ORG_ID,
        plan: 'trial',
        subscriptionId: null,
        installedAt: new Date(),
        updatedAt: new Date(),
        ...session,
      } as never);
      vi.mocked(repos.sites.findById).mockResolvedValue({
        id: 'site-shopify-1',
        orgId: ORG_ID,
        platform: 'shopify',
        rootUrl: `https://${SHOP}`,
      } as never);
      vi.mocked(repos.organizations.update).mockResolvedValue({ id: ORG_ID } as never);
    }

    const sync = (app: ReturnType<typeof setup>['app'], body: object = { shop: SHOP, plan: 'pro' }) =>
      auth(request(app).post('/v1/sites/shopify-plan-sync').send(body));

    afterEach(() => vi.unstubAllGlobals());

    it('takes the plan from Shopify, never from the request body', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos);
      // The caller asks for "pro"; Shopify's confirmed subscription (test token) is the Store plan.
      const res = await sync(app).expect(200);
      expect(res.body.data.plan).toBe('store');
      expect(repos.organizations.update).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ plan: 'store', billingStatus: 'active' }),
      );
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          action: 'org.plan_changed',
          data: expect.objectContaining({ to: 'store', shop: SHOP, source: 'shopify_app' }),
        }),
      );
    });

    it('maps a confirmed Growth subscription to the growth plan', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos, { accessToken: 'shpat_real' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: { appInstallation: { activeSubscriptions: [{ name: 'EveryVisitor Growth', status: 'ACTIVE' }] } },
          }),
        }),
      );
      const res = await sync(app, { shop: SHOP, plan: 'store' }).expect(200);
      expect(res.body.data.plan).toBe('growth');
    });

    it('drops to trial when Shopify reports no active subscription', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos, { accessToken: 'shpat_real' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ data: { appInstallation: { activeSubscriptions: [] } } }),
        }),
      );
      const res = await sync(app).expect(200);
      expect(res.body.data.plan).toBe('trial');
      expect(res.body.data.billingStatus).toBe('trialing');
    });

    it('changes nothing when Shopify cannot confirm the subscription (fails closed)', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos, { accessToken: 'shpat_real' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
      await sync(app).expect(502);
      expect(repos.organizations.update).not.toHaveBeenCalled();
    });

    it('refuses a shop that is linked to a different organisation', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos, { orgId: '018f0000-0000-7000-8000-00000000ffff' });
      await sync(app).expect(403);
      expect(repos.organizations.update).not.toHaveBeenCalled();
    });

    it('refuses a shop that has not completed the account link', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos, { orgId: null });
      await sync(app).expect(403);
      expect(repos.organizations.update).not.toHaveBeenCalled();
    });

    it('refuses an unknown shop', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      vi.mocked(repos.shopifySessions.findByShop).mockResolvedValue(null);
      await sync(app).expect(403);
      expect(repos.organizations.update).not.toHaveBeenCalled();
    });

    it('refuses when the linked site is not a Shopify site in this organisation', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos);
      vi.mocked(repos.sites.findById).mockResolvedValue(null);
      await sync(app).expect(400);
      expect(repos.organizations.update).not.toHaveBeenCalled();
    });

    it('rejects shop values that are not .myshopify.com domains', async () => {
      const { app, repos } = setup({ scopes: PLUGIN });
      linked(repos);
      for (const shop of ['evil.example.com', 'a.myshopify.com.evil.com', 'localhost:3000/x', '']) {
        await sync(app, { shop, plan: 'store' }).expect(400);
      }
    });

    it('rejects an invalid plan or a missing shop', async () => {
      const { app } = setup({ scopes: PLUGIN });
      await sync(app, { shop: SHOP, plan: 'enterprise' }).expect(400);
      await sync(app, { plan: 'store' }).expect(400);
    });

    it('requires the plugin scope', async () => {
      const { app } = setup({ scopes: ['read', 'scan:write'] });
      const res = await sync(app).expect(403);
      expect(res.body.error.code).toBe(ErrorCode.API_KEY_SCOPE);
    });
  });

  describe('site-scoped keys on POST /sites/connect', () => {
    const OWN = '018f0000-0000-7000-8000-0000000000e1';
    const OTHER = '018f0000-0000-7000-8000-0000000000e2';
    const body = { url: 'https://example.com', platform: 'wordpress' };

    it('cannot verify a different site in the organisation', async () => {
      const { app, repos } = setup({ scopes: ['read', 'scan:write', 'plugin'], siteIds: [OWN] });
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue({ id: OTHER, name: 'Other' } as never);
      const res = await auth(request(app).post('/v1/sites/connect').send(body)).expect(403);
      expect(res.body.error.code).toBe(ErrorCode.API_KEY_SCOPE);
      expect(repos.sites.setVerified).not.toHaveBeenCalled();
    });

    it('cannot create new sites', async () => {
      const { app, repos } = setup({ scopes: ['read', 'scan:write', 'plugin'], siteIds: [OWN] });
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(null);
      await auth(request(app).post('/v1/sites/connect').send(body)).expect(403);
      expect(repos.sites.create).not.toHaveBeenCalled();
    });

    it('cannot mint further API keys', async () => {
      const { app, repos } = setup({ scopes: ['read', 'scan:write', 'plugin'], siteIds: [OWN] });
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue({ id: OWN, name: 'Own' } as never);
      await auth(request(app).post('/v1/sites/connect').send({ ...body, issueKey: true })).expect(403);
      expect(repos.apiKeys.create).not.toHaveBeenCalled();
    });

    it('can re-connect its own site', async () => {
      const { app, repos } = setup({ scopes: ['read', 'scan:write', 'plugin'], siteIds: [OWN] });
      const own = { id: OWN, orgId: ORG_ID, name: 'Own', rootUrl: 'https://example.com', platform: 'wordpress' };
      vi.mocked(repos.sites.findByRootUrl).mockResolvedValue(own as never);
      vi.mocked(repos.sites.setVerified).mockResolvedValue({ ...own, status: 'active' } as never);
      vi.mocked(repos.sites.listSummaries).mockResolvedValue(new Map() as never);
      await auth(request(app).post('/v1/sites/connect').send(body)).expect(201);
      expect(repos.sites.setVerified).toHaveBeenCalledWith(ORG_ID, OWN, 'plugin');
    });
  });

  it('exchanges connect code via POST /v1/sites/connect/exchange and rejects expired or reused code', async () => {
    const { app } = setup();
    const code = storeConnectExchangeCode({
      siteId: 'site-handshake-1',
      orgId: ORG_ID,
      apiKey: {
        id: 'key-123',
        secret: 'psk_new_site_key',
        prefix: 'psk_new_',
      },
    });

    const res = await request(app)
      .post('/v1/sites/connect/exchange')
      .send({ code })
      .expect(200);

    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.siteId).toBe('site-handshake-1');
    expect(res.body.data.apiKey.secret).toBe('psk_new_site_key');

    // Reusing the single-use code fails with 400
    await request(app)
      .post('/v1/sites/connect/exchange')
      .send({ code })
      .expect(400);
  });

  it('enforces site isolation for keys with siteIds', async () => {
    const ALLOWED_SITE = '018f0000-0000-7000-8000-0000000000e1';
    const FORBIDDEN_SITE = '018f0000-0000-7000-8000-0000000000e2';
    const { app, repos } = setup({
      scopes: ['read', 'scan:write', 'plugin'],
      siteIds: [ALLOWED_SITE],
    });

    vi.mocked(repos.sites.listSummaries).mockResolvedValue(new Map());
    vi.mocked(repos.sites.list).mockResolvedValue([
      { id: ALLOWED_SITE, name: 'Allowed Site', rootUrl: 'https://allowed.com' } as any,
      { id: FORBIDDEN_SITE, name: 'Forbidden Site', rootUrl: 'https://forbidden.com' } as any,
    ]);

    // GET /sites returns only the allowed site
    const listRes = await auth(request(app).get('/v1/sites')).expect(200);
    expect(listRes.body.data.sites).toHaveLength(1);
    expect(listRes.body.data.sites[0].id).toBe(ALLOWED_SITE);

    // Accessing allowed site succeeds
    vi.mocked(repos.sites.findById).mockResolvedValue({
      id: ALLOWED_SITE,
      name: 'Allowed Site',
      rootUrl: 'https://allowed.com',
      lastScanId: null,
    } as any);
    await auth(request(app).get(`/v1/sites/${ALLOWED_SITE}`)).expect(200);

    // Accessing forbidden site directly returns 404
    await auth(request(app).get(`/v1/sites/${FORBIDDEN_SITE}`)).expect(404);

    // Triggering scan on forbidden site returns 404
    await auth(request(app).post(`/v1/sites/${FORBIDDEN_SITE}/scans`).send({})).expect(404);

    // Accessing scans for forbidden site returns 404
    vi.mocked(repos.scans.findById).mockResolvedValue({
      id: 'scan-forbidden',
      siteId: FORBIDDEN_SITE,
    } as any);
    await auth(request(app).get('/v1/scans/scan-forbidden')).expect(404);
  });

  it('stops working when the org drops below Agency Pro for standard developer keys', async () => {
    for (const plan of ['trial', 'store', 'growth', 'agency'] as const) {
      const { app } = setup({ plan, scopes: ['read', 'scan:write'] });
      const res = await auth(request(app).get('/v1/sites')).expect(403);
      expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
    }
  });

  it('allows plugin integration keys across all plans (trial, store, growth, agency, agency_pro)', async () => {
    for (const plan of ['trial', 'store', 'growth', 'agency', 'agency_pro'] as const) {
      const { app, repos } = setup({ plan, scopes: ['read', 'scan:write', 'plugin'] });
      vi.mocked(repos.sites.listSummaries).mockResolvedValue(new Map());
      vi.mocked(repos.sites.list).mockResolvedValue([]);
      await auth(request(app).get('/v1/sites')).expect(200);
    }
  });

  it('blocks writes for read-only orgs but still allows reads', async () => {
    const { app } = setup({ scopes: ['read', 'scan:write'], billingStatus: 'read_only' });
    await auth(request(app).get('/v1/sites')).expect(200);
    const res = await auth(request(app).post(`/v1/sites/${SITE_ID}/scans`).send({})).expect(402);
    expect(res.body.error.code).toBe(ErrorCode.BILLING_REQUIRED);
  });

  it('rate limits each key to 60 requests a minute', async () => {
    const { app } = setup();
    for (let i = 0; i < 60; i++) {
      await auth(request(app).get('/v1/sites')).expect(200);
    }
    const res = await auth(request(app).get('/v1/sites')).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('leaves cookie-authenticated routes alone', async () => {
    const { app } = setup();
    // Without a bearer key, /v1/sites/detect-platform is the session route (401 unauthenticated).
    const res = await request(app).post('/v1/sites/detect-platform').send({ url: 'https://x.com' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('matches routes exactly', () => {
    expect(matchPublicApiRoute('GET', '/sites')?.path).toBe('/sites');
    expect(matchPublicApiRoute('GET', `/sites/${SITE_ID}/issues`)?.path).toBe(
      '/sites/{siteId}/issues',
    );
    expect(matchPublicApiRoute('POST', `/sites/${SITE_ID}/scans`)?.scope).toBe('scan:write');
    expect(matchPublicApiRoute('GET', `/sites/${SITE_ID}/pages`)).toBeNull();
  });
});

describe('P6-06: OpenAPI document', () => {
  const doc = buildOpenApiDocument('https://api.example.com');

  it('is OpenAPI 3.1 with bearer security and Zod-generated schemas', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers[0]!.url).toBe('https://api.example.com/v1');
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['Site', 'Issue', 'Scan', 'Error', 'CreateScan']),
    );
  });

  it('documents every public route with a summary and response examples', () => {
    for (const route of PUBLIC_API_ROUTES) {
      const op = doc.paths[route.path]?.[route.method.toLowerCase()] as {
        summary?: string;
        responses: Record<string, { content?: Record<string, { example?: unknown }> }>;
      };
      expect(op, `${route.method} ${route.path}`).toBeDefined();
      expect(op.summary).toBeTruthy();
      const success = op.responses[route.method === 'POST' ? '201' : '200'];
      expect(success?.content?.['application/json']?.example).toBeDefined();
      expect(op.responses['401']).toBeDefined();
      expect(op.responses['429']).toBeDefined();
    }
  });

  it('is served at /v1/openapi.json', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/v1/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(JSON.stringify(res.body)).not.toContain('#/$defs/');
  });
});
