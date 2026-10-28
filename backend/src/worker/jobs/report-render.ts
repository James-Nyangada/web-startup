import {
  renderReportPdf,
  renderAgencyOverviewReportPdf,
  renderEvidencePackReportPdf,
  renderClientMonthlyReportPdf,
} from '../../reports/render.js';
import type { ScanResult } from '../../scanner/scan.js';
import type { ReportBranding } from '../../reports/components.js';
import type {
  AgencyOverviewReportData,
  EvidencePackReportData,
  ClientMonthlyReportData,
} from '../../reports/templates.js';
import { scoreBand } from '../../scanner/results/score.js';
import { asOrgId } from '../../db/repositories/org-scope.js';
import type { ReportRow } from '../../db/schema/index.js';
import { computeTrendSummary, type TrendPoint } from '../../lib/trend.js';
import { formatRangeDate, rangeBounds, resolveReportDateRange } from '../../reports/date-range.js';
import type { ReportRenderJobPayload, WorkerContext } from '../types.js';
import { notifyInApp } from '../notify.js';

/** Most rows printed per evidence pack table; totals in the summary always cover everything. */
export const EVIDENCE_TABLE_ROW_LIMIT = 300;
/** Daily scans for a full year fit without truncation. */
export const EVIDENCE_SCAN_ROW_LIMIT = 400;

function formatDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return date.toLocaleDateString('en-GB', { timeZone: 'UTC' });
}

function capRows<T>(rows: T[], limit: number): { shown: T[]; omitted: number } {
  return { shown: rows.slice(0, limit), omitted: Math.max(0, rows.length - limit) };
}

/**
 * Collects R-03 data for the report's period (P5-04). Every section is filtered to the
 * period except open issues, which are the backlog as of generation. Reports created
 * before the period was stored fall back to the 12 months before their creation.
 */
