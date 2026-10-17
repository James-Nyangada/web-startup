import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GuardPolicy } from '../../../src/scanner/net/guard.js';
import { runPages } from '../../../src/scanner/runner/page-runner.js';
import { silentLogger } from '../../../src/scanner/types.js';
import { html, startFixtureServer, type FixtureServer } from '../../helpers/fixture-server.js';

/** Real Chromium against local servers. `forbidden` stands in for an internal service. */
describe('runPages (P1-08, browser)', () => {
  let site: FixtureServer;
  let forbidden: FixtureServer;
  let policy: GuardPolicy;
  let base: string;

  beforeAll(async () => {
    forbidden = await startFixtureServer({
      '/secret': html('<h1>internal</h1>'),
      '/pixel.png': { body: '' },
    });
    const internal = `http://127.0.0.1:${forbidden.port}`;
    site = await startFixtureServer({
      '/': html('<h1>Home</h1><img src="/logo.png">'),
      '/logo.png': { headers: { 'content-type': 'image/png' }, body: '' },
      '/old': { status: 301, headers: { location: '/landing/' } },
      '/landing/': html('<h1>Landing</h1><p>Moved here.</p>'),
      '/to-internal': { status: 302, headers: { location: `${internal}/secret` } },
      '/sneaky': html(
        `<h1>Sneaky</h1><img src="/img-to-internal" alt="x"><iframe title="f" src="/frame-to-internal"></iframe><img src="${internal}/pixel.png" alt="y"><script>new Worker('/worker.js'); fetch('/img-to-internal');</script>`,
      ),
      '/worker.js': {
        headers: { 'content-type': 'text/javascript' },
        body: `fetch('${internal}/secret'); fetch('/img-to-internal');`,
      },
      '/img-to-internal': { status: 302, headers: { location: `${internal}/pixel.png` } },
      '/frame-to-internal': { status: 302, headers: { location: `/frame-hop` } },
      '/frame-hop': { status: 302, headers: { location: `${internal}/secret` } },
      '/slow': () => undefined, // never answers
      '/busy': { status: 429, body: 'slow down' },
      '/missing': { status: 404, body: 'nope' },
    });
    base = `http://127.0.0.1:${site.port}`;
    policy = {
      allowedPorts: [site.port],
      isAllowedAddress: (address) => address === '127.0.0.1',
      resolve: () => Promise.reject(new Error('no DNS in tests')),
    };
  });

  afterAll(async () => {
    await site.close();
    await forbidden.close();
  });

  const run = (paths: string[], extra: Partial<Parameters<typeof runPages>[1]> = {}) =>
    runPages(
      paths.map((path) => ({ url: `${base}${path}`, templateKey: 'page' })),
      {
        userAgent: 'TestBot/1.0',
        standard: 'wcag22aa',
        policy,
        log: silentLogger,
        navigationTimeoutMs: 3_000,
        pageTimeoutMs: 6_000,
        networkIdleMs: 500,
        settleMs: 50,
        ...extra,
      },
    );

  it('tests a page with axe and records results', async () => {
    const { pages, axeVersion } = await run(['/']);
    expect(axeVersion).toBe('4.14.0');
    expect(pages[0]).toMatchObject({ status: 'ok', httpStatus: 200, title: 'Fixture' });
    expect(pages[0]!.violations.map((v) => v.ruleId)).toContain('image-alt');
    expect(pages[0]!.passedRules).toContain('document-title');
  }, 60_000);

  it('follows a main-page redirect so relative links resolve against the new address', async () => {
    const { pages } = await run(['/old']);
    expect(pages[0]).toMatchObject({ status: 'ok', finalUrl: `${base}/landing/` });
  }, 60_000);

  it('refuses a main-page redirect to an internal address', async () => {
    const before = forbidden.requests.length;
    const { pages } = await run(['/to-internal']);
    expect(pages[0]!.status).toBe('blocked');
    expect(forbidden.requests.length).toBe(before);
  }, 60_000);

  it('never lets subresources, iframes, fetch() or workers reach internal addresses, directly or by redirect', async () => {
    const before = forbidden.requests.length;
    const { pages } = await run(['/sneaky'], { networkIdleMs: 1_500, settleMs: 500 });
    expect(pages[0]!.status).toBe('ok');
    expect(site.requests.map((r) => r.path)).toContain('/worker.js');
    expect(forbidden.requests.length).toBe(before);
  }, 60_000);

  it('marks a hanging page as timeout without stalling the others', async () => {
    const started = Date.now();
    const { pages } = await run(['/slow', '/', '/landing/'], { concurrency: 2 });
    expect(pages.map((p) => p.status)).toEqual(['timeout', 'ok', 'ok']);
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);

  it('records HTTP errors without running axe', async () => {
    const { pages } = await run(['/missing']);
    expect(pages[0]).toMatchObject({ status: 'http_error', httpStatus: 404, violations: [] });
  }, 60_000);

  it('stops after three 429/503 responses and skips the rest (spec 11.3)', async () => {
    const { pages, throttled } = await run(['/busy', '/busy', '/busy', '/', '/landing/'], {
      concurrency: 1,
    });
    expect(throttled).toBe(true);
    expect(pages.slice(0, 3).map((p) => p.status)).toEqual([
      'http_error',
      'http_error',
      'http_error',
    ]);
    expect(pages.slice(3).map((p) => p.status)).toEqual(['skipped', 'skipped']);
  }, 60_000);

  it('restarts the browser between batches', async () => {
    const { pages } = await run(['/', '/landing/', '/', '/landing/', '/'], {
      restartEvery: 2,
      concurrency: 2,
    });
    expect(pages.every((p) => p.status === 'ok')).toBe(true);
  }, 90_000);

  it('takes a screenshot only for pages with critical issues', async () => {
    const { pages } = await run(['/', '/landing/'], { screenshots: true });
    expect(pages[0]!.screenshot?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG
    expect(pages[1]!.screenshot).toBeUndefined();
  }, 60_000);
});
