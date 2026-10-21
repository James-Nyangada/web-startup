import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { decrypt, encrypt } from '../../src/lib/encryption.js';
import { generateTotpSecret, totpCode } from '../../src/lib/totp.js';
import { isStaffVerified, monthlyRevenueCents } from '../../src/db/repositories/staff.js';
import { csvField } from '../../src/lib/csv.js';
import { ErrorCode } from '../../src/shared/errors.js';
import type { QueueAdmin } from '../../src/staff/queue-admin.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const ORG_ID = '018f0000-0000-7000-8000-0000000000a1';
const SECRET = generateTotpSecret();

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
    ...overrides,
  };
}

function setup(state: Record<string, unknown> | null = staffState(), queueAdmin?: QueueAdmin) {
  const auth = mockAuth('staff-1');
  const built = buildTestApp({ auth, queueAdmin });
  vi.mocked(built.repos.staff.getSessionState).mockResolvedValue(state as never);
  return { ...built, cookie: auth.cookie };
}

describe('P6-01: staff access', () => {
  it('hides the staff area from non-staff users (404)', async () => {
    const { app, cookie } = setup(staffState({ isStaff: false }));
    const res = await request(app).get('/v1/staff/session').set('Cookie', cookie).expect(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('requires sign-in', async () => {
    const { app } = setup();
    await request(app).get('/v1/staff/session').expect(401);
  });

  it('requires TOTP enrolment before any admin endpoint', async () => {
    const { app, cookie } = setup(staffState({ totpEnabledAt: null, staffVerifiedAt: null }));
    const res = await request(app).get('/v1/staff/orgs').set('Cookie', cookie).expect(403);
    expect(res.body.error.code).toBe(ErrorCode.STAFF_TOTP_ENROLMENT_REQUIRED);
  });

  it('requires a TOTP check for this session', async () => {
    const { app, cookie } = setup(staffState({ staffVerifiedAt: null }));
    const res = await request(app).get('/v1/staff/orgs').set('Cookie', cookie).expect(403);
    expect(res.body.error.code).toBe(ErrorCode.STAFF_TOTP_REQUIRED);
  });

  it('expires a TOTP check after 12 hours', () => {
    const old = staffState({ staffVerifiedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) });
    expect(isStaffVerified(old as never)).toBe(false);
    expect(isStaffVerified(staffState() as never)).toBe(true);
  });

  it('enrols: returns the secret once and stores it encrypted', async () => {
    const { app, cookie, repos } = setup(
      staffState({ totpEnabledAt: null, totpSecretEncrypted: null, staffVerifiedAt: null }),
    );
    const res = await request(app).post('/v1/staff/totp/enroll').set('Cookie', cookie).expect(201);
    expect(res.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const [, stored] = vi.mocked(repos.staff.setTotpSecret).mock.calls[0]!;
    expect(stored).not.toContain(res.body.data.secret);
    expect(decrypt(stored)).toBe(res.body.data.secret);
  });

  it('confirms enrolment with a valid code and unlocks the session', async () => {
    const { app, cookie, repos } = setup(
      staffState({ totpEnabledAt: null, staffVerifiedAt: null }),
    );
    await request(app)
      .post('/v1/staff/totp/confirm')
      .set('Cookie', cookie)
      .send({ code: totpCode(SECRET) })
      .expect(200);
    expect(repos.staff.enableTotp).toHaveBeenCalledWith('staff-1');
    expect(repos.staff.markSessionVerified).toHaveBeenCalledWith('session-staff-1');
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'staff.totp_enrolled', actorType: 'staff' }),
    );
  });

  it('rejects a wrong code and rate limits repeated attempts', async () => {
    const state = staffState({ sessionId: 'session-ratelimit', staffVerifiedAt: null });
    const { app, cookie, repos } = setup(state);
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/v1/staff/totp/verify')
        .set('Cookie', cookie)
        .send({ code: '000000' });
      expect(res.status).toBe(400);
    }
    const blocked = await request(app)
      .post('/v1/staff/totp/verify')
      .set('Cookie', cookie)
      .send({ code: totpCode(SECRET) });
    expect(blocked.status).toBe(429);
    expect(repos.staff.markSessionVerified).not.toHaveBeenCalled();
  });

  it('verifies a session with the current code and audits the sign-in', async () => {
    const { app, cookie, repos } = setup(staffState({ staffVerifiedAt: null }));
    await request(app)
      .post('/v1/staff/totp/verify')
      .set('Cookie', cookie)
      .send({ code: totpCode(SECRET) })
      .expect(200);
    expect(repos.staff.markSessionVerified).toHaveBeenCalled();
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'staff.signed_in' }),
    );
  });
});

