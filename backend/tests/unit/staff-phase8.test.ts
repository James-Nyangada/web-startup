import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { encrypt } from '../../src/lib/encryption.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import {
  aggregatePoints,
  buildCohortMatrix,
  buildFunnelSteps,
  changePct,
  previousPeriod,
  subscriptionMrrChangeCents,
} from '../../src/shared/metrics.js';
import { computeHealth } from '../../src/shared/health.js';
import {
  REBUILD_DEBOUNCE_MS,
  pollDeployStatus,
  requestSiteRebuild,
  runQueuedRebuild,
} from '../../src/lib/site-rebuild.js';
import { fetchTrafficReport, umamiConfig } from '../../src/lib/umami.js';
import {
  handleContentPublishScheduled,
  handleMetricsComputeDaily,
  handleOrgsHealth,
  handleUmamiSync,
} from '../../src/worker/jobs/phase8.js';
import { backfillMetrics } from '../../src/db/scripts/backfill-metrics.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const SECRET = generateTotpSecret();
const STAFF_UUID = '018f0000-0000-7000-8000-0000000000b1';
const ORG_ID = '018f0000-0000-7000-8000-0000000000a1';

function staffState(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-staff-1',
    userId: 'staff-1',
    email: 'staff-1@example.com',
    isStaff: true,
    totpSecretEncrypted: encrypt(SECRET),
    totpEnabledAt: new Date(),
    staffVerifiedAt: new Date(),
    impersonatingOrgId: null,
    staffMemberId: STAFF_UUID,
    ...overrides,
  };
}

function setup(role: string) {
  const auth = mockAuth('staff-1');
  const built = buildTestApp({ auth });
  vi.mocked(built.repos.staff.getSessionState).mockResolvedValue(staffState({ role }));
  return { ...built, cookie: auth.cookie };
}

