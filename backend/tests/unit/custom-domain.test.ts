import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  checkCustomDomainDns,
  customDomainProblem,
  normalizeDomain,
  type DnsResolver,
} from '../../src/lib/custom-domain.js';
import { customDomainTrustedOrigins } from '../../src/routes/internal.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp, fakeRepos, mockAuth } from '../helpers/fakes.js';

const ORG_ID = '018f0000-0000-7000-8000-0000000000e1';
const TARGET = 'portal.plainsight.test';
const TOKEN = 'plainsight-verify=abc123';

function resolver(records: {
  cname?: string[];
  txt?: string[][];
  a?: Record<string, string[]>;
}): DnsResolver {
  return {
    resolveCname: vi
      .fn()
      .mockImplementation(() =>
        records.cname ? Promise.resolve(records.cname) : Promise.reject(new Error('ENODATA')),
      ),
    resolveTxt: vi
      .fn()
      .mockImplementation(() =>
        records.txt ? Promise.resolve(records.txt) : Promise.reject(new Error('ENOTFOUND')),
      ),
    resolve4: vi
      .fn()
      .mockImplementation((host: string) => Promise.resolve(records.a?.[host] ?? [])),
  };
}

describe('P6-07: custom domain validation', () => {
  it('normalises pasted values', () => {
    expect(normalizeDomain(' https://Reports.Agency.com/path ')).toBe('reports.agency.com');
    expect(normalizeDomain('reports.agency.com.')).toBe('reports.agency.com');
    expect(normalizeDomain('reports.agency.com:443')).toBe('reports.agency.com');
  });

  it('requires a subdomain and refuses IPs and our own domains', () => {
    const own = ['app.plainsight.test'];
    expect(customDomainProblem('agency.com', own)).toMatch(/subdomain/);
    expect(customDomainProblem('10.0.0.1', own)).toMatch(/IP/);
    expect(customDomainProblem('evil.plainsight.test', own)).toMatch(/belongs to us/);
    expect(customDomainProblem('bad_label.agency.com', own)).toMatch(/not a valid/);
    expect(customDomainProblem('reports.agency.com', own)).toBeNull();
  });
});

describe('P6-07: DNS check', () => {
  it('passes with a CNAME to the target and the matching TXT token', async () => {
    const check = await checkCustomDomainDns(
      'reports.agency.com',
      TOKEN,
      TARGET,
      resolver({ cname: [`${TARGET}.`], txt: [[TOKEN]] }),
    );
    expect(check).toMatchObject({ cname: true, txt: true, verified: true });
  });

  it('accepts a flattened CNAME that resolves to exactly the target addresses', async () => {
    const check = await checkCustomDomainDns(
      'reports.agency.com',
      TOKEN,
      TARGET,
      resolver({
        txt: [['plainsight-verify=', 'abc123']],
        a: { 'reports.agency.com': ['203.0.113.7'], [TARGET]: ['203.0.113.7'] },
      }),
    );
    expect(check.verified).toBe(true);
  });

  it('fails without the TXT record or with a wrong CNAME', async () => {
    expect(
      (await checkCustomDomainDns('r.agency.com', TOKEN, TARGET, resolver({ cname: [TARGET] })))
        .verified,
    ).toBe(false);
    expect(
      (
        await checkCustomDomainDns(
          'r.agency.com',
          TOKEN,
          TARGET,
          resolver({ cname: ['elsewhere.example.com'], txt: [[TOKEN]] }),
        )
      ).cname,
    ).toBe(false);
  });
});

