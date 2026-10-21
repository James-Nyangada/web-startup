import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { buildTestApp, fakePool, fakeRepos, mockAuth, testConfig } from '../helpers/fakes.js';

describe('P6-10: CSRF origin check', () => {
  it('refuses a cookie-authenticated write from a foreign origin', async () => {
    const auth = mockAuth('user-1');
    const { app, repos } = buildTestApp({ auth });
    const res = await request(app)
      .post('/v1/orgs')
      .set('Cookie', auth.cookie)
      .set('Origin', 'https://evil.example.com')
      .send({ name: 'Hijacked' })
      .expect(403);
    expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    expect(repos.organizations.createWithInitialOwner).not.toHaveBeenCalled();
  });

  it('allows writes from the app origin and requests without an Origin', async () => {
    const auth = mockAuth('user-1');
    const { app } = buildTestApp({ auth });
    const fromApp = await request(app)
      .post('/v1/orgs')
      .set('Cookie', auth.cookie)
      .set('Origin', testConfig.APP_URL)
      .send({});
    expect(fromApp.status).toBe(400); // reached validation, not blocked
    const noOrigin = await request(app).post('/v1/orgs').set('Cookie', auth.cookie).send({});
    expect(noOrigin.status).toBe(400);
  });

  it('allows writes from a verified custom portal domain', async () => {
    const auth = mockAuth('user-1');
    const { app, repos } = buildTestApp({ auth });
    vi.mocked(repos.branding.findVerifiedDomain).mockResolvedValue({} as never);
    const res = await request(app)
      .post('/v1/orgs')
      .set('Cookie', auth.cookie)
      .set('Origin', 'https://reports.brightline.studio')
      .send({});
    expect(res.status).toBe(400);
  });

  it('ignores safe methods and cookieless requests', async () => {
    const { app } = buildTestApp();
    await request(app).get('/health').set('Origin', 'https://evil.example.com').expect(200);
    const res = await request(app)
      .post('/v1/public/waitlist')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'a@example.com', consent: true });
    expect(res.status).not.toBe(403);
  });
});

describe('P6-12: maintenance mode', () => {
  const app = createApp({
    config: { ...testConfig, MAINTENANCE_MODE: true },
    pool: fakePool(),
    repos: fakeRepos().repos,
    verifyTurnstile: () => Promise.resolve(true),
    storage: new MemoryStorageService(),
  });

  it('answers 503 with Retry-After for API requests', async () => {
    const res = await request(app).get('/v1/me').expect(503);
    expect(res.body.error.code).toBe(ErrorCode.MAINTENANCE);
    expect(res.headers['retry-after']).toBe('600');
  });

  it('keeps health checks and the TLS ask endpoint up', async () => {
    await request(app).get('/health').expect(200);
    await request(app).get('/internal/tls-allowed?domain=x.y.z').expect(404);
  });
});

describe('P6-10: security headers', () => {
  it('sends HSTS, nosniff, referrer policy and a restrictive CSP on API responses', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['permissions-policy']).toBeDefined();
  });
});

describe('P6-10: general per-user rate limit', () => {
  it('returns 429 after 300 requests in a minute', async () => {
    const auth = mockAuth('user-burst');
    const { app } = buildTestApp({ auth });
    for (let i = 0; i < 300; i++) {
      const res = await request(app).get('/v1/me').set('Cookie', auth.cookie);
      expect(res.status).not.toBe(429);
    }
    const res = await request(app).get('/v1/me').set('Cookie', auth.cookie).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  }, 60_000);
});

describe('P6-10 / F-4: E-23 security notice', () => {
  it('renders the password-changed notice without unsubscribe wording', async () => {
    const { renderEmail, getSampleTemplateData } = await import('../../src/emails/renderer.js');
    const out = renderEmail('E-23', getSampleTemplateData('E-23') as never);
    expect(out.subject).toBe('Your Plainsight password was changed');
    expect(out.text).toContain('If this was not you');
  });

  it('emails the user after a successful password change', async () => {
    const { EmailSender, MockTransport } = await import('../../src/emails/sender.js');
    const transport = new MockTransport();
    const auth = mockAuth('user-pw');
    (auth.api as unknown as Record<string, unknown>).changePassword = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const app = createApp({
      config: testConfig,
      pool: fakePool(),
      repos: fakeRepos().repos,
      verifyTurnstile: () => Promise.resolve(true),
      auth,
      storage: new MemoryStorageService(),
      emailSender: new EmailSender({ transport }),
    });
    await request(app)
      .post('/v1/me/change-password')
      .set('Cookie', auth.cookie)
      .send({ currentPassword: 'old-password-1', newPassword: 'Correct-Horse-Battery-9' })
      .expect(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(transport.sent[0]).toMatchObject({
      to: 'user-pw@example.com',
      subject: 'Your Plainsight password was changed',
    });
  });
});
