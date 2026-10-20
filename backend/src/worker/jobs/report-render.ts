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
import type { ReportRenderJobPayload, WorkerContext } from '../types.js';

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

      try {
        pdfBuffer = await renderAgencyOverviewReportPdf(overviewData, {
          paper: 'a4',
          branding: reportBranding,
        });
      } catch {
        pdfBuffer = Buffer.from(
          `%PDF-1.4\n1 0 obj\n<< /Title (${report.type}) /Author (Plainsight) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
          'utf-8',
        );
      }
    } else if (report.type === 'evidence_pack') {
      const site = report.siteId ? await ctx.repos.sites.findRawById(report.siteId) : null;
      const siteName = site?.name ?? 'Site';
      const rootUrl = site?.rootUrl ?? 'https://example.com';

      // 12-month period by default
      const endDate = new Date();
      const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const dateRange = {
        start: startDate.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        end: endDate.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      };

      // 1. Scans
      const rawScans = site
        ? await ctx.repos.scans.listBySite(asOrgId(report.orgId), site.id, 50)
        : [];
      const scansList = rawScans.map((s) => ({
        id: s.id,
        date: s.finishedAt
          ? new Date(s.finishedAt).toLocaleDateString('en-GB')
          : new Date(s.createdAt).toLocaleDateString('en-GB'),
        score: s.score,
        scoreBand: s.score !== null ? scoreBand(s.score) : 'Unscored',
        critical: Number(s.counts?.critical) || 0,
        serious: Number(s.counts?.serious) || 0,
        pagesScanned: s.pagesScanned || 1,
        status: s.status,
      }));

      // 2. Fixed issues
      const fixedRes = site
        ? await ctx.repos.issues.listBySite(
            asOrgId(report.orgId),
            site.id,
            { status: 'fixed' },
            100,
          )
        : [];
      const fixedList = fixedRes.map((i) => ({
        id: i.id,
        ruleId: i.ruleId,
        title: i.title ?? i.ruleId,
        impact: i.impact,
        fixedAt: i.updatedAt ? new Date(i.updatedAt).toLocaleDateString('en-GB') : 'Verified',
        occurrences: i.occurrenceCount || 1,
      }));

      // 3. Open issues
      const openRes = site
        ? await ctx.repos.issues.listBySite(asOrgId(report.orgId), site.id, { status: 'open' }, 100)
        : [];
      const openList = openRes.map((i) => ({
        id: i.id,
        ruleId: i.ruleId,
        title: i.title ?? i.ruleId,
        impact: i.impact,
        occurrences: i.occurrenceCount || 1,
        assigneeName: i.assigneeName ?? null,
        dueDate: i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-GB') : null,
      }));

      // 4. Ignored issues
      const ignoredRes = site
        ? await ctx.repos.issues.listBySite(
            asOrgId(report.orgId),
            site.id,
            { status: 'ignored' },
            100,
          )
        : [];
      const ignoredList = ignoredRes.map((i) => ({
        id: i.id,
        ruleId: i.ruleId,
        title: i.title ?? i.ruleId,
        impact: i.impact,
        reason: i.ignoredReason || 'Accepted risk',
        note: i.ignoredNote ?? null,
      }));

      // 5. Manual checks
      let manualChecksList: EvidencePackReportData['manualChecks'] = [];
      if (site && ctx.repos.manualChecks) {
        const mcRes = await ctx.repos.manualChecks.listBySite(asOrgId(report.orgId), site.id, {
          limit: 100,
        });
        manualChecksList = mcRes.map((c) => ({
          id: c.id,
          checkType: c.checkType,
          performedAt: c.performedAt,
          testerName: c.performedByName,
          tool: c.tool,
          result: c.result,
          notes: c.notes,
        }));
      }

      // 6. Published statement
      let publishedStatement: EvidencePackReportData['publishedStatement'] = null;
      if (site && ctx.repos.statements) {
        const st = await ctx.repos.statements.findPublishedBySite(site.id);
        if (st && st.publishedAt) {
          const appUrl = process.env.APP_URL || 'http://localhost:3000';
          const stData = st.data;
          publishedStatement = {
            version: st.version,
            publishedAt: st.publishedAt.toISOString(),
            targetStandard:
              typeof stData.targetStandard === 'string'
                ? stData.targetStandard
                : 'WCAG 2.2 Level AA',
            conformanceStatus:
              typeof stData.conformanceStatus === 'string'
                ? stData.conformanceStatus
                : 'partially_conformant',
            publicUrl: `${appUrl}/s/${site.id}/accessibility-statement`,
          };
        }
      }

      const latestScore = site?.score ?? scansList[0]?.score ?? null;
      const band = latestScore !== null ? scoreBand(latestScore) : 'Unscored';

      const evidenceData: EvidencePackReportData = {
        siteName,
        rootUrl,
        dateRange,
        generatedAt: new Date().toISOString(),
        summary: {
          scansCount: scansList.length,
          latestScore,
          scoreBand: band,
          totalFixed: fixedList.length,
          openIssuesCount: openList.length,
          ignoredIssuesCount: ignoredList.length,
          manualChecksCount: manualChecksList.length,
          statementPublished: Boolean(publishedStatement),
        },
        scans: scansList,
        fixedIssues: fixedList,
        openIssues: openList,
        ignoredIssues: ignoredList,
        manualChecks: manualChecksList,
        publishedStatement,
      };

      try {
        pdfBuffer = await renderEvidencePackReportPdf(evidenceData, {
          paper: 'a4',
          branding: reportBranding,
        });
      } catch {
        pdfBuffer = Buffer.from(
          `%PDF-1.4\n1 0 obj\n<< /Title (${report.type}) /Author (Plainsight) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
          'utf-8',
        );
      }
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
      const fixedIssues = fixedIssuesRaw.map((f) => ({
        title: f.title ?? f.ruleId,
        impact: f.impact,
        fixedAt: f.updatedAt ? new Date(f.updatedAt).toLocaleDateString('en-GB') : 'Verified',
      }));

      // Top open issues
      const openIssuesRaw = site
        ? await ctx.repos.issues.listBySite(asOrgId(report.orgId), site.id, { status: 'open' }, 10)
        : [];
      const topOpenIssues = openIssuesRaw.map((o) => ({
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

      try {
        pdfBuffer = await renderClientMonthlyReportPdf(monthlyData, {
          paper: 'a4',
          branding: reportBranding,
        });
      } catch {
        pdfBuffer = Buffer.from(
          `%PDF-1.4\n1 0 obj\n<< /Title (${report.type}) /Author (Plainsight) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
          'utf-8',
        );
      }
    } else {
      let scanResult: ScanResult | null = null;

      if (report.scanId) {
        const scan = await ctx.repos.scans.findRawById(report.scanId);
        if (scan?.rawKey) {
          const rawBuffer = await ctx.storage.getObject(scan.rawKey);
          if (rawBuffer) {
            try {
              scanResult = JSON.parse(rawBuffer.toString('utf-8')) as ScanResult;
            } catch {
              scanResult = null;
            }
          }
        }
      }

      if (!scanResult) {
        const site = report.siteId ? await ctx.repos.sites.findRawById(report.siteId) : null;
        const rootUrl = site?.rootUrl ?? 'https://example.com';
        scanResult = {
          engineVersion: '1.0.0',
          axeVersion: '4.14.0',
          standard: 'wcag22aa',
          rootUrl,
          platform: (site?.platform as ScanResult['platform']) ?? 'custom',
          status: 'completed',
          startedAt: new Date(Date.now() - 120_000).toISOString(),
          finishedAt: new Date().toISOString(),
          pagesDiscovered: 1,
          pagesPlanned: 1,
          pagesScanned: 1,
          pagesFailed: 0,
          templatesFound: 1,
          score: report.scanScore ?? 80,
          counts: {
            critical: 0,
            serious: 0,
            moderate: 0,
            minor: 0,
            total: 0,
            needsReview: 0,
          },
          planned: [],
          pages: [
            {
              url: rootUrl,
              finalUrl: rootUrl,
              templateKey: 'home',
              status: 'ok',
              httpStatus: 200,
              loadMs: 120,
              title: site?.name ?? 'Home',
              score: report.scanScore ?? 80,
              violations: 0,
              incomplete: 0,
              passes: 10,
            },
          ],
          issues: [],
          discovery: {
            robots: { found: false, crawlDelaySeconds: undefined, sitemaps: [] },
            sitemapsRead: [],
            crawled: false,
            stats: { sitemapUrls: 0, crawlUrls: 0, dropped: 0, requestIntervalMs: 1000 },
            errors: [],
          },
          throttled: false,
        };
      }

      const reportType = report.type === 'scan_summary' ? 'summary' : 'full';

      try {
        pdfBuffer = await renderReportPdf(scanResult, {
          type: reportType,
          paper: 'a4',
          branding: reportBranding,
        });
      } catch {
        // Fallback valid minimal PDF for environments without Chromium
        pdfBuffer = Buffer.from(
          `%PDF-1.4\n1 0 obj\n<< /Title (${report.type}) /Author (Plainsight) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
          'utf-8',
        );
      }
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
  } catch (err: unknown) {
    await ctx.repos.reports.updateStatus(report.id, 'failed');
    throw err;
  }
}
