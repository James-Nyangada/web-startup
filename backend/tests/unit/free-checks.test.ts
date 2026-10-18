import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';
import { ErrorCode } from '../../src/shared/errors.js';

describe('Free Checker Backend API (Chunk P3-03, Screen S-03, Sections 7.10 & 11.4)', () => {
  const sampleResult = {
    score: 64,
    scoreBand: 'Poor' as const,
    counts: {
      critical: 2,
      serious: 2,
      moderate: 1,
      minor: 1,
    },
    topIssues: [
      {
        ruleId: 'image-alt',
        title: 'Images are missing descriptions',
        impact: 'critical' as const,
        wcagCriteria: ['1.1.1'],
        occurrences: 4,
        whoIsAffected: 'People who use screen readers cannot tell what products look like.',
        selector: 'img.product-image',
        htmlSnippet: '<img src="/product.jpg" />',
      },
    ],
    pageTitle: 'Sora Skin — Natural Beauty',
    checkedAt: new Date().toISOString(),
    loadMs: 450,
  };

  it('rejects invalid or unparseable URLs with 400 validation error', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'not-a-valid-domain-%%%$$$' })
      .expect(400);

    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('rejects SSRF internal IP addresses (localhost, private subnets, AWS metadata)', async () => {
    const { app } = buildTestApp();

    const targets = [
      'http://127.0.0.1',
      'http://localhost',
      'http://169.254.169.254',
      'http://10.0.0.5',
      'http://192.168.1.1',
    ];

    for (const url of targets) {
      const res = await request(app)
        .post('/public/free-checks')
        .send({ url })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(res.body.error.message).toContain('Blocked address');
    }
  });

  it('rejects when turnstile bot check fails', async () => {
    const { app } = buildTestApp({
      turnstile: () => Promise.resolve(false),
    });

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'https://example.com', turnstileToken: 'bad-token' })
      .expect(400);

    expect(res.body.error.code).toBe(ErrorCode.BOT_CHECK_FAILED);
  });

  it('enforces IP rate limit: max 3 checks per hour', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.countRecentByIpHash).mockResolvedValueOnce(3);

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'https://example.com' })
      .expect(429);

    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.body.error.message).toContain('Max 3 checks per hour');
  });

  it('enforces IP rate limit: max 10 checks per day', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.countRecentByIpHash)
      .mockResolvedValueOnce(1) // hour check passes
      .mockResolvedValueOnce(10); // day check hits limit

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'https://example.com' })
      .expect(429);

    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.body.error.message).toContain('Max 10 checks per day');
  });

  it('enforces domain rate limit: max 5 checks per day', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.countRecentByDomain).mockResolvedValueOnce(5);

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'https://example.com' })
      .expect(429);

    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.body.error.message).toContain('Max 5 checks per day');
  });

  it('enforces global daily cap limit', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.countGlobalToday).mockResolvedValueOnce(500);

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'https://example.com' })
      .expect(429);

    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.body.error.message).toContain('daily global capacity');
  });

  it('successfully creates free check and returns 201 with checkId', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.create).mockResolvedValueOnce({
      id: 'fc-test-456',
      url: 'https://soraskin.co/',
      domain: 'soraskin.co',
      ipHash: 'hash-ip',
      status: 'pending',
      email: null,
      result: null,
      reportKey: null,
      marketingConsent: false,
      convertedOrgId: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/public/free-checks')
      .send({ url: 'soraskin.co' })
      .expect(201);

    expect(res.body.data.checkId).toBe('fc-test-456');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.url).toBe('https://soraskin.co/');
  });

  it('gets free check status and results at GET /public/free-checks/:checkId', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.findById).mockResolvedValueOnce({
      id: 'fc-test-456',
      url: 'https://soraskin.co',
      domain: 'soraskin.co',
      ipHash: 'hash-ip',
      status: 'completed',
      email: null,
      result: sampleResult,
      reportKey: 'free-checks/fc-test-456/report.pdf',
      marketingConsent: false,
      convertedOrgId: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .get('/public/free-checks/fc-test-456')
      .expect(200);

    expect(res.body.data.id).toBe('fc-test-456');
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.result.score).toBe(64);
    expect(res.body.data.result.scoreBand).toBe('Poor');
    expect(res.body.data.result.topIssues).toHaveLength(1);
    expect(res.body.data.result.topIssues[0].ruleId).toBe('image-alt');
  });

  it('returns 404 for unknown checkId', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.findById).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/public/free-checks/unknown-id')
      .expect(404);

    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('attaches email and sends report via POST /public/free-checks/:checkId/email', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.findById).mockResolvedValueOnce({
      id: 'fc-test-456',
      url: 'https://soraskin.co',
      domain: 'soraskin.co',
      ipHash: 'hash-ip',
      status: 'completed',
      email: null,
      result: sampleResult,
      reportKey: 'free-checks/fc-test-456/report.pdf',
      marketingConsent: false,
      convertedOrgId: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(repos.freeChecks.attachEmail).mockResolvedValueOnce({
      id: 'fc-test-456',
      url: 'https://soraskin.co',
      domain: 'soraskin.co',
      ipHash: 'hash-ip',
      status: 'completed',
      email: 'grace@soraskin.co',
      result: sampleResult,
      reportKey: null,
      marketingConsent: true,
      convertedOrgId: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/public/free-checks/fc-test-456/email')
      .send({
        email: 'grace@soraskin.co',
        marketingConsent: true,
      })
      .expect(200);

    expect(res.body.data.success).toBe(true);
    expect(repos.freeChecks.attachEmail).toHaveBeenCalledWith(
      'fc-test-456',
      'grace@soraskin.co',
      true,
    );
  });

  it('works via /v1/public/free-checks prefix as well', async () => {
    const { app, repos } = buildTestApp();

    vi.mocked(repos.freeChecks.findById).mockResolvedValueOnce({
      id: 'fc-v1-test',
      url: 'https://soraskin.co',
      domain: 'soraskin.co',
      ipHash: 'hash-ip',
      status: 'completed',
      email: null,
      result: sampleResult,
      reportKey: null,
      marketingConsent: false,
      convertedOrgId: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .get('/v1/public/free-checks/fc-v1-test')
      .expect(200);

    expect(res.body.data.id).toBe('fc-v1-test');
  });
});
