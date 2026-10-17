import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPages } from '../../../src/scanner/runner/page-runner.js';
import { silentLogger } from '../../../src/scanner/types.js';
import { startFixtureSite, type FixtureSite } from '../../fixtures/site/fixture-site.js';

/** Total resident memory of this process and every Chromium process, in bytes (Linux). */
function totalRss(): number {
  const out = execFileSync('ps', ['-eo', 'rss=,comm='], { encoding: 'utf8' });
  const chromium = out
    .split('\n')
    .filter((line) => /chrom|headless_shell/i.test(line))
    .reduce((sum, line) => sum + Number(line.trim().split(/\s+/)[0] ?? 0), 0);
  return chromium * 1024 + process.memoryUsage().rss;
}

/**
 * P1-08 acceptance: 250 fixture pages at concurrency 2 stay under 2 GB.
 * Takes a few minutes, so opt-in:  SCANNER_LOAD_TESTS=1 npx vitest run tests/unit/scanner/load.test.ts
 */
describe.skipIf(!process.env.SCANNER_LOAD_TESTS)('250-page run', () => {
  let site: FixtureSite;
  beforeAll(async () => {
    site = await startFixtureSite();
  });
  afterAll(() => site.close());

  it('stays under 2 GB and completes every page', async () => {
    const paths = [
      '/',
      '/collections/all',
      '/products/alpha',
      '/pages/contact',
      '/blogs/news/hello',
      '/cart',
    ];
    const pages = Array.from({ length: 250 }, (_, i) => ({
      url: `http://127.0.0.1:${site.port}${paths[i % paths.length]}?n=${i}`,
      templateKey: 'page',
    }));
    let peak = 0;
    const sampler = setInterval(() => (peak = Math.max(peak, totalRss())), 1_000);
    const started = Date.now();
    try {
      const { pages: results } = await runPages(pages, {
        userAgent: 'TestBot/1.0',
        standard: 'wcag22aa',
        concurrency: 2,
        policy: {
          allowedPorts: [site.port],
          isAllowedAddress: (a) => a === '127.0.0.1',
          resolve: () => Promise.reject(new Error('no DNS')),
        },
        log: silentLogger,
      });
      const minutes = (Date.now() - started) / 60_000;
      console.log(
        `250 pages in ${minutes.toFixed(1)} min (${(250 / minutes).toFixed(0)} pages/min), peak memory ${(peak / 1024 ** 3).toFixed(2)} GB`,
      );
      expect(results.filter((r) => r.status === 'ok')).toHaveLength(250);
      expect(peak).toBeLessThan(2 * 1024 ** 3);
    } finally {
      clearInterval(sampler);
    }
  }, 900_000);
});
