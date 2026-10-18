import { runScan, type ScanProgress } from '../../scanner/scan.js';
import { silentLogger } from '../../scanner/types.js';
import { asOrgId } from '../../db/repositories/index.js';
import type { PageUpsertInput } from '../../db/repositories/pages.js';
import type { ScanJobPayload, WorkerContext } from '../types.js';
import { publishScanProgress } from '../progress.js';
import { handleScanProcess } from './scan-process.js';

export async function handleScanRun(job: ScanJobPayload, ctx: WorkerContext): Promise<void> {
  const scan = await ctx.repos.scans.findRawById(job.scanId);
  if (!scan) return;

  // Don't rerun scans that are already finished or canceled
  if (scan.status === 'completed' || scan.status === 'failed' || scan.status === 'canceled') {
    return;
  }

  const site = await ctx.repos.sites.findRawById(scan.siteId);
  if (!site) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'SITE_NOT_FOUND',
      'The site associated with this scan was not found or was deleted.',
    );
    return;
  }

  const orgId = asOrgId(scan.orgId);

  if (ctx.abortSignal?.aborted) {
    await ctx.repos.scans.requeueInterrupted(scan.id);
    return;
  }

  // Transition to discovering
  await ctx.repos.scans.updateRaw(scan.id, {
    status: 'discovering',
    startedAt: new Date(),
  });

  await publishScanProgress(ctx.pool, scan.id, {
    phase: 'discovering',
    pagesScanned: 0,
    pagesPlanned: scan.pagesPlanned,
    status: 'discovering',
  });

  let lastReportedScanned = 0;

  try {
    const scanResult = await runScan({
      rootUrl: site.rootUrl,
      pageLimit: scan.pagesPlanned > 0 ? scan.pagesPlanned : (site.pageLimit ?? 50),
      standard: scan.standard ?? site.standard ?? 'wcag22aa',
      pinnedUrls: site.pinnedUrls ?? [],
      excludedPaths: site.excludedPaths ?? [],
      platform: site.platform,
      concurrency: ctx.scannerConcurrency ?? (Number(process.env.SCANNER_CONCURRENCY) || 2),
      userAgent:
        ctx.userAgent ??
        process.env.SCANNER_USER_AGENT ??
        'PRODUCT_NAMEBot/1.0 (+https://example.com/bot)',
      signal: ctx.abortSignal,
      log: ctx.logger ?? silentLogger,
      onProgress: (progress: ScanProgress) => {
        // Emit progress on phase transitions or every 5 pages scanned
        const shouldEmit =
          progress.phase !== 'scanning' ||
          progress.pagesScanned === 0 ||
          progress.pagesScanned - lastReportedScanned >= 5 ||
          progress.pagesScanned === progress.pagesPlanned;

        if (shouldEmit) {
          lastReportedScanned = progress.pagesScanned;
          void publishScanProgress(ctx.pool, scan.id, {
            phase: progress.phase,
            pagesScanned: progress.pagesScanned,
            pagesPlanned: progress.pagesPlanned,
            currentUrl: progress.currentUrl,
            message: progress.message,
            status: progress.phase,
          });

          // Also update database counts periodically
          void ctx.repos.scans.updateRaw(scan.id, {
            pagesScanned: progress.pagesScanned,
            pagesPlanned: progress.pagesPlanned,
            status: progress.phase,
          });
        }
      },
    });

    const checkCanceled = await ctx.repos.scans.findRawById(scan.id);
    if (checkCanceled?.status === 'canceled') {
      return;
    }

    // 1. Persist discovered and planned pages to pages table
    const pagesToUpsert: PageUpsertInput[] = scanResult.pages.map((p) => ({
      url: p.url,
      templateKey: p.templateKey,
      title: p.title,
      lastStatusCode: p.httpStatus,
      isPinned: (site.pinnedUrls ?? []).includes(p.url),
      firstSeenScanId: scan.id,
      lastScannedScanId: scan.id,
    }));

    // Add any planned pages not yet in pagesToUpsert
    for (const pl of scanResult.planned) {
      if (!pagesToUpsert.some((p) => p.url === pl.url)) {
        pagesToUpsert.push({
          url: pl.url,
          templateKey: pl.templateKey,
          title: null,
          lastStatusCode: null,
          isPinned: (site.pinnedUrls ?? []).includes(pl.url),
          firstSeenScanId: scan.id,
          lastScannedScanId: null,
        });
      }
    }

    const pageIdMap = await ctx.repos.pages.upsertPages(orgId, scan.siteId, pagesToUpsert);

    // 2. Persist page results
    const pageResultRows = scanResult.pages
      .map((p) => {
        const pageId = pageIdMap.get(p.url);
        if (!pageId) return null;
        return {
          pageId,
          status: p.status,
          httpStatus: p.httpStatus,
          loadMs: p.loadMs,
          violations: p.violations,
          passes: p.passes,
          incomplete: p.incomplete,
          score: p.score,
          screenshotKey: null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await ctx.repos.pages.insertPageResults(orgId, scan.id, pageResultRows);

    // 3. Persist raw scan result JSON to storage
    const rawKey = `scans/${scan.orgId}/${scan.id}/raw.json`;
    await ctx.storage.putObject(rawKey, JSON.stringify(scanResult), 'application/json');

    // 4. Update scan row to processing status
    await ctx.repos.scans.updateRaw(scan.id, {
      status: 'processing',
      pagesDiscovered: scanResult.pagesDiscovered,
      pagesPlanned: scanResult.pagesPlanned,
      pagesScanned: scanResult.pagesScanned,
      pagesFailed: scanResult.pagesFailed,
      templatesFound: scanResult.templatesFound,
      axeVersion: scanResult.axeVersion,
      engineVersion: scanResult.engineVersion,
      rawKey,
    });

    await publishScanProgress(ctx.pool, scan.id, {
      phase: 'processing',
      pagesScanned: scanResult.pagesScanned,
      pagesPlanned: scanResult.pagesPlanned,
      status: 'processing',
    });

    // 5. Enqueue scan.process
    if (ctx.autoProcess) {
      await handleScanProcess({ scanId: scan.id }, ctx);
    } else if (ctx.boss) {
      await ctx.boss.send('scan.process', { scanId: scan.id });
    }
  } catch (err: unknown) {
    if (ctx.abortSignal?.aborted) {
      // Worker was shut down or aborted: cleanly requeue the scan
      await ctx.repos.scans.requeueInterrupted(scan.id);
      return;
    }

    const errorMessage = (err as Error).message || 'Unknown scan error';
    await ctx.repos.scans.markFailed(scan.id, 'SCAN_EXECUTION_ERROR', errorMessage);
    await publishScanProgress(ctx.pool, scan.id, {
      phase: 'scanning',
      status: 'failed',
      pagesScanned: 0,
      pagesPlanned: scan.pagesPlanned,
      message: errorMessage,
    });
  }
}
