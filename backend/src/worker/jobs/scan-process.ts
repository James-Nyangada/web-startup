import type { ScanResult } from '../../scanner/scan.js';
import { countIssues } from '../../scanner/scan.js';
import { diffScans, type ScannedPage } from '../../scanner/results/diff.js';
import { asOrgId } from '../../db/repositories/index.js';
import type { ScanJobPayload, WorkerContext } from '../types.js';
import { publishScanProgress } from '../progress.js';

export async function handleScanProcess(
  job: ScanJobPayload,
  ctx: WorkerContext,
): Promise<void> {
  const scan = await ctx.repos.scans.findRawById(job.scanId);
  if (!scan) return;

  // Don't re-process terminal scans
  if (scan.status === 'completed' || scan.status === 'failed' || scan.status === 'canceled') {
    return;
  }

  if (!scan.rawKey) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'MISSING_SCAN_DATA',
      'Raw scan results key was not found.',
    );
    return;
  }

  const rawBuffer = await ctx.storage.getObject(scan.rawKey);
  if (!rawBuffer) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'RAW_DATA_NOT_FOUND',
      'Could not read raw scan data from storage.',
    );
    return;
  }

  let scanResult: ScanResult;
  try {
    scanResult = JSON.parse(rawBuffer.toString('utf-8')) as ScanResult;
  } catch (err: unknown) {
    await ctx.repos.scans.markFailed(
      scan.id,
      'INVALID_RAW_JSON',
      `Failed to parse scan result JSON: ${(err as Error).message}`,
    );
    return;
  }

  const orgId = asOrgId(scan.orgId);

  // 1. Fetch previous issues for the site to apply the status machine
  const previousIssues = await ctx.repos.issues.listForDiff(orgId, scan.siteId);

  // 2. Fetch pages to map URLs to page IDs for occurrences
  const sitePages = await ctx.repos.pages.listBySite(orgId, scan.siteId, 2000);
  const pageUrlToIdMap = new Map<string, string>(sitePages.map((p) => [p.url, p.id]));

  // 3. Prepare scanned pages array for diffScans
  const scannedPages: ScannedPage[] = scanResult.pages.map((p) => ({
    url: p.url,
    templateKey: p.templateKey,
    ok: p.status === 'ok',
  }));

  // 4. Run pure status machine diffing (Section 6.7)
  const diff = diffScans(previousIssues, scanResult.issues, scannedPages, scanResult.pagesPlanned);

  // 5. Apply diff to database: issues, occurrences, and events
  await ctx.repos.issues.applyScanDiff(
    orgId,
    scan.siteId,
    scan.id,
    diff,
    scanResult.issues,
    pageUrlToIdMap,
  );

  // 6. Calculate counts and final status
  const counts = countIssues(scanResult.issues);
  const finalStatus =
    diff.partial || scanResult.status === 'partial'
      ? 'partial'
      : scanResult.pagesScanned === 0
        ? 'failed'
        : 'completed';

  // 7. Update scan with score, counts, and completion status
  await ctx.repos.scans.updateRaw(scan.id, {
    status: finalStatus,
    score: scanResult.score,
    counts,
    finishedAt: new Date(),
  });

  // 8. Publish completion event
  await publishScanProgress(ctx.pool, scan.id, {
    phase: 'completed',
    status: finalStatus,
    pagesScanned: scanResult.pagesScanned,
    pagesPlanned: scanResult.pagesPlanned,
    score: scanResult.score,
  });
}
