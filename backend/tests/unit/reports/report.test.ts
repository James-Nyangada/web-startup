import { describe, expect, it } from 'vitest';
import { renderReportHtml, renderReportPdf } from '../../../src/reports/render.js';
import { groupIssues } from '../../../src/scanner/results/issues.js';
import { countIssues, type ScanResult } from '../../../src/scanner/scan.js';
import { page, rule } from '../../helpers/scan-data.js';

function sampleScan(overrides: Partial<ScanResult> = {}): ScanResult {
  const pages = [
    page('https://shop.test/', 'home', [rule('image-alt', ['img.logo'])], {
      passedRules: ['document-title'],
    }),
    page('https://shop.test/products/a', 'product', [rule('button-name', ['#add-123456'])], {
      passedRules: ['label'],
    }),
    page('https://shop.test/products/b', 'product', [rule('button-name', ['#add-654321'])], {
      incomplete: [rule('color-contrast', ['p.note'], 'serious')],
    }),
    page('https://shop.test/slow', 'page', [], {
      status: 'timeout',
      error: 'No result within 45s',
    }),
  ];
  const issues = groupIssues(pages);
  return {
    engineVersion: '1.0.0',
    axeVersion: '4.14.0',
    standard: 'wcag22aa',
    rootUrl: 'https://shop.test',
    platform: 'shopify',
    status: 'completed',
    startedAt: '2026-10-17T10:00:00.000Z',
    finishedAt: '2026-10-17T10:02:00.000Z',
    pagesDiscovered: 120,
    pagesPlanned: 4,
    pagesScanned: 3,
    pagesFailed: 1,
    templatesFound: 3,
    score: 72,
    counts: countIssues(issues),
    planned: [],
    pages: pages.map((p) => ({
      url: p.url,
      finalUrl: p.url,
      templateKey: p.templateKey,
      status: p.status,
      httpStatus: p.httpStatus,
      loadMs: p.loadMs,
      title: p.title,
      score: p.status === 'ok' ? 80 : null,
      violations: p.violations.length,
      incomplete: p.incomplete.length,
      passes: p.passedRules.length,
    })),
    issues,
    discovery: {
      robots: { found: true, crawlDelaySeconds: undefined, sitemaps: [] },
      sitemapsRead: [],
      crawled: false,
      stats: { sitemapUrls: 0, crawlUrls: 0, dropped: 0, requestIntervalMs: 1000 },
      errors: [],
    },
    throttled: false,
    ...overrides,
  };
}

const BANNED =
  /\b(compliant|compliance guaranteed|ada-proof|lawsuit protection|100% accessible)\b/i;

describe.each(['summary', 'full'] as const)('%s report HTML', (type) => {
  const html = renderReportHtml(sampleScan(), type);

  it('always includes "What automated testing cannot check"', () => {
    expect(html).toContain('What automated testing cannot check');
  });

  it('never makes compliance claims', () => {
    expect(html).not.toMatch(BANNED);
  });

  it('is a well-formed, accessible document', () => {
    expect(html.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<th scope="col">');
  });

  it('describes problems in plain English and records the axe version', () => {
    expect(html).toContain('A button has no text or label');
    expect(html).toContain('4.14.0');
  });
});

describe('full report', () => {
  const html = renderReportHtml(sampleScan(), 'full');

  it('lists every problem with where it occurs, and the pages tested', () => {
    expect(html).toContain('All problems (2)');
    expect(html).toContain('/products/a');
    expect(html).toContain('Not tested (timeout)');
  });

  it('separates items that need a manual check', () => {
    expect(html).toContain('Needs a manual check (1)');
  });

  it('escapes HTML from scanned pages', () => {
    const scan = sampleScan();
    scan.issues[0]!.htmlSnippet = '<script>alert(1)</script>';
    expect(renderReportHtml(scan, 'full')).not.toContain('<script>alert(1)</script>');
  });
});

describe('PDF', () => {
  it('prints a tagged PDF with bookmarks in A4 and US Letter', async () => {
    const a4 = await renderReportPdf(sampleScan(), { type: 'summary', paper: 'a4' });
    const letter = await renderReportPdf(sampleScan(), { type: 'full', paper: 'letter' });
    for (const pdf of [a4, letter]) {
      const text = pdf.toString('latin1');
      expect(text.startsWith('%PDF-')).toBe(true);
      expect(text).toContain('/StructTreeRoot');
      expect(text).toContain('/Outlines');
      expect(text).toMatch(/\/Lang\s*\(en\)/);
    }
    expect(a4.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 595\.9\d* 842\.\d+\]/);
    expect(letter.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 612 792\]/);
  }, 60_000);

  it('handles a scan where no page could be tested', () => {
    const html = renderReportHtml(
      sampleScan({ score: null, status: 'failed', pagesScanned: 0, issues: [] }),
      'summary',
    );
    expect(html).toContain('No pages could be tested');
  });
});