describe('metric roll-ups', () => {
  const daily = [
    { date: '2026-10-05', value: 10 },
    { date: '2026-10-06', value: 20 },
    { date: '2026-10-13', value: 5 },
    { date: '2026-11-01', value: 7 },
  ];

  it('sums flow metrics per ISO week (Monday start) and per month', () => {
    expect(aggregatePoints(daily, 'week', 'scans_total')).toEqual([
      { date: '2026-10-05', value: 30 },
      { date: '2026-10-12', value: 5 },
      { date: '2026-10-26', value: 7 },
    ]);
    expect(aggregatePoints(daily, 'month', 'scans_total')).toEqual([
      { date: '2026-10-01', value: 35 },
      { date: '2026-11-01', value: 7 },
    ]);
  });

  it('keeps the last value of gauge metrics such as MRR', () => {
    expect(aggregatePoints(daily, 'month', 'mrr')).toEqual([
      { date: '2026-10-01', value: 5 },
      { date: '2026-11-01', value: 7 },
    ]);
  });

  it('computes the previous period of equal length and the change %', () => {
    expect(previousPeriod('2026-10-08', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(changePct(110, 100)).toBe(10);
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(5, null)).toBeNull();
  });
});

describe('funnel and cohorts', () => {
  it('computes step conversion and leaves out visitors when Umami is not connected', () => {
    const steps = buildFunnelSteps({ visitors: 1000, freeChecks: 200, signups: 50, activated: 25, paid: 5 });
    expect(steps.map((s) => s.conversionPct)).toEqual([100, 20, 25, 50, 20]);
    expect(steps[1]!.dropOffPct).toBe(80);
    const noVisitors = buildFunnelSteps({ visitors: null, freeChecks: 10, signups: 5, activated: 0, paid: 0 });
    expect(noVisitors[0]!.name).toBe('Free checks');
    expect(noVisitors[0]!.conversionPct).toBe(100);
    expect(noVisitors[3]!.conversionPct).toBe(0);
  });

  it('builds a retention matrix from subscription start and end dates', () => {
    const now = new Date('2026-10-15T00:00:00Z');
    const matrix = buildCohortMatrix(
      [
        { startedAt: new Date('2026-08-10T00:00:00Z'), endedAt: null },
        { startedAt: new Date('2026-08-20T00:00:00Z'), endedAt: new Date('2026-09-20T00:00:00Z') },
        { startedAt: new Date('2026-10-01T00:00:00Z'), endedAt: null },
      ],
      now,
    );
    expect(matrix).toEqual([
      { cohort: '2026-08', size: 2, retention: [100, 100, 50] },
      { cohort: '2026-10', size: 1, retention: [100] },
    ]);
  });
});

describe('customer health score', () => {
  it('is 100 and good for an engaged, paid-up customer', () => {
    const h = computeHealth({
      daysSinceSignIn: 1,
      scansLast14d: 6,
      openCriticalIssues: 0,
      openCriticalIssues14dAgo: 0,
      reportsLast30d: 2,
      billingStatus: 'active',
    });
    expect(h).toEqual({ score: 100, band: 'good', reasons: [] });
  });

  it('flags an inactive past-due customer as poor with reasons', () => {
    const h = computeHealth({
      daysSinceSignIn: 40,
      scansLast14d: 0,
      openCriticalIssues: 3,
      openCriticalIssues14dAgo: 1,
      reportsLast30d: 0,
      billingStatus: 'past_due',
    });
    expect(h.band).toBe('poor');
    expect(h.score).toBe(0);
    expect(h.reasons).toEqual(
      expect.arrayContaining(['No sign-in for 40 days', 'No scans in the last 14 days', 'Payment is past due']),
    );
    expect(h.reasons.some((r) => r.includes('(rising)'))).toBe(true);
  });
});

describe('site rebuild pipeline', () => {
  const mkStaff = (over: Record<string, unknown> = {}) => ({
    createSiteDeploy: vi.fn().mockResolvedValue({ id: 'd1' }),
    updateSiteDeploy: vi.fn().mockResolvedValue(null),
    listSiteDeploys: vi.fn().mockResolvedValue([]),
    getLatestDeploy: vi.fn().mockResolvedValue(null),
    listDeploysByStatus: vi.fn().mockResolvedValue([]),
    ...over,
  });

  it('batches publishes while a rebuild is already queued', async () => {
    const staff = mkStaff({ listDeploysByStatus: vi.fn().mockResolvedValue([{ id: 'q' }]) });
    const out = await requestSiteRebuild(staff, 'publish', null);
    expect(out).toEqual({ queued: true, batched: true });
    expect(staff.createSiteDeploy).not.toHaveBeenCalled();
  });

  it('delays the worker job until the 2-minute window since the last build has passed', async () => {
    const now = new Date('2026-10-29T10:00:00Z');
    const staff = mkStaff({
      getLatestDeploy: vi.fn().mockResolvedValue({ id: 'old', startedAt: new Date(now.getTime() - 30_000) }),
    });
    const boss = { send: vi.fn().mockResolvedValue('job') };
    await requestSiteRebuild(staff, 'publish', 'u1', boss as never, now);
    expect(boss.send).toHaveBeenCalledWith('site.rebuild', {}, expect.objectContaining({ startAfter: 90 }));
    expect(REBUILD_DEBOUNCE_MS).toBe(120_000);
  });

  it('calls the deploy hook, stores the Cloudflare deployment id and marks the deploy building', async () => {
    const staff = mkStaff({ listDeploysByStatus: vi.fn().mockResolvedValue([{ id: 'd1' }]) });
    const f = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ result: { id: 'cf-123' } }) });
    const started = await runQueuedRebuild(staff, { hookUrl: 'https://hook.example/x' }, f as never);
    expect(started).toBe(true);
    expect(f).toHaveBeenCalledWith('https://hook.example/x', expect.objectContaining({ method: 'POST' }));
    expect(staff.updateSiteDeploy).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ status: 'building', cfDeploymentId: 'cf-123' }),
    );
  });

  it('marks the deploy failed when the hook errors', async () => {
    const staff = mkStaff({ listDeploysByStatus: vi.fn().mockResolvedValue([{ id: 'd1' }]) });
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await runQueuedRebuild(staff, { hookUrl: 'https://hook.example/x' }, f as never);
    expect(staff.updateSiteDeploy).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ status: 'failed', error: 'Deploy hook responded 500' }),
    );
  });

  it('does not start a second build inside the debounce window', async () => {
    const now = new Date('2026-10-29T10:00:00Z');
    const staff = mkStaff({
      listDeploysByStatus: vi.fn().mockResolvedValue([{ id: 'd2' }]),
      listSiteDeploys: vi
        .fn()
        .mockResolvedValue([{ id: 'd1', status: 'building', startedAt: new Date(now.getTime() - 20_000) }]),
    });
    const f = vi.fn();
    expect(await runQueuedRebuild(staff as never, { hookUrl: 'https://h' }, f as never, now)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('polls Cloudflare and marks success live and failure failed', async () => {
    const env = { apiToken: 't', accountId: 'a', project: 'p' };
    const staff = mkStaff({
      listDeploysByStatus: vi.fn().mockResolvedValue([
        { id: 'ok', cfDeploymentId: 'c1', startedAt: new Date() },
        { id: 'bad', cfDeploymentId: 'c2', startedAt: new Date() },
        { id: 'busy', cfDeploymentId: 'c3', startedAt: new Date() },
      ]),
    });
    const stages: Record<string, unknown> = {
      c1: { name: 'deploy', status: 'success' },
      c2: { name: 'build', status: 'failure' },
      c3: { name: 'build', status: 'active' },
    };
    const f = vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ result: { latest_stage: stages[url.split('/').pop()!] } }),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const still = await pollDeployStatus(staff, env, f as never);
    expect(still).toBe(1);
    expect(staff.updateSiteDeploy).toHaveBeenCalledWith('ok', expect.objectContaining({ status: 'live' }));
    expect(staff.updateSiteDeploy).toHaveBeenCalledWith(
      'bad',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('build') }),
    );
  });
});