export async function buildEvidencePackData(
  report: Pick<ReportRow, 'orgId' | 'siteId' | 'dateFrom' | 'dateTo' | 'createdAt'>,
  ctx: WorkerContext,
): Promise<EvidencePackReportData> {
  if (!report.siteId) throw new Error('Evidence pack requires a site.');
  const orgId = asOrgId(report.orgId);
  const site = await ctx.repos.sites.findRawById(report.siteId);
  if (!site) throw new Error(`Site ${report.siteId} not found for evidence pack.`);

  const range =
    report.dateFrom && report.dateTo
      ? { from: report.dateFrom, to: report.dateTo }
      : resolveReportDateRange(undefined, report.createdAt);
  const { start, end } = rangeBounds(range);

  const [scanRows, issueSets, checkRows, statement] = await Promise.all([
    ctx.repos.scans.listForEvidencePack(orgId, site.id, start, end),
    ctx.repos.issues.listForEvidencePack(orgId, site.id, start, end),
    ctx.repos.manualChecks.listForEvidencePack(orgId, site.id, range.from, range.to),
    ctx.repos.statements.findPublishedBySite(site.id),
  ]);

  // 1. Scans: trend oldest first, table newest first
  const scoredScans = scanRows.filter(
    (s): s is typeof s & { score: number } => s.score !== null && s.status !== 'failed',
  );
  const trend = scoredScans.map((s) => ({
    date: (s.finishedAt ?? s.queuedAt).toISOString().slice(0, 10),
    score: s.score,
  }));
  const trendPoints: TrendPoint[] = scoredScans.map((s) => [
    formatDay(s.finishedAt ?? s.queuedAt)!,
    s.score,
    (['critical', 'serious', 'moderate', 'minor'] as const).reduce(
      (sum, k) => sum + (Number(s.counts?.[k]) || 0),
      0,
    ),
    s.status === 'partial',
  ]);
  const scans = capRows([...scanRows].reverse(), EVIDENCE_SCAN_ROW_LIMIT);

  // 2–4. Issues
  const fixed = capRows(issueSets.fixed, EVIDENCE_TABLE_ROW_LIMIT);
  const open = capRows(issueSets.open, EVIDENCE_TABLE_ROW_LIMIT);
  const ignored = capRows(issueSets.ignored, EVIDENCE_TABLE_ROW_LIMIT);

  // 5. Manual checks
  const checks = capRows(checkRows, EVIDENCE_TABLE_ROW_LIMIT);

  // 6. Published statement (the current one, wherever it was published)
  let publishedStatement: EvidencePackReportData['publishedStatement'] = null;
  if (statement?.publishedAt) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const stData = statement.data;
    publishedStatement = {
      version: statement.version,
      publishedAt: statement.publishedAt.toISOString(),
      targetStandard:
        typeof stData.targetStandard === 'string' ? stData.targetStandard : 'WCAG 2.2 Level AA',
      conformanceStatus:
        typeof stData.conformanceStatus === 'string'
          ? stData.conformanceStatus
          : 'partially_conformant',
      publicUrl: `${appUrl}/s/${site.id}/accessibility-statement`,
    };
  }

  const latestScore = scoredScans.at(-1)?.score ?? null;

  return {
    siteName: site.name,
    rootUrl: site.rootUrl,
    dateRange: { start: formatRangeDate(range.from), end: formatRangeDate(range.to) },
    generatedAt: new Date().toISOString(),
    trend,
    trendSummary: computeTrendSummary(trendPoints),
    omitted: {
      scans: scans.omitted,
      fixedIssues: fixed.omitted,
      openIssues: open.omitted,
      ignoredIssues: ignored.omitted,
      manualChecks: checks.omitted,
    },
    summary: {
      scansCount: scanRows.length,
      latestScore,
      scoreBand: latestScore !== null ? scoreBand(latestScore) : 'Unscored',
      totalFixed: issueSets.fixed.length,
      openIssuesCount: issueSets.open.length,
      ignoredIssuesCount: issueSets.ignored.length,
      manualChecksCount: checkRows.length,
      statementPublished: Boolean(publishedStatement),
    },
    scans: scans.shown.map((s) => ({
      id: s.id,
      date: formatDay(s.finishedAt ?? s.queuedAt)!,
      score: s.score,
      scoreBand: s.score !== null ? scoreBand(s.score) : 'Unscored',
      critical: Number(s.counts?.critical) || 0,
      serious: Number(s.counts?.serious) || 0,
      pagesScanned: s.pagesScanned,
      status: s.status,
    })),
    fixedIssues: fixed.shown.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      title: i.title,
      impact: i.impact,
      fixedAt: formatDay(i.fixedAt) ?? '—',
      occurrences: i.occurrenceCount,
    })),
    openIssues: open.shown.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      title: i.title,
      impact: i.impact,
      occurrences: i.occurrenceCount,
      assigneeName: i.assigneeName ?? null,
      dueDate: formatDay(i.dueDate),
    })),
    ignoredIssues: ignored.shown.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      title: i.title,
      impact: i.impact,
      reason: i.ignoredReason ? i.ignoredReason.replace(/_/g, ' ') : 'Not recorded',
      note: i.ignoredNote ?? null,
    })),
    manualChecks: checks.shown.map((c) => ({
      id: c.id,
      checkType: c.checkType,
      performedAt: formatDay(c.performedAt)!,
      testerName: c.performedByName,
      tool: c.tool,
      result: c.result,
      notes: c.notes,
    })),
    publishedStatement,
  };
}

