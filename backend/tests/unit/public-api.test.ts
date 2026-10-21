import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  API_KEY_PREFIX,
  generateApiKeySecret,
  hashApiKey,
} from '../../src/db/repositories/api-keys.js';
import { buildOpenApiDocument } from '../../src/openapi/document.js';
import { PUBLIC_API_ROUTES, matchPublicApiRoute } from '../../src/routes/public-api.js';
import { ErrorCode } from '../../src/shared/errors.js';
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

function key(scopes = ['read']) {
  return {
    id: KEY_ID,
    orgId: ORG_ID,
    name: 'CI',
    prefix: 'psk_abcd1234',
    scopes,
    lastUsedAt: null,
    revokedAt: null,
    createdBy: 'user-owner',
    createdAt: new Date(),
  };
}

const SECRET = `${API_KEY_PREFIX}test-secret-value`;

function setup(options: { scopes?: string[]; plan?: string; billingStatus?: string } = {}) {
  const built = buildTestApp();
  vi.mocked(built.repos.apiKeys.findActiveBySecret).mockImplementation((secret: string) =>
    Promise.resolve(
      secret === SECRET
        ? ({ key: key(options.scopes), org: org(options.plan, options.billingStatus) } as never)
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

  it('stops working when the org drops below Agency Pro', async () => {
    const { app } = setup({ plan: 'agency' });
    const res = await auth(request(app).get('/v1/sites')).expect(403);
    expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
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
