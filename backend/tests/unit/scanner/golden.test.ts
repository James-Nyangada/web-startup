import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GuardPolicy } from '../../../src/scanner/net/guard.js';
import { runScan, type ScanResult } from '../../../src/scanner/scan.js';
import { silentLogger } from '../../../src/scanner/types.js';
import { startFixtureSite, type FixtureSite } from '../../fixtures/site/fixture-site.js';

/**
 * P1-12 golden-file test: scans the fixture store end to end and compares a
 * port-independent summary with tests/fixtures/golden/fixture-scan.json.
 * Regenerate after intended changes:  UPDATE_GOLDEN=1 npx vitest run tests/unit/scanner/golden.test.ts
 */
const GOLDEN = new URL('../../fixtures/golden/fixture-scan.json', import.meta.url);

function summarise(scan: ScanResult) {
  return {
    status: scan.status,
    platform: scan.platform,
    axeVersion: scan.axeVersion,
    pagesPlanned: scan.pagesPlanned,
    pagesScanned: scan.pagesScanned,
    templatesFound: scan.templatesFound,
    score: scan.score,
    counts: scan.counts,
    pages: scan.pages
      .map((p) => ({
        path: new URL(p.url).pathname,
        template: p.templateKey,
        status: p.status,
        score: p.score,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    issues: scan.issues
      .map((i) => ({
        fingerprint: i.fingerprint,
        ruleId: i.ruleId,
        impact: i.impact,
        templateKey: i.templateKey,
        selector: i.selector,
        occurrences: i.occurrenceCount,
        needsReview: i.needsReview,
      }))
      .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
  };
}

describe('fixture store scan (golden)', () => {
  let site: FixtureSite;
  let policy: GuardPolicy;

  beforeAll(async () => {
    site = await startFixtureSite();
    policy = {
      allowedPorts: [site.port],
      isAllowedAddress: (a) => a === '127.0.0.1',
      resolve: () => Promise.reject(new Error('no DNS')),
    };
  });
  afterAll(() => site.close());

  const scan = () =>
    runScan({
      rootUrl: `http://127.0.0.1:${site.port}`,
      pageLimit: 20,
      standard: 'wcag22aa',
      userAgent: 'TestBot/1.0',
      policy,
      requestIntervalMs: 0,
      concurrency: 2,
      log: silentLogger,
    });

  it('matches the golden file, and fingerprints survive randomised IDs between runs', async () => {
    const first = summarise(await scan());
    const second = summarise(await scan());
    expect(second.issues.map((i) => i.fingerprint)).toEqual(first.issues.map((i) => i.fingerprint));

    if (process.env.UPDATE_GOLDEN) {
      await writeFile(GOLDEN, `${JSON.stringify(first, null, 2)}\n`);
    }
    const golden = JSON.parse(await readFile(GOLDEN, 'utf8')) as unknown;
    expect(first).toEqual(golden);
  }, 180_000);

  it('finds every known problem in the fixture store', async () => {
    const golden = JSON.parse(await readFile(GOLDEN, 'utf8')) as ReturnType<typeof summarise>;
    const found = (ruleId: string, templateKey: string) =>
      golden.issues.find((i) => i.ruleId === ruleId && i.templateKey === templateKey);
    expect(found('button-name', 'product')?.occurrences).toBe(6);
    expect(found('image-alt', 'home')).toBeDefined();
    expect(found('color-contrast', 'collection')).toBeDefined();
    expect(found('html-has-lang', 'article')?.occurrences).toBe(2);
    expect(found('link-name', 'article')).toBeDefined();
    expect(golden.pages.some((p) => p.path.startsWith('/private-area'))).toBe(false);
    expect(golden.issues.filter((i) => i.ruleId === 'button-name')).toHaveLength(1);
  });
});