describe('Umami client', () => {
  it('is unconfigured unless URL, token and website id are all set', () => {
    expect(umamiConfig({ UMAMI_API_URL: 'https://u' })).toBeNull();
    expect(
      umamiConfig({ UMAMI_API_URL: 'https://u/', UMAMI_API_TOKEN: 't', UMAMI_WEBSITE_ID: 'w' }),
    ).toEqual({ baseUrl: 'https://u', token: 't', websiteId: 'w' });
  });

  it('maps stats, daily series and breakdowns', async () => {
    const f = vi.fn((url: URL, _init?: RequestInit) => {
      const path = url.pathname;
      const type = url.searchParams.get('type');
      let body: unknown;
      if (path.endsWith('/stats')) {
        body = { pageviews: { value: 100 }, visitors: { value: 40 }, visits: 50, bounces: 20, totaltime: 900 };
      } else if (path.endsWith('/pageviews')) {
        body = {
          pageviews: [{ x: '2026-10-28 00:00:00', y: 60 }],
          sessions: [{ x: '2026-10-28 00:00:00', y: 25 }],
        };
      } else {
        body = [{ x: type === 'referrer' ? '' : `${type}-a`, y: 7 }];
      }
      return { ok: true, json: () => Promise.resolve(body) };
    });
    const report = await fetchTrafficReport('2026-10-22', '2026-10-28', { baseUrl: 'https://u', token: 't', websiteId: 'w' }, f as never);
    expect(report.totals).toMatchObject({ visitors: 40, pageViews: 100, visits: 50, bounces: 20 });
    expect(report.daily).toEqual([{ date: '2026-10-28', visitors: 25, pageViews: 60 }]);
    expect(report.referrers).toEqual([{ name: 'direct', visitors: 7 }]);
    expect(report.pages[0]).toEqual({ path: 'path-a', visitors: 7 });
    expect(f.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: 'Bearer t' } });
  });

  it('rejects when Umami answers with an error', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(
      fetchTrafficReport('2026-10-22', '2026-10-28', { baseUrl: 'https://u', token: 't', websiteId: 'w' }, f as never),
    ).rejects.toThrow('401');
  });
});