export async function handleReportRender(
  job: ReportRenderJobPayload,
  ctx: WorkerContext,
): Promise<void> {
  const report = await ctx.repos.reports.findRawById(job.reportId);
  if (!report) return;

  // Don't re-render already finished reports
  if (report.status === 'ready') return;

  await ctx.repos.reports.updateStatus(report.id, 'rendering');

  try {
    let reportBranding: ReportBranding | undefined;
    if (ctx.repos.branding) {
      const bRow = await ctx.repos.branding.findByOrgId(asOrgId(report.orgId));
      if (bRow) {
        let logoDataUrl: string | undefined;
        if (bRow.logoLightKey) {
          const logoBuf = await ctx.storage.getObject(bRow.logoLightKey);
          if (logoBuf) {
            const isSvg = bRow.logoLightKey.endsWith('.svg');
            const mime = isSvg ? 'image/svg+xml' : 'image/png';
            logoDataUrl = `data:${mime};base64,${logoBuf.toString('base64')}`;
          }
        }
        reportBranding = {
          displayName: bRow.displayName ?? undefined,
          logoUrl: logoDataUrl,
          primaryColor: bRow.primaryColor ?? undefined,
          reportFooter: bRow.reportFooter ?? undefined,
        };
      }
    }

    let pdfBuffer: Buffer;

    if (report.type === 'agency_overview') {
      const org = await ctx.repos.organizations.findById(asOrgId(report.orgId));
      const orgSites = await ctx.repos.sites.list(asOrgId(report.orgId));
      const siteIds = orgSites.map((s) => s.id);
      const summaries = await ctx.repos.sites.listSummaries(asOrgId(report.orgId), siteIds);
      const common = await ctx.repos.issues.listCrossSiteCommonIssues(asOrgId(report.orgId));

      let scoredSum = 0;
      let scoredCount = 0;
      let totalCritical = 0;
      let totalSerious = 0;
      let sitesWithRegressions = 0;

      const sitesData: AgencyOverviewReportData['sites'] = [];
      const attentionSites: AgencyOverviewReportData['attentionSites'] = [];

      for (const s of orgSites) {
        const sum = summaries.get(s.id);
        const score = s.score ?? null;
        const band = score !== null ? scoreBand(score) : 'Unscored';
        const crit = sum?.openCritical ?? 0;
        const ser = sum?.openSerious ?? 0;
        const reg = sum?.regressions ?? 0;

        if (score !== null) {
          scoredSum += score;
          scoredCount += 1;
        }
        totalCritical += crit;
        totalSerious += ser;
        if (sum?.lastScanStatus === 'failed') {
          attentionSites.push({
            name: s.name,
            reason: sum.lastScanError || 'Scan failed',
            score,
          });
        } else if (reg > 0) {
          sitesWithRegressions += 1;
          attentionSites.push({
            name: s.name,
            reason: `${reg} regression${reg === 1 ? '' : 's'} detected`,
            score,
          });
        } else if (score !== null && score < 70) {
          attentionSites.push({
            name: s.name,
            reason: 'Accessibility score below 70',
            score,
          });
        }

        sitesData.push({
          id: s.id,
          name: s.name,
          clientName: s.clientName,
          rootUrl: s.rootUrl,
          score,
          scoreBand: band,
          critical: crit,
          serious: ser,
          regressions: reg,
          verified: Boolean(s.verifiedAt),
          lastScanAt: sum?.lastScanAt ? sum.lastScanAt.toISOString() : null,
        });
      }

      const overviewData: AgencyOverviewReportData = {
        orgName: org?.name ?? 'Agency',
        generatedAt: new Date().toISOString(),
        totals: {
          sitesCount: orgSites.length,
          averageScore: scoredCount > 0 ? Math.round(scoredSum / scoredCount) : null,
          totalCritical,
          totalSerious,
          sitesWithRegressions,
        },
        sites: sitesData,
        commonIssues: common.map((c) => ({
          ruleId: c.ruleId,
          title: c.title,
          impact: c.impact,
          affectedSitesCount: c.affectedSitesCount,
          totalOccurrences: c.totalOccurrences,
        })),
        attentionSites,
      };

      pdfBuffer = await renderAgencyOverviewReportPdf(overviewData, {
        paper: report.paper,
        branding: reportBranding,
      });
    } else if (report.type === 'evidence_pack') {
      const evidenceData = await buildEvidencePackData(report, ctx);
      pdfBuffer = await renderEvidencePackReportPdf(evidenceData, {
        paper: report.paper,
        branding: reportBranding,
      });
    } else if (report.type === 'client_monthly') {
      const site = report.siteId ? await ctx.repos.sites.findRawById(report.siteId) : null;
      const siteName = site?.name ?? 'Site';
      const rootUrl = site?.rootUrl ?? 'https://example.com';
      const clientName = site?.clientName ?? null;

      const now = new Date();
      const reportPeriod = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

      // Gather site summary and issues
      const currentScore = site?.score ?? null;
      let previousScore: number | null = null;
      let scoreDelta: number | null = null;

      if (site) {
        const summaries = await ctx.repos.sites.listSummaries(asOrgId(report.orgId), [site.id]);
        const summary = summaries.get(site.id);
        previousScore = summary?.previousScore ?? null;
        if (currentScore !== null && previousScore !== null) {
          scoreDelta = currentScore - previousScore;
        }
      }

      // Severity counts
      const counts = site
        ? await ctx.repos.issues.getSeverityCounts(asOrgId(report.orgId), site.id)
        : { critical: 0, serious: 0, moderate: 0, minor: 0 };

      // Fixed issues
      const fixedIssuesRaw = site
        ? await ctx.repos.issues.listBySite(asOrgId(report.orgId), site.id, { status: 'fixed' }, 15)
        : [];
      const fixedIssuesRows = Array.isArray(fixedIssuesRaw)
        ? fixedIssuesRaw
        : (((fixedIssuesRaw as unknown as { items?: unknown[] })?.items as typeof fixedIssuesRaw) ??
          []);
      const fixedIssues = fixedIssuesRows.map((f) => ({
        title: f.title ?? f.ruleId,
        impact: f.impact,
        fixedAt: f.updatedAt ? new Date(f.updatedAt).toLocaleDateString('en-GB') : 'Verified',
      }));

      // Top open issues
      const openIssuesRaw = site
        ? await ctx.repos.issues.listBySite(asOrgId(report.orgId), site.id, { status: 'open' }, 10)
        : [];
      const openIssuesRows = Array.isArray(openIssuesRaw)
        ? openIssuesRaw
        : (((openIssuesRaw as unknown as { items?: unknown[] })?.items as typeof openIssuesRaw) ??
          []);
      const topOpenIssues = openIssuesRows.map((o) => ({
        title: o.title ?? o.ruleId,
        impact: o.impact,
        selector: o.selector ?? '—',
        occurrences: o.occurrenceCount ?? 1,
      }));

      const rawScans = site
        ? await ctx.repos.scans.listBySite(asOrgId(report.orgId), site.id, 10)
        : [];

      const monthlyData: ClientMonthlyReportData = {
        siteName,
        clientName,
        rootUrl,
        reportPeriod,
        currentScore,
        previousScore,
        scoreDelta,
        totalIssues: counts.critical + counts.serious + counts.moderate + counts.minor,
        criticalCount: counts.critical,
        seriousCount: counts.serious,
        moderateCount: counts.moderate,
        minorCount: counts.minor,
        fixedThisMonthCount: fixedIssues.length,
        fixedIssues,
        topOpenIssues,
        scansCount: rawScans.length,
      };

      pdfBuffer = await renderClientMonthlyReportPdf(monthlyData, {
        paper: report.paper,
        branding: reportBranding,
      });
    } else {
      // Reports queued before the API resolved a scan fall back to the site's latest one
      const scan = report.scanId
        ? await ctx.repos.scans.findRawById(report.scanId)
        : report.siteId
          ? await ctx.repos.scans.findLatestReportable(asOrgId(report.orgId), report.siteId)
          : null;
      if (!scan?.rawKey) {
        throw new Error(`Report ${report.id} has no scan results to render.`);
      }
      const rawBuffer = await ctx.storage.getObject(scan.rawKey);
      if (!rawBuffer) {
        throw new Error(`Scan results for ${scan.id} are no longer stored.`);
      }
      const scanResult = JSON.parse(rawBuffer.toString('utf-8')) as ScanResult;

      const reportType = report.type === 'scan_summary' ? 'summary' : 'full';

      const reportOrg = ctx.repos.organizations
        ? await ctx.repos.organizations.findById(asOrgId(report.orgId))
        : null;
      pdfBuffer = await renderReportPdf(scanResult, {
        type: reportType,
        paper: report.paper,
        branding: reportBranding,
        watermark: reportOrg?.billingStatus === 'trialing' ? 'TRIAL REPORT' : undefined,
      });
    }

    const fileKey = `reports/${report.orgId}/${report.id}.pdf`;
    await ctx.storage.putObject(fileKey, pdfBuffer, 'application/pdf');

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await ctx.repos.reports.updateStatus(report.id, 'ready', {
      fileKey,
      fileSize: pdfBuffer.length,
      expiresAt,
    });

    await ctx.repos.auditLog.write(asOrgId(report.orgId), {
      actorId: report.requestedBy ?? undefined,
      actorType: 'system',
      action: 'report.generated',
      targetType: 'report',
      targetId: report.id,
      data: {
        type: report.type,
        siteId: report.siteId,
        scanId: report.scanId,
        fileSize: pdfBuffer.length,
      },
    });

    if (report.siteId && ctx.repos.evidenceEvents?.record) {
      await ctx.repos.evidenceEvents.record(asOrgId(report.orgId), {
        siteId: report.siteId,
        type: 'report_generated',
        actorId: report.requestedBy ?? null,
        data: {
          reportId: report.id,
          type: report.type,
          scanId: report.scanId,
          fileSize: pdfBuffer.length,
        },
      });
    }

    // In-app mirror of E-11 "report ready" for whoever asked for it (P5-05)
    if (report.requestedBy) {
      await notifyInApp(ctx, asOrgId(report.orgId), [report.requestedBy], {
        type: 'report_ready',
        title: `${REPORT_NAMES[report.type] ?? 'Report'} is ready`,
        body: 'Your PDF has finished generating and is ready to download.',
        link: report.siteId ? `/sites/${report.siteId}/reports` : '/reports',
      });
    }
  } catch (err: unknown) {
    await ctx.repos.reports.updateStatus(report.id, 'failed');
    throw err;
  }
}

const REPORT_NAMES: Record<string, string> = {
  scan_summary: 'Scan summary report',
  full: 'Full audit report',
  evidence_pack: 'Evidence pack',
  client_monthly: 'Client monthly report',
  agency_overview: 'Agency overview report',
};