describe('P6-02: organisation admin', () => {
  it('lists orgs with filters and a cursor', async () => {
    const { app, cookie, repos } = setup();
    vi.mocked(repos.staff.listOrgs).mockResolvedValue({ items: [], nextOffset: 50 });
    const res = await request(app)
      .get('/v1/staff/orgs?q=acme&plan=agency&status=active&limit=50')
      .set('Cookie', cookie)
      .expect(200);
    expect(repos.staff.listOrgs).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'acme', plan: 'agency', billingStatus: 'active', offset: 0 }),
    );
    expect(res.body.nextCursor).toBe('50');
  });

  it('returns 404 for a malformed org id', async () => {
    const { app, cookie } = setup();
    await request(app).get('/v1/staff/orgs/not-a-uuid').set('Cookie', cookie).expect(404);
  });

  it('extends a trial from its current end date and audits it on the org', async () => {
    const { app, cookie, repos } = setup();
    const trialEndsAt = new Date(Date.now() + 2 * 86_400_000);
    vi.mocked(repos.organizations.findById).mockResolvedValue({ id: ORG_ID, trialEndsAt } as never);
    vi.mocked(repos.staff.extendTrial).mockResolvedValue({ id: ORG_ID } as never);
    await request(app)
      .post(`/v1/staff/orgs/${ORG_ID}/extend-trial`)
      .set('Cookie', cookie)
      .send({ days: 7, reason: 'Design partner' })
      .expect(200);
    const [, newEnd] = vi.mocked(repos.staff.extendTrial).mock.calls[0]!;
    expect(newEnd.getTime() - trialEndsAt.getTime()).toBe(7 * 86_400_000);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ action: 'staff.trial_extended', actorType: 'staff' }),
    );
  });

  it('requires an expiry within a year for plan overrides', async () => {
    const { app, cookie } = setup();
    await request(app)
      .put(`/v1/staff/orgs/${ORG_ID}/plan-override`)
      .set('Cookie', cookie)
      .send({
        plan: 'agency_pro',
        expiresAt: new Date(Date.now() + 400 * 86_400_000),
        reason: 'x y z',
      })
      .expect(400);
  });

  it('sets a plan override and audits the billed plan alongside it', async () => {
    const { app, cookie, repos } = setup();
    vi.mocked(repos.staff.setPlanOverride).mockResolvedValue({
      id: ORG_ID,
      plan: 'agency',
    } as never);
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await request(app)
      .put(`/v1/staff/orgs/${ORG_ID}/plan-override`)
      .set('Cookie', cookie)
      .send({ plan: 'agency_pro', expiresAt, reason: 'Pilot of the public API' })
      .expect(200);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        action: 'staff.plan_override_set',
        data: expect.objectContaining({ plan: 'agency_pro', billedPlan: 'agency' }),
      }),
    );
  });

  it('starts read-only impersonation with a reason and audits it', async () => {
    const { app, cookie, repos } = setup();
    vi.mocked(repos.organizations.findById).mockResolvedValue({
      id: ORG_ID,
      slug: 'acme',
      name: 'Acme',
    } as never);
    const res = await request(app)
      .post(`/v1/staff/orgs/${ORG_ID}/impersonate`)
      .set('Cookie', cookie)
      .send({ reason: 'Support ticket 42' })
      .expect(200);
    expect(res.body.data.readOnly).toBe(true);
    expect(repos.staff.setImpersonation).toHaveBeenCalledWith('session-staff-1', ORG_ID);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ action: 'staff.impersonation_started' }),
    );
  });

  it('requires a reason to impersonate', async () => {
    const { app, cookie } = setup();
    await request(app)
      .post(`/v1/staff/orgs/${ORG_ID}/impersonate`)
      .set('Cookie', cookie)
      .send({})
      .expect(400);
  });

  it('stops impersonation and audits it on the org', async () => {
    const { app, cookie, repos } = setup(staffState({ impersonatingOrgId: ORG_ID }));
    await request(app).post('/v1/staff/impersonation/stop').set('Cookie', cookie).expect(200);
    expect(repos.staff.setImpersonation).toHaveBeenCalledWith('session-staff-1', null);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ action: 'staff.impersonation_stopped' }),
    );
  });
});

