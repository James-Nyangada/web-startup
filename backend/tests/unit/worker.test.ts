import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PgBoss } from 'pg-boss';
import type { ScanResult } from '../../src/scanner/scan.js';
import { groupIssues } from '../../src/scanner/results/issues.js';
import { scoreScan } from '../../src/scanner/results/score.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { handleScanRun } from '../../src/worker/jobs/scan-run.js';
import { handleScanProcess } from '../../src/worker/jobs/scan-process.js';
import { recoverInterruptedScans } from '../../src/worker/recovery.js';
import {
  enqueueScanProcess,
  enqueueScanRun,
  QUEUE_SCAN_PROCESS,
  QUEUE_SCAN_RUN,
} from '../../src/worker/boss.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { page, rule } from '../helpers/scan-data.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { PreviousIssue } from '../../src/scanner/results/diff.js';
import type { PageUpsertInput } from '../../src/db/repositories/pages.js';
import type { scans } from '../../src/db/schema/index.js';

describe('Worker & Queue Engine (Chunk P2-08)', () => {
  const orgId = '11111111-1111-4111-a111-111111111111';
  const siteId = 'site-11111111-1111-4111-a111-111111111111';
  const scanId = 'scan-11111111-1111-4111-a111-111111111111';

  function createTestScan(
    overrides: Partial<typeof scans.$inferSelect> = {},
  ): typeof scans.$inferSelect {
    return {
      id: scanId,
      orgId,
      siteId,
      trigger: 'manual',
      status: 'queued',
      queuedAt: new Date(),
      startedAt: null,
      finishedAt: null,
      pagesDiscovered: 0,
      pagesPlanned: 10,
      pagesScanned: 0,
      pagesFailed: 0,
      templatesFound: 0,
      axeVersion: '4.14.0',
      engineVersion: '1.0.0',
      standard: 'wcag22aa',
      score: null,
      counts: {},
      rawKey: null,
      errorCode: null,
      errorMessage: null,
      requestedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  let storage: MemoryStorageService;
  let mockRepos: Repositories;
  let mockBoss: {
    send: ReturnType<typeof vi.fn>;
    work: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storage = new MemoryStorageService();
    mockBoss = {
      send: vi.fn().mockResolvedValue('job-123'),
      work: vi.fn().mockResolvedValue('worker-123'),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    mockRepos = {
      scans: {
        findRawById: vi.fn().mockResolvedValue({
          id: scanId,
          orgId,
          siteId,
          status: 'queued',
          pagesPlanned: 10,
          pagesScanned: 0,
          rawKey: null,
          standard: 'wcag22aa',
        }),
        updateRaw: vi
          .fn()
          .mockImplementation((_id, data) => Promise.resolve({ id: scanId, ...data })),
        markFailed: vi.fn().mockResolvedValue({ id: scanId, status: 'failed' }),
        requeueInterrupted: vi.fn().mockResolvedValue({ id: scanId, status: 'queued' }),
        findInterruptedScans: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        listBySite: vi.fn(),
        countBySite: vi.fn(),
        findRunningScanForSite: vi.fn(),
        countOnboardingScansForSite: vi.fn(),
      },
      sites: {
        findRawById: vi.fn().mockResolvedValue({
          id: siteId,
          orgId,
          rootUrl: 'https://example.com',
          platform: 'custom',
          pageLimit: 10,
          standard: 'wcag22aa',
          pinnedUrls: ['https://example.com/pinned'],
          excludedPaths: [],
          status: 'active',
        }),
        findById: vi.fn(),
        findByRootUrl: vi.fn(),
        list: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        softDelete: vi.fn(),
        setVerified: vi.fn(),
      },
      pages: {
        upsertPages: vi.fn().mockImplementation((_orgId, _siteId, pagesList: PageUpsertInput[]) => {
          const map = new Map<string, string>();
          for (let i = 0; i < pagesList.length; i++) {
            const p = pagesList[i];
            if (p) {
              map.set(p.url, `page-id-${i}`);
            }
          }
          return Promise.resolve(map);
        }),
        insertPageResults: vi.fn().mockResolvedValue(undefined),
        listBySite: vi.fn().mockResolvedValue([
          { id: 'page-id-0', url: 'https://example.com' },
          { id: 'page-id-1', url: 'https://example.com/about' },
        ]),
        countBySite: vi.fn().mockResolvedValue(2),
        findById: vi.fn(),
        listResultsByScan: vi.fn().mockResolvedValue([]),
      },
      issues: {
        listForDiff: vi.fn().mockResolvedValue([]),
        applyScanDiff: vi
          .fn()
          .mockResolvedValue({ createdCount: 1, fixedCount: 0, regressedCount: 0 }),
        listBySite: vi.fn().mockResolvedValue([]),
        countBySite: vi.fn().mockResolvedValue(0),
        findById: vi.fn(),
      },
      auditLog: { write: vi.fn(), list: vi.fn() },
      memberships: {
        list: vi.fn(),
        findRole: vi.fn(),
        add: vi.fn(),
        find: vi.fn(),
        updateRole: vi.fn(),
        remove: vi.fn(),
      },
      organizations: {
        create: vi.fn(),
        findById: vi.fn(),
        findBySlug: vi.fn(),
        findByIdOrSlug: vi.fn(),
        update: vi.fn(),
        softDelete: vi.fn(),
        isSlugAvailable: vi.fn(),
        createWithInitialOwner: vi.fn(),
      },
      users: {
        findById: vi.fn(),
        findByEmail: vi.fn(),
        update: vi.fn(),
        listMemberships: vi.fn(),
        listClientAccess: vi.fn(),
        isSoleOwnerOfActiveOrg: vi.fn(),
        softDelete: vi.fn(),
      },
      waitlist: { join: vi.fn() },
    } as unknown as Repositories;
  });

  describe('scan.run job', () => {
    it('marks scan failed when the associated site is not found', async () => {
      vi.mocked(mockRepos.sites.findRawById).mockResolvedValueOnce(null);

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
      };

      await handleScanRun({ scanId }, ctx);

      expect(mockRepos.scans.markFailed).toHaveBeenCalledWith(
        scanId,
        'SITE_NOT_FOUND',
        expect.stringContaining('not found'),
      );
    });

    it('cleanly requeues scan when abort signal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
        abortSignal: controller.signal,
      };

      await handleScanRun({ scanId }, ctx);

      expect(mockRepos.scans.requeueInterrupted).toHaveBeenCalledWith(scanId);
    });

    it('ignores terminal scans (completed/failed/canceled)', async () => {
      vi.mocked(mockRepos.scans.findRawById).mockResolvedValueOnce(
        createTestScan({
          status: 'completed',
          pagesPlanned: 10,
          pagesScanned: 10,
          rawKey: 'some-key',
        }),
      );

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
      };

      await handleScanRun({ scanId }, ctx);

      expect(mockRepos.scans.updateRaw).not.toHaveBeenCalled();
    });
  });

  describe('scan.process job & Section 6.7 status machine', () => {
    function createMockScanResult(
      options: {
        urls?: string[];
        violations?: Array<{
          ruleId: string;
          target: string;
          impact?: 'critical' | 'serious' | 'moderate' | 'minor';
        }>;
        pagesFailed?: number;
      } = {},
    ): ScanResult {
      const urls = options.urls ?? ['https://example.com', 'https://example.com/about'];
      const pageResults = urls.map((url, idx) => {
        const isFailed = idx < (options.pagesFailed ?? 0);
        const v0 = options.violations?.[0];
        const violations = v0 && !isFailed ? [rule(v0.ruleId, [v0.target], v0.impact)] : [];
        return page(url, 'home', violations, {
          status: isFailed ? 'http_error' : 'ok',
          httpStatus: isFailed ? 500 : 200,
        });
      });

      const foundIssues = groupIssues(pageResults);

      return {
        engineVersion: '1.0.0',
        axeVersion: '4.14.0',
        standard: 'wcag22aa',
        rootUrl: 'https://example.com',
        platform: 'custom',
        status:
          options.pagesFailed && options.pagesFailed > urls.length / 2 ? 'partial' : 'completed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        pagesDiscovered: urls.length,
        pagesPlanned: urls.length,
        pagesScanned: urls.length - (options.pagesFailed ?? 0),
        pagesFailed: options.pagesFailed ?? 0,
        templatesFound: 1,
        score: scoreScan(pageResults),
        counts: {
          critical: 0,
          serious: 0,
          moderate: 0,
          minor: 0,
          total: foundIssues.length,
          needsReview: 0,
        },
        planned: urls.map((url) => ({ url, templateKey: 'home', reason: 'home' as const })),
        pages: pageResults.map((p) => ({
          url: p.url,
          finalUrl: p.finalUrl,
          templateKey: p.templateKey,
          status: p.status,
          httpStatus: p.httpStatus,
          loadMs: p.loadMs,
          title: p.title,
          score: p.status === 'ok' ? 80 : null,
          violations: p.violations.length,
          incomplete: 0,
          passes: 10,
        })),
        issues: foundIssues,
        discovery: {
          robots: { found: false, crawlDelaySeconds: undefined, sitemaps: [] },
          sitemapsRead: [],
          crawled: false,
          stats: { sitemapUrls: 0, crawlUrls: urls.length, dropped: 0, requestIntervalMs: 0 },
          errors: [],
        },
        throttled: false,
      };
    }

    it('processes scan results and marks new issues as open', async () => {
      const scanResult = createMockScanResult({
        violations: [{ ruleId: 'color-contrast', target: '#header button', impact: 'serious' }],
      });
      const rawKey = `scans/${orgId}/${scanId}/raw.json`;
      await storage.putObject(rawKey, JSON.stringify(scanResult));

      vi.mocked(mockRepos.scans.findRawById).mockResolvedValueOnce(
        createTestScan({
          status: 'processing',
          pagesPlanned: 2,
          pagesScanned: 2,
          rawKey,
        }),
      );

      // No previous issues
      vi.mocked(mockRepos.issues.listForDiff).mockResolvedValueOnce([]);

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
      };

      await handleScanProcess({ scanId }, ctx);

      expect(mockRepos.issues.applyScanDiff).toHaveBeenCalledWith(
        orgId,
        siteId,
        scanId,
        expect.objectContaining({
          created: expect.arrayContaining([expect.objectContaining({ ruleId: 'color-contrast' })]),
          fixed: [],
          regressed: [],
        }),
        expect.any(Array),
        expect.any(Map),
      );

      expect(mockRepos.scans.updateRaw).toHaveBeenCalledWith(
        scanId,
        expect.objectContaining({
          status: 'completed',
          score: scanResult.score,
        }),
      );
    });

    it('detects regressions when a fixed issue appears again', async () => {
      const scanResult = createMockScanResult({
        violations: [{ ruleId: 'image-alt', target: '#hero-img', impact: 'critical' }],
      });
      const rawKey = `scans/${orgId}/${scanId}/raw.json`;
      await storage.putObject(rawKey, JSON.stringify(scanResult));

      vi.mocked(mockRepos.scans.findRawById).mockResolvedValueOnce(
        createTestScan({
          status: 'processing',
          pagesPlanned: 2,
          pagesScanned: 2,
          rawKey,
        }),
      );

      const foundFp = scanResult.issues[0]!.fingerprint;

      // Previous issue was fixed
      const previousIssues: PreviousIssue[] = [
        {
          fingerprint: foundFp,
          status: 'fixed',
          templateKey: 'home',
          lastSeenPageUrls: ['https://example.com'],
        },
      ];
      vi.mocked(mockRepos.issues.listForDiff).mockResolvedValueOnce(previousIssues);

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
      };

      await handleScanProcess({ scanId }, ctx);

      expect(mockRepos.issues.applyScanDiff).toHaveBeenCalledWith(
        orgId,
        siteId,
        scanId,
        expect.objectContaining({
          regressed: expect.arrayContaining([expect.objectContaining({ fingerprint: foundFp })]),
          created: [],
        }),
        expect.any(Array),
        expect.any(Map),
      );
    });

    it('marks open issue as fixed when all its pages are scanned without violation', async () => {
      // Current scan has NO violations
      const scanResult = createMockScanResult({ violations: undefined });
      const rawKey = `scans/${orgId}/${scanId}/raw.json`;
      await storage.putObject(rawKey, JSON.stringify(scanResult));

      vi.mocked(mockRepos.scans.findRawById).mockResolvedValueOnce(
        createTestScan({
          status: 'processing',
          pagesPlanned: 2,
          pagesScanned: 2,
          rawKey,
        }),
      );

      // Previous open issue on https://example.com
      const previousIssues: PreviousIssue[] = [
        {
          fingerprint: 'prev-fp-123',
          status: 'open',
          templateKey: 'home',
          lastSeenPageUrls: ['https://example.com'],
        },
      ];
      vi.mocked(mockRepos.issues.listForDiff).mockResolvedValueOnce(previousIssues);

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
      };

      await handleScanProcess({ scanId }, ctx);

      expect(mockRepos.issues.applyScanDiff).toHaveBeenCalledWith(
        orgId,
        siteId,
        scanId,
        expect.objectContaining({
          fixed: expect.arrayContaining([expect.objectContaining({ fingerprint: 'prev-fp-123' })]),
        }),
        expect.any(Array),
        expect.any(Map),
      );
    });

    it('partial scan (>50% failed pages) never marks anything fixed', async () => {
      // 2 planned pages, 2 failed
      const scanResult = createMockScanResult({ pagesFailed: 2 });
      const rawKey = `scans/${orgId}/${scanId}/raw.json`;
      await storage.putObject(rawKey, JSON.stringify(scanResult));

      vi.mocked(mockRepos.scans.findRawById).mockResolvedValueOnce(
        createTestScan({
          status: 'processing',
          pagesPlanned: 2,
          pagesScanned: 0,
          rawKey,
        }),
      );

      const previousIssues: PreviousIssue[] = [
        {
          fingerprint: 'prev-fp-123',
          status: 'open',
          templateKey: 'home',
          lastSeenPageUrls: ['https://example.com'],
        },
      ];
      vi.mocked(mockRepos.issues.listForDiff).mockResolvedValueOnce(previousIssues);

      const ctx: WorkerContext = {
        repos: mockRepos,
        storage,
        boss: mockBoss as unknown as WorkerContext['boss'],
      };

      await handleScanProcess({ scanId }, ctx);

      expect(mockRepos.issues.applyScanDiff).toHaveBeenCalledWith(
        orgId,
        siteId,
        scanId,
        expect.objectContaining({
          partial: true,
          fixed: [],
          unchecked: expect.arrayContaining([
            expect.objectContaining({ fingerprint: 'prev-fp-123' }),
          ]),
        }),
        expect.any(Array),
        expect.any(Map),
      );
    });
  });

  describe('Scale & Unique Constraint Guarantee (250 pages)', () => {
    it('groups 250 occurrences of the same issue into 1 issue with occurrence_count 250', () => {
      // Acceptance criteria: "A 250-page scan writes correct counts; issue table unique constraint never violated."
      const pagesList = Array.from({ length: 250 }, (_, i) =>
        page(`https://example.com/products/${i}`, 'product', [
          rule('image-alt', ['#global-header-logo'], 'critical'),
        ]),
      );

      const grouped = groupIssues(pagesList);
      expect(grouped).toHaveLength(1);
      expect(grouped[0]!.ruleId).toBe('image-alt');
      expect(grouped[0]!.occurrences).toHaveLength(250);
    });
  });

  describe('Interrupted Scan Recovery (Worker Restart)', () => {
    it('re-queues discovering and scanning scans back to queued on worker restart', async () => {
      vi.mocked(mockRepos.scans.findInterruptedScans).mockResolvedValueOnce([
        createTestScan({ id: 'scan-interrupted-1', status: 'discovering', rawKey: null }),
        createTestScan({ id: 'scan-interrupted-2', status: 'scanning', rawKey: null }),
        createTestScan({
          id: 'scan-interrupted-3',
          status: 'processing',
          rawKey: 'scans/raw.json',
        }),
      ]);

      const count = await recoverInterruptedScans(mockRepos, mockBoss as unknown as PgBoss);

      expect(count).toBe(3);
      expect(mockRepos.scans.requeueInterrupted).toHaveBeenCalledWith('scan-interrupted-1');
      expect(mockRepos.scans.requeueInterrupted).toHaveBeenCalledWith('scan-interrupted-2');
      expect(mockBoss.send).toHaveBeenCalledWith(QUEUE_SCAN_RUN, { scanId: 'scan-interrupted-1' });
      expect(mockBoss.send).toHaveBeenCalledWith(QUEUE_SCAN_RUN, { scanId: 'scan-interrupted-2' });
      expect(mockBoss.send).toHaveBeenCalledWith(QUEUE_SCAN_PROCESS, {
        scanId: 'scan-interrupted-3',
      });
    });
  });

  describe('Queue dispatchers', () => {
    it('enqueueScanRun sends job with 25 min timeout and 2 retries', async () => {
      await enqueueScanRun(mockBoss as unknown as PgBoss, 'scan-1');

      expect(mockBoss.send).toHaveBeenCalledWith(
        QUEUE_SCAN_RUN,
        { scanId: 'scan-1' },
        expect.objectContaining({
          expireInSeconds: 1500,
          retryLimit: 2,
          retryDelay: 300,
          retryBackoff: true,
        }),
      );
    });

    it('enqueueScanProcess sends job with 5 min timeout and 3 retries', async () => {
      await enqueueScanProcess(mockBoss as unknown as PgBoss, 'scan-1');

      expect(mockBoss.send).toHaveBeenCalledWith(
        QUEUE_SCAN_PROCESS,
        { scanId: 'scan-1' },
        expect.objectContaining({
          expireInSeconds: 300,
          retryLimit: 3,
        }),
      );
    });
  });
});