function orgRow(plan: string) {
  return {
    id: ORG_ID,
    name: 'Brightline',
    slug: 'brightline',
    type: 'agency',
    plan,
    billingStatus: 'active',
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

function setupOwner(plan = 'agency_pro', role: 'owner' | 'admin' = 'owner') {
  const auth = mockAuth('user-owner');
  const built = buildTestApp({ auth });
  vi.mocked(built.repos.organizations.findByIdOrSlug).mockResolvedValue(orgRow(plan) as never);
  vi.mocked(built.repos.memberships.find).mockResolvedValue({
    id: 'm1',
    orgId: ORG_ID,
    userId: 'user-owner',
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { ...built, cookie: auth.cookie };
}

describe('P6-07: custom domain endpoints', () => {
  it('sets a domain and returns the CNAME and TXT records to add', async () => {
    const { app, repos, cookie } = setupOwner();
    const res = await request(app)
      .post(`/v1/orgs/${ORG_ID}/branding/custom-domain`)
      .set('Cookie', cookie)
      .send({ domain: 'Reports.Brightline.studio' })
      .expect(201);
    expect(res.body.data.records.txt.host).toBe('_plainsight-verify.reports.brightline.studio');
    expect(res.body.data.records.txt.value).toMatch(/^plainsight-verify=[0-9a-f]{32}$/);
    expect(res.body.data.records.cname.host).toBe('reports.brightline.studio');
    expect(repos.branding.upsert).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        customDomain: 'reports.brightline.studio',
        customDomainVerifiedAt: null,
      }),
    );
  });

  it('is Agency Pro only', async () => {
    const { app, cookie } = setupOwner('agency');
    const res = await request(app)
      .post(`/v1/orgs/${ORG_ID}/branding/custom-domain`)
      .set('Cookie', cookie)
      .send({ domain: 'reports.brightline.studio' })
      .expect(422);
    expect(res.body.error.code).toBe(ErrorCode.PLAN_LIMIT);
  });

  it('is owner only', async () => {
    const { app, cookie } = setupOwner('agency_pro', 'admin');
    await request(app)
      .post(`/v1/orgs/${ORG_ID}/branding/custom-domain`)
      .set('Cookie', cookie)
      .send({ domain: 'reports.brightline.studio' })
      .expect(403);
  });

  it('refuses a domain another org holds', async () => {
    const { app, repos, cookie } = setupOwner();
    vi.mocked(repos.branding.findByCustomDomain).mockResolvedValue({ orgId: 'other-org' } as never);
    await request(app)
      .post(`/v1/orgs/${ORG_ID}/branding/custom-domain`)
      .set('Cookie', cookie)
      .send({ domain: 'reports.brightline.studio' })
      .expect(409);
  });

  it('reports which DNS record is missing when verification fails', async () => {
    const { app, repos, cookie } = setupOwner();
    vi.mocked(repos.branding.findByOrgId).mockResolvedValue({
      orgId: ORG_ID,
      customDomain: 'reports.nowhere-dns-test.invalid',
      customDomainVerifyToken: TOKEN,
      customDomainVerifiedAt: null,
    } as never);
    const res = await request(app)
      .post(`/v1/orgs/${ORG_ID}/branding/custom-domain/verify`)
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.error.code).toBe(ErrorCode.DOMAIN_NOT_VERIFIED);
    expect(res.body.error.details).toMatchObject({ cname: false, txt: false });
    expect(repos.branding.upsert).not.toHaveBeenCalled();
  });
});

describe('P6-07: Caddy on-demand TLS ask endpoint', () => {
  it('allows certificates only for verified domains', async () => {
    const { app, repos } = buildTestApp();
    vi.mocked(repos.branding.findVerifiedDomain).mockImplementation((d: string) =>
      Promise.resolve(
        d === 'reports.brightline.studio' ? ({ org: { id: ORG_ID } } as never) : null,
      ),
    );
    await request(app).get('/internal/tls-allowed?domain=reports.brightline.studio').expect(200);
    await request(app).get('/internal/tls-allowed?domain=REPORTS.brightline.studio.').expect(200);
    await request(app).get('/internal/tls-allowed?domain=unverified.agency.com').expect(404);
    await request(app).get('/internal/tls-allowed').expect(404);
  });

  it('serves portal branding for verified domains only', async () => {
    const { app, repos } = buildTestApp();
    vi.mocked(repos.branding.findVerifiedDomain).mockResolvedValueOnce({
      org: { id: ORG_ID, slug: 'brightline', name: 'Brightline' },
      branding: {
        displayName: 'Brightline',
        primaryColor: '#0F3D3E',
        hideProductBrand: true,
        logoLightKey: 'k',
        logoDarkKey: null,
      },
    } as never);
    const res = await request(app)
      .get('/v1/public/portal-domains/reports.brightline.studio')
      .expect(200);
    expect(res.body.data.org.slug).toBe('brightline');
    expect(res.body.data.branding.logoLightUrl).toContain('/branding/logo/light');
    await request(app).get('/v1/public/portal-domains/other.agency.com').expect(404);
  });

  it('trusts sign-in from a verified custom domain origin only', async () => {
    const { repos } = fakeRepos();
    vi.mocked(repos.branding.findVerifiedDomain).mockImplementation((d: string) =>
      Promise.resolve(d === 'reports.brightline.studio' ? ({} as never) : null),
    );
    const trusted = customDomainTrustedOrigins(repos, ['https://app.plainsight.test']);
    const req = (origin: string) => new Request('https://api.test', { headers: { origin } });
    expect(await trusted(req('https://reports.brightline.studio'))).toContain(
      'https://reports.brightline.studio',
    );
    expect(await trusted(req('https://evil.example.com'))).toEqual(['https://app.plainsight.test']);
  });
});
