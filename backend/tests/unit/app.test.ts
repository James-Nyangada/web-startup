import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../helpers/fakes.js';

describe('health', () => {
  it('GET /health returns ok', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/deep reports the database', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health/deep').expect(200);
    expect(res.body.checks.database.status).toBe('ok');
  });

  it('GET /health/deep returns 503 when the database is down', async () => {
    const { app } = buildTestApp({ healthy: false });
    const res = await request(app).get('/health/deep').expect(503);
    expect(res.body.status).toBe('error');
    expect(res.body.checks.database.message).toBe('connection refused');
  });
});

describe('request IDs and headers', () => {
  it('generates an X-Request-Id', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a safe incoming X-Request-Id and rejects unsafe ones', async () => {
    const { app } = buildTestApp();
    const ok = await request(app).get('/health').set('X-Request-Id', 'abc-123');
    expect(ok.headers['x-request-id']).toBe('abc-123');
    const bad = await request(app).get('/health').set('X-Request-Id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  it('sets security headers and hides X-Powered-By', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only for known origins', async () => {
    const { app } = buildTestApp();
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error format', () => {
  it('unknown routes return 404 in the standard shape', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/v1/nope').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /v1/nope.', details: {} },
    });
  });

  it('malformed JSON returns 400 INVALID_JSON', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/v1/public/waitlist')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /v1/public/waitlist', () => {
  it('joins with a normalised email', async () => {
    const { app, join } = buildTestApp();
    const res = await request(app)
      .post('/v1/public/waitlist')
      .send({ email: '  Ada@Example.COM ', consent: true, source: 'home' })
      .expect(201);
    expect(res.body).toEqual({ data: { status: 'joined' } });
    expect(join).toHaveBeenCalledWith({ email: 'ada@example.com', consent: true, source: 'home' });
  });

  it('rejects invalid input with field-level messages', async () => {
    const { app, join } = buildTestApp();
    const res = await request(app)
      .post('/v1/public/waitlist')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty('email');
    expect(res.body.error.details.fields).toHaveProperty('consent');
    expect(join).not.toHaveBeenCalled();
  });

  it('rejects a failed bot check', async () => {
    const { app, join } = buildTestApp({ turnstile: () => Promise.resolve(false) });
    const res = await request(app)
      .post('/v1/public/waitlist')
      .send({ email: 'ada@example.com', consent: true, turnstileToken: 'bad' })
      .expect(400);
    expect(res.body.error.code).toBe('BOT_CHECK_FAILED');
    expect(join).not.toHaveBeenCalled();
  });

  it('hides unexpected errors behind a 500', async () => {
    const { app, join } = buildTestApp();
    join.mockRejectedValueOnce(new Error('secret internals'));
    const res = await request(app)
      .post('/v1/public/waitlist')
      .send({ email: 'ada@example.com', consent: false })
      .expect(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.',
      details: {},
    });
  });
});

describe('GET /health/deep queue lag (spec 13.3)', () => {
  it('warns when a ready job has waited more than 15 minutes, still 200', async () => {
    const { createApp } = await import('../../src/app.js');
    const { fakeRepos, testConfig } = await import('../helpers/fakes.js');
    const pool = {
      query: vi
        .fn()
        .mockImplementation((sql: string) =>
          Promise.resolve({ rows: sql.includes('job') ? [{ lag: 1200 }] : [{ '?column?': 1 }] }),
        ),
    };
    const app = createApp({
      config: testConfig,
      pool: pool as never,
      repos: fakeRepos().repos,
      verifyTurnstile: () => Promise.resolve(true),
    });
    const res = await request(app).get('/health/deep').expect(200);
    expect(res.body.status).toBe('warn');
    expect(res.body.checks.queue).toEqual({ status: 'warn', oldestReadySeconds: 1200 });
  });
});