describe('worker jobs', () => {
  it('content.publish-scheduled publishes due posts and queues one rebuild', async () => {
    const { repos } = buildTestApp();
    const due = new Date('2026-10-29T09:00:00Z');
    vi.mocked(repos.staff.listDueScheduledPosts).mockResolvedValue([
      { id: 'p1', publishAt: due },
      { id: 'p2', publishAt: due },
    ] as never);
    vi.mocked(repos.staff.createSiteDeploy).mockResolvedValue({ id: 'd1' } as never);
    const n = await handleContentPublishScheduled({ repos } as never);
    expect(n).toBe(2);
    expect(repos.staff.publishContentPost).toHaveBeenCalledWith('p1', due);
    expect(repos.staff.createSiteDeploy).toHaveBeenCalledTimes(1);
    expect(repos.staff.createSiteDeploy).toHaveBeenCalledWith('schedule', null);
  });

  it('content.publish-scheduled does nothing when no posts are due', async () => {
    const { repos } = buildTestApp();
    expect(await handleContentPublishScheduled({ repos } as never)).toBe(0);
    expect(repos.staff.createSiteDeploy).not.toHaveBeenCalled();
  });

  it('metrics.compute-daily defaults to yesterday and can backfill', async () => {
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.computeMetricsForDate).mockResolvedValue(10);
    const total = await handleMetricsComputeDaily({ date: '2026-10-28', backfillDays: 2 }, { repos } as never);
    expect(vi.mocked(repos.staff.computeMetricsForDate).mock.calls.map((c) => c[0])).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(total).toBe(30);
  });

  it('orgs.health writes each computed score', async () => {
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.computeAllOrgHealth).mockImplementation(async (write) => {
      await write('org-1' as never, 80, 'good', []);
      return 1;
    });
    expect(await handleOrgsHealth({ repos } as never)).toBe(1);
    expect(repos.staff.setOrgHealth).toHaveBeenCalledWith('org-1', 80, 'good', []);
  });

  it('analytics.umami-sync does nothing when Umami is not configured', async () => {
    const { repos } = buildTestApp();
    const f = vi.fn();
    expect(await handleUmamiSync({ repos } as never, f as never)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('backfill walks oldest to newest, ending today', async () => {
    const repo = { computeMetricsForDate: vi.fn().mockResolvedValue(5) };
    const total = await backfillMetrics(repo, 2, '2026-10-29', () => undefined);
    expect(repo.computeMetricsForDate.mock.calls.map((c) => c[0] as string)).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
    expect(total).toBe(15);
  });
});

describe('analytics API', () => {
  it('serves a real time series, aggregated by the requested granularity', async () => {
    const { app, cookie, repos } = setup('analyst');
    vi.mocked(repos.staff.queryMetrics).mockResolvedValue([
      { date: '2026-10-05', metric: 'scans_total', dimension: null, value: 4 },
      { date: '2026-10-06', metric: 'scans_total', dimension: null, value: 6 },
    ] as never);
    const res = await request(app)
      .get('/v1/staff/metrics?metric=scans_total&from=2026-10-05&to=2026-10-11&granularity=week&compare=true')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body.data.points).toEqual([{ date: '2026-10-05', value: 10 }]);
    expect(res.body.data.comparison).toBeDefined();
    expect(repos.staff.queryMetrics).toHaveBeenCalledWith('scans_total', '2026-09-28', '2026-10-04', null);
  });

  it('rejects unknown metrics', async () => {
    const { app, cookie } = setup('owner');
    await request(app).get('/v1/staff/metrics?metric=not_real').set('Cookie', cookie).expect(400);
  });

  it('keeps revenue metrics from roles without revenue access, and the whole API from editors', async () => {
    const editor = setup('editor');
    await request(editor.app).get('/v1/staff/metrics?metric=mrr').set('Cookie', editor.cookie).expect(403);
    await request(editor.app).get('/v1/staff/metrics?metric=scans_total').set('Cookie', editor.cookie).expect(403);
    await request(editor.app).get('/v1/staff/analytics/funnel').set('Cookie', editor.cookie).expect(403);
    const support = setup('support');
    await request(support.app).get('/v1/staff/analytics/cohorts').set('Cookie', support.cookie).expect(403);
  });

  it('exports CSV only for permitted metrics', async () => {
    const analyst = setup('analyst');
    vi.mocked(analyst.repos.staff.queryMetrics).mockResolvedValue([
      { date: '2026-10-05', metric: 'mrr', dimension: null, value: 1000 },
    ] as never);
    const res = await request(analyst.app)
      .get('/v1/staff/metrics/export.csv?metric=mrr&from=2026-10-01&to=2026-10-31')
      .set('Cookie', analyst.cookie)
      .expect(200);
    expect(res.text).toContain('2026-10-05');
  });

  it('reports traffic as not connected instead of inventing numbers', async () => {
    const { app, cookie } = setup('owner');
    const res = await request(app).get('/v1/staff/analytics/traffic').set('Cookie', cookie).expect(200);
    expect(res.body.data).toEqual({ configured: false });
  });

  it('computes today on the first dashboard load when no snapshot exists yet', async () => {
    const { app, cookie, repos } = setup('owner');
    vi.mocked(repos.staff.hasMetricsForDate).mockResolvedValue(false);
    const res = await request(app).get('/v1/staff/dashboard').set('Cookie', cookie).expect(200);
    expect(repos.staff.computeMetricsForDate).toHaveBeenCalledTimes(1);
    expect(res.body.data).toMatchObject({ statCards: {}, needsAttention: [], recentActivity: [], trafficConnected: false });
  });

  it('serves real funnel steps from the repository', async () => {
    const { app, cookie, repos } = setup('analyst');
    vi.mocked(repos.staff.funnel).mockResolvedValue({
      steps: [{ name: 'Sign-ups', count: 3, conversionPct: 100, dropOffPct: 0 }],
      bySource: [],
    });
    const res = await request(app).get('/v1/staff/analytics/funnel?from=2026-10-01&to=2026-10-29').set('Cookie', cookie).expect(200);
    expect(res.body.data.steps[0].count).toBe(3);
    expect(repos.staff.funnel).toHaveBeenCalledWith('2026-10-01', '2026-10-29');
  });
});

