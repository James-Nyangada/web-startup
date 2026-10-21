import { describe, expect, it, vi } from 'vitest';
import type { Repositories } from '../../src/db/repositories/index.js';
import {
  buildEvidencePackData,
  EVIDENCE_TABLE_ROW_LIMIT,
  handleReportRender,
} from '../../src/worker/jobs/report-render.js';
import { renderEvidencePackReportHtml } from '../../src/reports/render.js';
import {
  DateRangeError,
  MAX_RANGE_MONTHS,
  resolveReportDateRange,
} from '../../src/reports/date-range.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import type { WorkerContext } from '../../src/worker/types.js';

const orgId = '11111111-1111-4111-a111-111111111111';
const siteId = '22222222-2222-4222-a222-222222222222';
const DAY = 24 * 60 * 60 * 1000;

interface FakeHistory {
  scans?: unknown[];
  fixed?: unknown[];
  open?: unknown[];
  ignored?: unknown[];
  checks?: unknown[];
}

function fakeRepos(history: FakeHistory = {}, report: Record<string, unknown> = {}) {
  const updateStatus = vi.fn().mockResolvedValue(undefined);
  const recordEvidence = vi.fn().mockResolvedValue(undefined);
  const repos = {
    reports: {
      findRawById: vi.fn().mockResolvedValue({
        id: 'rep-ev-1',
        orgId,
        siteId,
        type: 'evidence_pack',
        status: 'queued',
        requestedBy: 'user-1',
        dateFrom: '2025-10-21',
        dateTo: '2026-10-20',
        createdAt: new Date('2026-10-21T08:00:00Z'),
        ...report,
      }),
      updateStatus,
    },
    sites: {
      findRawById: vi.fn().mockResolvedValue({
        id: siteId,
        name: 'Oakhaus Furniture',
        rootUrl: 'https://oakhaus.com',
      }),
    },
    branding: { findByOrgId: vi.fn().mockResolvedValue(null) },
    scans: { listForEvidencePack: vi.fn().mockResolvedValue(history.scans ?? []) },
    issues: {
      listForEvidencePack: vi.fn().mockResolvedValue({
        fixed: history.fixed ?? [],
        open: history.open ?? [],
        ignored: history.ignored ?? [],
      }),
    },
    manualChecks: { listForEvidencePack: vi.fn().mockResolvedValue(history.checks ?? []) },
    statements: {
      findPublishedBySite: vi.fn().mockResolvedValue({
        version: 2,
        publishedAt: new Date('2026-10-15T00:00:00Z'),
        data: { targetStandard: 'WCAG 2.2 Level AA', conformanceStatus: 'partially_conformant' },
      }),
    },
    evidenceEvents: { record: recordEvidence },
    auditLog: { write: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Repositories;
  return { repos, updateStatus, recordEvidence };
}

function scan(i: number, finishedAt: Date, score: number | null = 70 + (i % 25)) {
  return {
    id: `scan-${i}`,
    status: 'completed',
    score,
    counts: { critical: i % 3, serious: i % 5, moderate: 4, minor: 6 },
    pagesScanned: 25,
    finishedAt,
    queuedAt: finishedAt,
  };
}

function issue(i: number, status: 'open' | 'fixed' | 'ignored', at: Date) {
  const impacts = ['critical', 'serious', 'moderate', 'minor'] as const;
  return {
    id: `${status}-${i}`,
    ruleId: ['image-alt', 'color-contrast', 'link-name', 'label'][i % 4]!,
    title: `Issue ${i}`,
    impact: impacts[i % 4]!,
    status,
    occurrenceCount: 1 + (i % 7),
    fixedAt: status === 'fixed' ? at : null,
    ignoredAt: status === 'ignored' ? at : null,
    ignoredReason: status === 'ignored' ? 'false_positive' : null,
    ignoredNote: status === 'ignored' ? `Reviewed by QA (${i})` : null,
    assigneeName: status === 'open' && i % 2 === 0 ? 'Daniel Mwangi' : null,
    dueDate: status === 'open' && i % 3 === 0 ? '2026-11-15' : null,
  };
}

function check(i: number, performedAt: string) {
  return {
    id: `mc-${i}`,
    checkType: ['keyboard', 'screen_reader', 'zoom_reflow'][i % 3],
    performedAt,
    performedByName: 'Sarah QA',
    tool: 'NVDA 2026.2 + Firefox',
    result: i % 4 === 0 ? 'issues_found' : 'pass',
    notes: 'Checkout flow tested end to end.',
  };
}

/** A site scanned daily for a year, with a realistic issue and manual-check history. */
function twelveMonthHistory(end: Date): FakeHistory {
  const scans = Array.from({ length: 365 }, (_, i) =>
    scan(i, new Date(end.getTime() - (364 - i) * DAY)),
  );
  return {
    scans,
    fixed: Array.from({ length: 450 }, (_, i) =>
      issue(i, 'fixed', new Date(end.getTime() - (i * DAY) / 2)),
    ),
    open: Array.from({ length: 220 }, (_, i) => issue(i, 'open', end)),
    ignored: Array.from({ length: 60 }, (_, i) =>
      issue(i, 'ignored', new Date(end.getTime() - i * 5 * DAY)),
    ),
    checks: Array.from({ length: 48 }, (_, i) =>
      check(i, new Date(end.getTime() - i * 7 * DAY).toISOString().slice(0, 10)),
    ),
  };
}

describe('resolveReportDateRange', () => {
  const now = new Date('2026-10-21T10:00:00Z');

  it('defaults to the 12 months up to today', () => {
    expect(resolveReportDateRange(undefined, now)).toEqual({
      from: '2025-10-21',
      to: '2026-10-21',
    });
  });

  it('fills a missing start from the given end', () => {
    expect(resolveReportDateRange({ end: '2026-06-30' }, now)).toEqual({
      from: '2025-06-30',
      to: '2026-06-30',
    });
  });

  it('accepts a single day and the maximum span', () => {
    expect(resolveReportDateRange({ start: '2026-10-21', end: '2026-10-21' }, now).from).toBe(
      '2026-10-21',
    );
    expect(() =>
      resolveReportDateRange({ start: '2023-10-21', end: '2026-10-21' }, now),
    ).not.toThrow();
    expect(() => resolveReportDateRange({ start: '2023-10-20', end: '2026-10-21' }, now)).toThrow(
      `${MAX_RANGE_MONTHS} months`,
    );
  });

  it('rejects bad input with a DateRangeError', () => {
    expect(() => resolveReportDateRange({ end: '2026-10-22' }, now)).toThrow(DateRangeError);
    expect(() => resolveReportDateRange({ start: '2026-13-01' }, now)).toThrow(DateRangeError);
    expect(() => resolveReportDateRange({ start: 'yesterday' }, now)).toThrow(DateRangeError);
  });
});

describe('buildEvidencePackData (P5-04)', () => {
  it('queries every section for the stored period', async () => {
    const { repos } = fakeRepos();
    await buildEvidencePackData(
      {
        orgId,
        siteId,
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
        createdAt: new Date('2026-10-21T00:00:00Z'),
      },
      { repos, storage: {} as never },
    );

    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-03-31T23:59:59.999Z');
    expect(repos.scans.listForEvidencePack).toHaveBeenCalledWith(orgId, siteId, start, end);
    expect(repos.issues.listForEvidencePack).toHaveBeenCalledWith(orgId, siteId, start, end);
    expect(repos.manualChecks.listForEvidencePack).toHaveBeenCalledWith(
      orgId,
      siteId,
      '2026-01-01',
      '2026-03-31',
    );
  });

  it('falls back to the 12 months before creation for reports without a stored period', async () => {
    const { repos } = fakeRepos();
    const data = await buildEvidencePackData(
      {
        orgId,
        siteId,
        dateFrom: null,
        dateTo: null,
        createdAt: new Date('2026-05-10T12:00:00Z'),
      },
      { repos, storage: {} as never },
    );
    expect(data.dateRange).toEqual({ start: '10 May 2025', end: '10 May 2026' });
  });

  it('shows the period on the cover, a trend, and full totals with capped tables', async () => {
    const end = new Date('2026-10-20T12:00:00Z');
    const history = twelveMonthHistory(end);
    const { repos } = fakeRepos(history);
    const ctx: WorkerContext = { repos, storage: {} as never };

    const data = await buildEvidencePackData(
      {
        orgId,
        siteId,
        dateFrom: '2025-10-21',
        dateTo: '2026-10-20',
        createdAt: end,
      },
      ctx,
    );

    expect(data.dateRange).toEqual({ start: '21 Oct 2025', end: '20 Oct 2026' });
    expect(data.summary).toMatchObject({
      scansCount: 365,
      totalFixed: 450,
      openIssuesCount: 220,
      ignoredIssuesCount: 60,
      manualChecksCount: 48,
      statementPublished: true,
    });
    // All 365 daily scans fit; the fixed list is capped and the rest counted
    expect(data.scans).toHaveLength(365);
    expect(data.fixedIssues).toHaveLength(EVIDENCE_TABLE_ROW_LIMIT);
    expect(data.omitted).toEqual({
      scans: 0,
      fixedIssues: 450 - EVIDENCE_TABLE_ROW_LIMIT,
      openIssues: 0,
      ignoredIssues: 0,
      manualChecks: 0,
    });
    // Table newest first, trend oldest first, latest score from the newest scan
    expect(data.scans[0]!.id).toBe('scan-364');
    expect(data.trend![0]!.date < data.trend!.at(-1)!.date).toBe(true);
    expect(data.summary.latestScore).toBe(70 + (364 % 25));
    expect(data.trendSummary).toMatch(/over 365 scans/);
    // Real fix dates and readable ignore reasons
    expect(data.fixedIssues[0]!.fixedAt).toBe('20/10/2026');
    expect(data.ignoredIssues[0]!.reason).toBe('false positive');

    const html = renderEvidencePackReportHtml(data);
    expect(html).toContain('21 Oct 2025 – 20 Oct 2026');
    expect(html).toContain('Remediated Issues (450)');
    expect(html).toContain(`+ ${450 - EVIDENCE_TABLE_ROW_LIMIT} more remediated issues not shown`);
    expect(html).toContain('role="img"');
    expect(html).toContain('Trend:</strong>');
  });
});

describe('handleReportRender: evidence pack', () => {
  it('renders a real PDF and records report_generated', async () => {
    const end = new Date();
    const { repos, updateStatus, recordEvidence } = fakeRepos({
      scans: [scan(1, new Date(end.getTime() - 30 * DAY)), scan(2, end)],
      fixed: [issue(1, 'fixed', end)],
      open: [issue(2, 'open', end)],
      ignored: [issue(3, 'ignored', end)],
      checks: [check(1, end.toISOString().slice(0, 10))],
    });
    const storage = new MemoryStorageService();

    await handleReportRender({ reportId: 'rep-ev-1' }, { repos, storage });

    expect(updateStatus).toHaveBeenCalledWith(
      'rep-ev-1',
      'ready',
      expect.objectContaining({ fileKey: `reports/${orgId}/rep-ev-1.pdf` }),
    );
    const pdf = await storage.getObject(`reports/${orgId}/rep-ev-1.pdf`);
    expect(pdf!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf!.length).toBeGreaterThan(5_000); // a real document, not a stub
    expect(recordEvidence).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({ type: 'report_generated' }),
    );
  });

  it('marks the report failed instead of storing a stub PDF', async () => {
    const { repos, updateStatus } = fakeRepos();
    vi.mocked(repos.sites.findRawById).mockResolvedValue(null);
    const storage = new MemoryStorageService();

    await expect(handleReportRender({ reportId: 'rep-ev-1' }, { repos, storage })).rejects.toThrow(
      /not found/,
    );
    expect(updateStatus).toHaveBeenCalledWith('rep-ev-1', 'failed');
    expect(await storage.getObject(`reports/${orgId}/rep-ev-1.pdf`)).toBeNull();
  });

  it('renders 12 months of daily history in under 3 minutes', async () => {
    const end = new Date();
    const { repos, updateStatus } = fakeRepos(twelveMonthHistory(end));
    const storage = new MemoryStorageService();

    const started = performance.now();
    await handleReportRender({ reportId: 'rep-ev-1' }, { repos, storage });
    const seconds = (performance.now() - started) / 1000;

    expect(updateStatus).toHaveBeenCalledWith('rep-ev-1', 'ready', expect.anything());
    expect(seconds).toBeLessThan(180);
  }, 200_000);
});