describe('P6-03: queue monitor', () => {
  const fakeAdmin = (): QueueAdmin => ({
    listQueues: vi.fn().mockResolvedValue([
      {
        name: 'scan.run',
        queuedCount: 2,
        readyCount: 2,
        deferredCount: 0,
        activeCount: 1,
        failedCount: 3,
        totalCount: 6,
      },
    ]),
    listJobs: vi.fn().mockResolvedValue([]),
    retryJob: vi.fn().mockResolvedValue(undefined),
    deleteJob: vi.fn().mockResolvedValue(undefined),
  });

  it('returns 503 when no queue is connected', async () => {
    const { app, cookie } = setup();
    await request(app).get('/v1/staff/queues').set('Cookie', cookie).expect(503);
  });

  it('lists queue depths', async () => {
    const admin = fakeAdmin();
    const { app, cookie } = setup(staffState(), admin);
    const res = await request(app).get('/v1/staff/queues').set('Cookie', cookie).expect(200);
    expect(res.body.data.queues[0]).toMatchObject({ name: 'scan.run', failedCount: 3 });
  });

  it('retries and deletes dead jobs on known queues only, with an audit entry', async () => {
    const admin = fakeAdmin();
    const { app, cookie, repos } = setup(staffState(), admin);
    const jobId = '018f0000-0000-7000-8000-0000000000b1';
    await request(app)
      .post(`/v1/staff/queues/scan.run/jobs/${jobId}/retry`)
      .set('Cookie', cookie)
      .expect(200);
    expect(admin.retryJob).toHaveBeenCalledWith('scan.run', jobId);
    await request(app)
      .delete(`/v1/staff/queues/scan.run/jobs/${jobId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(admin.deleteJob).toHaveBeenCalledWith('scan.run', jobId);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'staff.job_retried' }),
    );
    await request(app)
      .post(`/v1/staff/queues/not.a.queue/jobs/${jobId}/retry`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('reports metrics and server health', async () => {
    const { app, cookie } = setup();
    const res = await request(app).get('/v1/staff/system?days=7').set('Cookie', cookie).expect(200);
    expect(res.body.data.system.memory.totalBytes).toBeGreaterThan(0);
    expect(res.body.data.metrics.scans).toHaveProperty('failureRate');
  });
});

describe('P6-04: leads', () => {
  it('exports only consented leads as CSV, with formula injection neutralised', async () => {
    const { app, cookie, repos } = setup();
    vi.mocked(repos.staff.listConsentedLeads).mockResolvedValue([
      {
        email: 'ok@example.com',
        source: 'free_check',
        domain: 'shop.com',
        converted: true,
        createdAt: new Date('2026-10-01'),
      },
      {
        email: '=HYPERLINK("x")@evil.com',
        source: 'waitlist',
        domain: '',
        converted: false,
        createdAt: new Date('2026-10-02'),
      },
    ]);
    const res = await request(app)
      .get('/v1/staff/leads/export.csv')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('ok@example.com,free_check,shop.com,yes');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")@evil.com"`);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'staff.leads_exported', data: { count: 2 } }),
    );
  });

  it('csvField prefixes formula characters', () => {
    expect(csvField('+1 555')).toBe("'+1 555");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField('plain')).toBe('plain');
  });

  it('passes the consent filter to the free-check list', async () => {
    const { app, cookie, repos } = setup();
    await request(app)
      .get('/v1/staff/leads/free-checks?consent=true')
      .set('Cookie', cookie)
      .expect(200);
    expect(repos.staff.listFreeCheckLeads).toHaveBeenCalledWith(
      expect.objectContaining({ consentOnly: true }),
    );
  });
});

describe('P6-05: content review and feature flags', () => {
  const suggestion = {
    id: '018f0000-0000-7000-8000-0000000000c1',
    ruleId: 'image-alt',
    platform: 'shopify',
    suggestionMd: 'Add alt text',
    flagged: true,
  };

  it('approves a flagged suggestion', async () => {
    const { app, cookie, repos } = setup();
    vi.mocked(repos.staff.findSuggestion).mockResolvedValue(suggestion as never);
    await request(app)
      .post(`/v1/staff/ai-suggestions/${suggestion.id}/approve`)
      .set('Cookie', cookie)
      .expect(200);
    expect(repos.staff.approveSuggestion).toHaveBeenCalledWith(suggestion.id);
  });

  it('promotes a suggestion to an unpublished guide draft, refusing duplicates', async () => {
    const { app, cookie, repos } = setup();
    vi.mocked(repos.staff.findSuggestion).mockResolvedValue(suggestion as never);
    vi.mocked(repos.staff.promoteSuggestionToDraft).mockResolvedValueOnce({ id: 'g1' } as never);
    await request(app)
      .post(`/v1/staff/ai-suggestions/${suggestion.id}/promote`)
      .set('Cookie', cookie)
      .expect(201);
    vi.mocked(repos.staff.promoteSuggestionToDraft).mockResolvedValueOnce(null);
    await request(app)
      .post(`/v1/staff/ai-suggestions/${suggestion.id}/promote`)
      .set('Cookie', cookie)
      .expect(409);
  });

  it('upserts a feature flag with an org allow-list and audits before/after', async () => {
    const { app, cookie, repos } = setup();
    await request(app)
      .put('/v1/staff/feature-flags/ai_suggestions')
      .set('Cookie', cookie)
      .send({ enabled: true, orgIds: [ORG_ID] })
      .expect(200);
    expect(repos.featureFlags.upsert).toHaveBeenCalledWith('ai_suggestions', {
      enabled: true,
      orgIds: [ORG_ID],
    });
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'staff.feature_flag_updated' }),
    );
  });

  it('rejects invalid flag keys', async () => {
    const { app, cookie } = setup();
    await request(app)
      .put('/v1/staff/feature-flags/Bad%20Key')
      .set('Cookie', cookie)
      .send({ enabled: true })
      .expect(400);
  });
});

describe('MRR', () => {
  it('counts active and past-due subscriptions, annual divided by 12', () => {
    expect(monthlyRevenueCents({ plan: 'agency', interval: 'month', status: 'active' })).toBe(
      19900,
    );
    expect(monthlyRevenueCents({ plan: 'agency', interval: 'year', status: 'active' })).toBe(16583);
    expect(monthlyRevenueCents({ plan: 'agency', interval: 'month', status: 'canceled' })).toBe(0);
  });
});