describe('emailing a customer from admin', () => {
  it('refuses an address that is not a member of the organisation', async () => {
    const { app, cookie, repos } = setup('support');
    vi.mocked(repos.memberships.list).mockResolvedValue([{ userId: 'u1', role: 'owner' }] as never);
    vi.mocked(repos.users.findById).mockResolvedValue({ id: 'u1', email: 'owner@client.test' } as never);
    await request(app)
      .post(`/v1/staff/orgs/${ORG_ID}/email`)
      .set('Cookie', cookie)
      .send({ toEmail: 'someone@else.test', template: 'custom', subject: 'Hi', bodyMd: 'Hello' })
      .expect(400);
    expect(repos.staff.logStaffEmail).not.toHaveBeenCalled();
  });

  it('escapes HTML in the body before sending', async () => {
    const auth = mockAuth('staff-1');
    const sendRaw = vi.fn().mockResolvedValue(undefined);
    const built = buildTestApp({ auth, emailSender: { sendRaw } as never });
    vi.mocked(built.repos.staff.getSessionState).mockResolvedValue(staffState({ role: 'support' }));
    vi.mocked(built.repos.memberships.list).mockResolvedValue([{ userId: 'u1', role: 'owner' }] as never);
    vi.mocked(built.repos.users.findById).mockResolvedValue({ id: 'u1', email: 'Owner@Client.test' } as never);
    await request(built.app)
      .post(`/v1/staff/orgs/${ORG_ID}/email`)
      .set('Cookie', auth.cookie)
      .send({ toEmail: 'owner@client.test', template: 'custom', subject: 'Hi', bodyMd: '<script>alert(1)</script>' })
      .expect(201);
    expect(sendRaw).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>' }),
    );
  });
});

describe('expansion and contraction MRR', () => {
  const sub = (plan: string, interval = 'month', status = 'active') => ({ plan, interval, status });

  it('is positive for an upgrade and negative for a downgrade', () => {
    const up = subscriptionMrrChangeCents(sub('store'), sub('growth'));
    const down = subscriptionMrrChangeCents(sub('growth'), sub('store'));
    expect(up).toBeGreaterThan(0);
    expect(down).toBe(-up!);
  });

  it('counts a switch from monthly to annual billing as a change in MRR', () => {
    const change = subscriptionMrrChangeCents(sub('growth', 'month'), sub('growth', 'year'));
    expect(change).not.toBeNull();
  });

  it('ignores unchanged, new, cancelled and reactivated subscriptions', () => {
    expect(subscriptionMrrChangeCents(sub('growth'), sub('growth'))).toBeNull();
    expect(subscriptionMrrChangeCents(null, sub('growth'))).toBeNull();
    expect(subscriptionMrrChangeCents(sub('growth'), sub('store', 'month', 'canceled'))).toBeNull();
    expect(subscriptionMrrChangeCents(sub('growth', 'month', 'canceled'), sub('store'))).toBeNull();
  });
});
