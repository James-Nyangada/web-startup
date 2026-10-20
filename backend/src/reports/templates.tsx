import type { ScanResult } from '../scanner/scan.js';
import {
  CountsBlock,
  Cover,
  IssueDetail,
  Limitations,
  Methodology,
  PagesTable,
  ScoreBlock,
  TopIssuesTable,
  type ReportBranding,
} from './components.js';
import { reportCss } from './styles.js';

function Document({
  title,
  branding,
  children,
}: {
  title: string;
  branding?: ReportBranding;
  children: React.ReactNode;
}) {
  const dynamicCss = branding?.primaryColor
    ? `${reportCss}\n:root { --primary: ${branding.primaryColor}; }`
    : reportCss;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: dynamicCss }} />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

/** R-01: one-to-two page scan summary. */
export function ScanSummaryReport({
  scan,
  branding,
}: {
  scan: ScanResult;
  branding?: ReportBranding;
}) {
  const title = 'Accessibility scan summary';
  return (
    <Document title={`${title} – ${scan.rootUrl}`} branding={branding}>
      <Cover scan={scan} title={title} branding={branding} />
      <ScoreBlock scan={scan} />
      <CountsBlock scan={scan} />
      <section aria-labelledby="top-heading">
        <h2 id="top-heading">Fix these first</h2>
        <TopIssuesTable issues={scan.issues} limit={10} />
      </section>
      <Limitations />
      <Methodology scan={scan} />
    </Document>
  );
}

/** R-02: full report with every issue, where it occurs, and per-page results. */
export function FullReport({ scan, branding }: { scan: ScanResult; branding?: ReportBranding }) {
  const title = 'Accessibility scan report';
  const confirmed = scan.issues.filter((i) => !i.needsReview);
  const review = scan.issues.filter((i) => i.needsReview);
  return (
    <Document title={`${title} – ${scan.rootUrl}`} branding={branding}>
      <Cover scan={scan} title={title} branding={branding} />
      <ScoreBlock scan={scan} />
      <CountsBlock scan={scan} />
      <section aria-labelledby="top-heading">
        <h2 id="top-heading">Fix these first</h2>
        <TopIssuesTable issues={scan.issues} limit={10} />
      </section>
      <section aria-labelledby="all-heading">
        <h2 id="all-heading">All problems ({confirmed.length})</h2>
        {confirmed.length === 0 ? (
          <p>No problems were found by the automated checks.</p>
        ) : (
          confirmed.map((issue) => <IssueDetail key={issue.fingerprint} issue={issue} />)
        )}
      </section>
      {review.length > 0 && (
        <section aria-labelledby="review-heading">
          <h2 id="review-heading">Needs a manual check ({review.length})</h2>
          <p>Automated checks could not decide these. A person should review each one.</p>
          {review.map((issue) => (
            <IssueDetail key={issue.fingerprint} issue={issue} maxOccurrences={5} />
          ))}
        </section>
      )}
      <section aria-labelledby="pages-heading">
        <h2 id="pages-heading">Pages tested</h2>
        <PagesTable scan={scan} />
      </section>
      <Limitations />
      <Methodology scan={scan} />
    </Document>
  );
}

export interface FreeCheckReportInput {
  url: string;
  checkedAt: string;
  score: number;
  scoreBand: string;
  counts: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  topIssues: Array<{
    ruleId: string;
    title: string;
    impact: string;
    wcagCriteria: string[];
    occurrences: number;
    whoIsAffected: string;
    selector?: string;
    htmlSnippet?: string;
  }>;
}

/** R-06: Free check one-page report. */
export function FreeCheckReport({ check }: { check: FreeCheckReportInput }) {
  const title = 'Free Accessibility Audit Report';
  return (
    <Document title={`${title} – ${check.url}`}>
      <header className="cover">
        <h1>{title}</h1>
        <p className="site">{check.url}</p>
        <dl className="meta">
          <dt>Checked</dt>
          <dd>{new Date(check.checkedAt).toUTCString()}</dd>
          <dt>Standard checked</dt>
          <dd>WCAG 2.2 level A and AA (automated checks)</dd>
          <dt>Pages tested</dt>
          <dd>1 page (home page audit)</dd>
        </dl>
      </header>
      <section className="score-block">
        <div className="score-dial">
          <span className="score-number">{check.score}</span>
          <span className="score-max">/ 100</span>
          <span className={`band band-${check.scoreBand.toLowerCase().replace(/\s+/g, '-')}`}>
            {check.scoreBand}
          </span>
        </div>
      </section>
      <section className="counts-block">
        <div className="counts-grid">
          <div className="count-card">
            <span className="count-num">{check.counts.critical}</span>
            <span className="count-label">Critical</span>
          </div>
          <div className="count-card">
            <span className="count-num">{check.counts.serious}</span>
            <span className="count-label">Serious</span>
          </div>
          <div className="count-card">
            <span className="count-num">{check.counts.moderate}</span>
            <span className="count-label">Moderate</span>
          </div>
          <div className="count-card">
            <span className="count-num">{check.counts.minor}</span>
            <span className="count-label">Minor</span>
          </div>
        </div>
      </section>
      <section aria-labelledby="top-heading">
        <h2 id="top-heading">Top issues identified on this page</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Severity</th>
              <th scope="col">Problem</th>
              <th scope="col">Who is affected</th>
              <th scope="col">Occurrences</th>
            </tr>
          </thead>
          <tbody>
            {check.topIssues.map((issue, idx) => (
              <tr key={idx}>
                <td>
                  <span className={`badge sev-${issue.impact}`}>{issue.impact}</span>
                </td>
                <td>
                  <strong>{issue.title}</strong>
                  <div className="muted">{issue.ruleId}</div>
                </td>
                <td>{issue.whoIsAffected}</td>
                <td>{issue.occurrences}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Limitations />
    </Document>
  );
}

export interface AgencyOverviewReportData {
  orgName: string;
  generatedAt: string;
  totals: {
    sitesCount: number;
    averageScore: number | null;
    totalCritical: number;
    totalSerious: number;
    sitesWithRegressions: number;
  };
  sites: Array<{
    id: string;
    name: string;
    clientName: string | null;
    rootUrl: string;
    score: number | null;
    scoreBand: string;
    critical: number;
    serious: number;
    regressions: number;
    verified: boolean;
    lastScanAt: string | null;
  }>;
  commonIssues: Array<{
    ruleId: string;
    title: string;
    impact: string;
    affectedSitesCount: number;
    totalOccurrences: number;
  }>;
  attentionSites: Array<{
    name: string;
    reason: string;
    score: number | null;
  }>;
}

/** R-05: Agency portfolio overview report. */
export function AgencyOverviewReport({
  data,
  branding,
}: {
  data: AgencyOverviewReportData;
  branding?: ReportBranding;
}) {
  const title = 'Agency Portfolio Accessibility Overview';
  const orgDisplayName = branding?.displayName || data.orgName;

  return (
    <Document title={`${title} – ${orgDisplayName}`} branding={branding}>
      <header className="cover">
        {branding?.logoUrl && (
          <div style={{ marginBottom: '10pt' }}>
            <img
              src={branding.logoUrl}
              alt={orgDisplayName}
              style={{ maxHeight: '36pt', objectFit: 'contain' }}
            />
          </div>
        )}
        <h1>{title}</h1>
        <p className="site">{orgDisplayName} · Multi-storefront portfolio audit (R-05)</p>
        <dl className="meta">
          <dt>Generated</dt>
          <dd>{new Date(data.generatedAt).toUTCString()}</dd>
          <dt>Scope</dt>
          <dd>{data.totals.sitesCount} monitored client storefronts</dd>
          <dt>Standard checked</dt>
          <dd>WCAG 2.2 level A and AA (automated audits)</dd>
        </dl>
      </header>

      {/* Portfolio Totals */}
      <section className="counts" aria-label="Portfolio metrics">
        <div className="count">
          <span className="n">{data.totals.sitesCount}</span>
          <span className="muted small">Sites Monitored</span>
        </div>
        <div className="count">
          <span className="n">{data.totals.averageScore ?? '—'}</span>
          <span className="muted small">Average Score</span>
        </div>
        <div className="count sev-critical">
          <span className="n">{data.totals.totalCritical}</span>
          <span className="small">Critical Issues</span>
        </div>
        <div className="count sev-serious">
          <span className="n">{data.totals.totalSerious}</span>
          <span className="small">Serious Issues</span>
        </div>
      </section>

      {/* Sites Needing Attention */}
      {data.attentionSites.length > 0 && (
        <section
          aria-labelledby="attention-heading"
          className="callout"
          style={{ margin: '14pt 0' }}
        >
          <h3 id="attention-heading" style={{ margin: '0 0 4pt', color: 'var(--crit)' }}>
            Stores needing immediate attention ({data.attentionSites.length})
          </h3>
          <p className="small muted">
            Failed scans, new regressions, or low accessibility health requiring prompt developer
            review:
          </p>
          <ul style={{ margin: '4pt 0 0', fontSize: '9pt' }}>
            {data.attentionSites.map((s, idx) => (
              <li key={idx}>
                <strong>{s.name}</strong>: {s.reason}{' '}
                {s.score !== null ? `(Score: ${s.score})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Portfolio Sites Table */}
      <section aria-labelledby="sites-heading">
        <h2 id="sites-heading">Storefronts Overview ({data.sites.length})</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Store / Client</th>
              <th scope="col">Score</th>
              <th scope="col">Critical · Serious</th>
              <th scope="col">Regressions</th>
              <th scope="col">Verification</th>
              <th scope="col">Last Scanned</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((site) => (
              <tr key={site.id}>
                <td>
                  <strong>{site.name}</strong>
                  {site.clientName && <span className="muted"> · {site.clientName}</span>}
                  <div className="url muted">{site.rootUrl}</div>
                </td>
                <td>
                  <span className="score-number" style={{ fontWeight: 700 }}>
                    {site.score ?? '—'}
                  </span>{' '}
                  <span
                    className={`badge band-${site.scoreBand.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {site.scoreBand}
                  </span>
                </td>
                <td>
                  <span style={{ color: 'var(--crit)', fontWeight: 600 }}>
                    {site.critical} crit
                  </span>{' '}
                  · <span style={{ color: 'var(--ser)', fontWeight: 600 }}>{site.serious} ser</span>
                </td>
                <td>
                  {site.regressions > 0 ? (
                    <span style={{ color: 'var(--crit)', fontWeight: 600 }}>
                      {site.regressions} regression{site.regressions === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {site.verified ? (
                    <span
                      className="badge"
                      style={{ color: 'var(--ok)', background: 'var(--ok-soft)' }}
                    >
                      Verified
                    </span>
                  ) : (
                    <span
                      className="badge"
                      style={{ color: 'var(--ser)', background: 'var(--ser-soft)' }}
                    >
                      Pending
                    </span>
                  )}
                </td>
                <td className="muted small">
                  {site.lastScanAt ? new Date(site.lastScanAt).toLocaleDateString('en-GB') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Most Common Issues Across Sites */}
      <section aria-labelledby="common-heading">
        <h2 id="common-heading">Most Common Problems Across Sites</h2>
        <p className="muted small" style={{ marginBottom: '8pt' }}>
          Fix these patterns in your shared themes, navigation templates, or component libraries to
          resolve issues across multiple client storefronts at once.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Severity</th>
              <th scope="col">Problem / Rule</th>
              <th scope="col" className="num">
                Affected Stores
              </th>
              <th scope="col" className="num">
                Total Occurrences
              </th>
            </tr>
          </thead>
          <tbody>
            {data.commonIssues.map((issue) => (
              <tr key={issue.ruleId}>
                <td>
                  <span className={`badge sev-${issue.impact}`}>{issue.impact}</span>
                </td>
                <td>
                  <strong>{issue.title}</strong>
                  <div className="muted small">{issue.ruleId}</div>
                </td>
                <td className="num font-semibold">{issue.affectedSitesCount} stores</td>
                <td className="num">{issue.totalOccurrences}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Limitations />
    </Document>
  );
}

export interface EvidencePackScanItem {
  id: string;
  date: string;
  score: number | null;
  scoreBand: string;
  critical: number;
  serious: number;
  pagesScanned: number;
  status: string;
}

export interface EvidencePackFixedIssue {
  id: string;
  ruleId: string;
  title: string;
  impact: string;
  fixedAt: string;
  occurrences: number;
}

export interface EvidencePackOpenIssue {
  id: string;
  ruleId: string;
  title: string;
  impact: string;
  occurrences: number;
  assigneeName?: string | null;
  dueDate?: string | null;
}

export interface EvidencePackIgnoredIssue {
  id: string;
  ruleId: string;
  title: string;
  impact: string;
  reason: string;
  note?: string | null;
}

export interface EvidencePackManualCheck {
  id: string;
  checkType: string;
  performedAt: string;
  testerName: string;
  tool: string;
  result: 'pass' | 'issues_found' | 'partial';
  notes: string;
}

export interface EvidencePackPublishedStatement {
  version: number;
  publishedAt: string;
  targetStandard: string;
  conformanceStatus: string;
  publicUrl: string;
}

export interface EvidencePackReportData {
  siteName: string;
  rootUrl: string;
  dateRange: {
    start: string;
    end: string;
  };
  generatedAt: string;
  summary: {
    scansCount: number;
    latestScore: number | null;
    scoreBand: string;
    totalFixed: number;
    openIssuesCount: number;
    ignoredIssuesCount: number;
    manualChecksCount: number;
    statementPublished: boolean;
  };
  scans: EvidencePackScanItem[];
  fixedIssues: EvidencePackFixedIssue[];
  openIssues: EvidencePackOpenIssue[];
  ignoredIssues: EvidencePackIgnoredIssue[];
  manualChecks: EvidencePackManualCheck[];
  publishedStatement?: EvidencePackPublishedStatement | null;
}

/** R-03: Complete Accessibility Evidence Pack across automated and manual testing. */
export function EvidencePackReport({
  data,
  branding,
}: {
  data: EvidencePackReportData;
  branding?: ReportBranding;
}) {
  const title = 'Accessibility Evidence Pack';
  const orgDisplayName = branding?.displayName || data.siteName;

  return (
    <Document title={`${title} – ${data.siteName}`} branding={branding}>
      <header className="cover">
        {branding?.logoUrl && (
          <div style={{ marginBottom: '10pt' }}>
            <img
              src={branding.logoUrl}
              alt={orgDisplayName}
              style={{ maxHeight: '36pt', objectFit: 'contain' }}
            />
          </div>
        )}
        <h1>{title}</h1>
        <p className="site">
          {data.siteName} ({data.rootUrl})
        </p>
        <dl className="meta">
          <dt>Period Covered</dt>
          <dd>
            {data.dateRange.start} – {data.dateRange.end}
          </dd>
          <dt>Generated</dt>
          <dd>{new Date(data.generatedAt).toUTCString()}</dd>
          <dt>Evaluation Standard</dt>
          <dd>WCAG 2.2 Level AA (Automated &amp; Assistive Tech Testing)</dd>
          {branding?.displayName && (
            <>
              <dt>Prepared by</dt>
              <dd>{branding.displayName}</dd>
            </>
          )}
        </dl>
      </header>

      {/* Executive Summary Cards */}
      <section className="counts" aria-label="Evidence pack executive summary">
        <div className="count">
          <span className="n">{data.summary.latestScore ?? '—'}</span>
          <span className="muted small">Latest Score ({data.summary.scoreBand})</span>
        </div>
        <div className="count">
          <span className="n">{data.summary.scansCount}</span>
          <span className="muted small">Automated Scans</span>
        </div>
        <div className="count" style={{ borderColor: 'var(--ok)' }}>
          <span className="n" style={{ color: 'var(--ok)' }}>
            {data.summary.totalFixed}
          </span>
          <span className="small">Issues Remediated</span>
        </div>
        <div className="count">
          <span className="n">{data.summary.manualChecksCount}</span>
          <span className="muted small">Manual Tests</span>
        </div>
      </section>

      {/* Published Accessibility Statement Section */}
      <section aria-labelledby="statement-heading">
        <h2 id="statement-heading">Accessibility Statement Declaration</h2>
        {data.publishedStatement ? (
          <div className="callout" style={{ margin: '8pt 0' }}>
            <h3 style={{ margin: '0 0 4pt', color: 'var(--ok)' }}>
              Public Statement Active (Version {data.publishedStatement.version})
            </h3>
            <p className="small">
              <strong>Target Standard:</strong> {data.publishedStatement.targetStandard} ·{' '}
              <strong>Declared Status:</strong>{' '}
              {data.publishedStatement.conformanceStatus.replace('_', ' ')} ·{' '}
              <strong>Published:</strong>{' '}
              {new Date(data.publishedStatement.publishedAt).toLocaleDateString('en-GB')}
            </p>
            <p className="small" style={{ marginTop: '4pt' }}>
              <strong>Public URL:</strong>{' '}
              <a href={data.publishedStatement.publicUrl} target="_blank" rel="noopener noreferrer">
                {data.publishedStatement.publicUrl}
              </a>
            </p>
          </div>
        ) : (
          <p className="muted small">
            No public accessibility statement has been published yet for this site.
          </p>
        )}
      </section>

      {/* Scan History & Trend Table */}
      <section aria-labelledby="scans-heading">
        <h2 id="scans-heading">Automated Scan History ({data.scans.length})</h2>
        {data.scans.length === 0 ? (
          <p className="muted small">No automated scans recorded in this period.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Score</th>
                <th scope="col">Critical</th>
                <th scope="col">Serious</th>
                <th scope="col">Pages Tested</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.scans.map((scan) => (
                <tr key={scan.id}>
                  <td>
                    <strong>{scan.date}</strong>
                  </td>
                  <td>
                    {scan.score !== null ? (
                      <span>
                        <strong>{scan.score}</strong>{' '}
                        <span className="muted small">({scan.scoreBand})</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ color: 'var(--crit)', fontWeight: 600 }}>{scan.critical}</td>
                  <td style={{ color: 'var(--ser)', fontWeight: 600 }}>{scan.serious}</td>
                  <td>{scan.pagesScanned}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: scan.status === 'completed' ? 'var(--ok-soft)' : 'var(--bgs)',
                        color: scan.status === 'completed' ? 'var(--ok)' : 'var(--muted)',
                      }}
                    >
                      {scan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Remediated / Fixed Issues Table */}
      <section aria-labelledby="fixed-heading">
        <h2 id="fixed-heading">Remediated Issues ({data.fixedIssues.length})</h2>
        <p className="muted small" style={{ marginBottom: '6pt' }}>
          Documented evidence of verified fixes confirmed by automated scans during this period.
        </p>
        {data.fixedIssues.length === 0 ? (
          <p className="muted small">No issues were marked fixed during this period.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Issue Description</th>
                <th scope="col">WCAG Rule</th>
                <th scope="col">Date Verified</th>
                <th scope="col" className="num">
                  Occurrences
                </th>
              </tr>
            </thead>
            <tbody>
              {data.fixedIssues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <span className={`badge sev-${issue.impact}`}>{issue.impact}</span>
                  </td>
                  <td>
                    <strong>{issue.title}</strong>
                  </td>
                  <td className="muted small">{issue.ruleId}</td>
                  <td>{issue.fixedAt}</td>
                  <td className="num">{issue.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Open Issues Backlog */}
      <section aria-labelledby="open-heading">
        <h2 id="open-heading">Current Open Backlog ({data.openIssues.length})</h2>
        {data.openIssues.length === 0 ? (
          <p className="muted small">No open automated issues found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Issue Description</th>
                <th scope="col">Rule</th>
                <th scope="col">Assignee</th>
                <th scope="col">Due Date</th>
                <th scope="col" className="num">
                  Occurrences
                </th>
              </tr>
            </thead>
            <tbody>
              {data.openIssues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <span className={`badge sev-${issue.impact}`}>{issue.impact}</span>
                  </td>
                  <td>
                    <strong>{issue.title}</strong>
                  </td>
                  <td className="muted small">{issue.ruleId}</td>
                  <td>{issue.assigneeName || <span className="muted">Unassigned</span>}</td>
                  <td>{issue.dueDate || <span className="muted">—</span>}</td>
                  <td className="num">{issue.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Ignored Issues with Justification */}
      <section aria-labelledby="ignored-heading">
        <h2 id="ignored-heading">Ignored Findings &amp; Rationale ({data.ignoredIssues.length})</h2>
        {data.ignoredIssues.length === 0 ? (
          <p className="muted small">No issues were marked as ignored or false positive.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Issue</th>
                <th scope="col">Reason Category</th>
                <th scope="col">Documented Note</th>
              </tr>
            </thead>
            <tbody>
              {data.ignoredIssues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <span className={`badge sev-${issue.impact}`}>{issue.impact}</span>
                  </td>
                  <td>
                    <strong>{issue.title}</strong>
                    <div className="muted small">{issue.ruleId}</div>
                  </td>
                  <td>
                    <strong>{issue.reason}</strong>
                  </td>
                  <td className="small">{issue.note || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Manual Assistive Technology Audit Log */}
      <section aria-labelledby="manual-heading">
        <h2 id="manual-heading">
          Human &amp; Assistive Technology Checks ({data.manualChecks.length})
        </h2>
        <p className="muted small" style={{ marginBottom: '6pt' }}>
          Manual verification conducted with screen readers, keyboard navigation, and zoom tools.
        </p>
        {data.manualChecks.length === 0 ? (
          <p className="muted small">No manual checks recorded in this period.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Check Type</th>
                <th scope="col">Date</th>
                <th scope="col">Tester</th>
                <th scope="col">Tool / Environment</th>
                <th scope="col">Result</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.manualChecks.map((check) => (
                <tr key={check.id}>
                  <td>
                    <strong>{check.checkType.replace('_', ' ')}</strong>
                  </td>
                  <td>{check.performedAt}</td>
                  <td>{check.testerName}</td>
                  <td className="muted small">{check.tool}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          check.result === 'pass'
                            ? 'var(--ok-soft)'
                            : check.result === 'issues_found'
                              ? 'var(--crit-soft)'
                              : 'var(--ser-soft)',
                        color:
                          check.result === 'pass'
                            ? 'var(--ok)'
                            : check.result === 'issues_found'
                              ? 'var(--crit)'
                              : 'var(--ser)',
                      }}
                    >
                      {check.result.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="small">{check.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Methodology & Limitations */}
      <section aria-labelledby="limits-heading">
        <Limitations />
      </section>
    </Document>
  );
}

export interface ClientMonthlyReportData {
  siteName: string;
  clientName: string | null;
  rootUrl: string;
  reportPeriod: string;
  currentScore: number | null;
  previousScore: number | null;
  scoreDelta: number | null;
  totalIssues: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  fixedThisMonthCount: number;
  fixedIssues: Array<{ title: string; impact: string; fixedAt: string }>;
  topOpenIssues: Array<{ title: string; impact: string; selector: string; occurrences: number }>;
  scansCount: number;
}

/** R-04: Monthly Client Accessibility Report with Agency Branding. */
export function ClientMonthlyReport({
  data,
  branding,
}: {
  data: ClientMonthlyReportData;
  branding?: ReportBranding;
}) {
  const title = `Monthly Accessibility Report – ${data.reportPeriod}`;
  const agencyName = branding?.displayName || 'Agency Studio';

  return (
    <Document title={`${title} – ${data.siteName}`} branding={branding}>
      <header className="cover">
        {branding?.logoUrl && (
          <div style={{ marginBottom: '12pt' }}>
            <img
              src={branding.logoUrl}
              alt={agencyName}
              style={{ maxHeight: '40pt', maxWidth: '160pt', objectFit: 'contain' }}
            />
          </div>
        )}
        <p className="eyebrow">{agencyName} Client Report</p>
        <h1>{data.siteName}</h1>
        <p className="subtitle">
          Accessibility monitoring report for <strong>{data.reportPeriod}</strong>
          {data.clientName ? ` · Prepared for ${data.clientName}` : ''}
        </p>

        <dl className="meta-grid">
          <div>
            <dt>Target Site</dt>
            <dd>
              <a href={data.rootUrl}>{data.rootUrl}</a>
            </dd>
          </div>
          <div>
            <dt>Report Period</dt>
            <dd>{data.reportPeriod}</dd>
          </div>
          <div>
            <dt>Scans Run</dt>
            <dd>{data.scansCount} scans evaluated</dd>
          </div>
          <div>
            <dt>Issues Fixed</dt>
            <dd>{data.fixedThisMonthCount} resolved</dd>
          </div>
        </dl>
      </header>

      {/* Score Summary */}
      <section aria-labelledby="score-heading">
        <h2 id="score-heading">Accessibility Health & Score</h2>
        <div style={{ display: 'flex', gap: '24pt', alignItems: 'center', margin: '16pt 0' }}>
          <div
            style={{
              padding: '16pt 24pt',
              borderRadius: '8pt',
              border: '1pt solid #E5E7EB',
              background: '#F9FAFB',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32pt', fontWeight: 800, color: 'var(--primary)' }}>
              {data.currentScore !== null ? `${data.currentScore}` : '—'}
            </div>
            <div className="small" style={{ color: '#4B5563', marginTop: '4pt' }}>
              Conformance Score / 100
            </div>
            {data.scoreDelta !== null && data.scoreDelta !== 0 && (
              <div
                style={{
                  fontSize: '11pt',
                  fontWeight: 600,
                  marginTop: '4pt',
                  color: data.scoreDelta > 0 ? 'var(--ok)' : 'var(--crit)',
                }}
              >
                {data.scoreDelta > 0 ? `+${data.scoreDelta}` : data.scoreDelta} pts from previous
                month
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 10pt 0', fontSize: '11pt', lineHeight: 1.5 }}>
              During {data.reportPeriod}, continuous accessibility monitoring scanned your site
              pages against WCAG 2.2 AA standards. A total of{' '}
              <strong>{data.fixedThisMonthCount} issues</strong> were resolved, maintaining a
              current score of{' '}
              <strong>{data.currentScore !== null ? `${data.currentScore}/100` : '—'}</strong>.
            </p>
            <div style={{ display: 'flex', gap: '12pt', flexWrap: 'wrap' }}>
              <span className="badge badge-critical">{data.criticalCount} Critical</span>
              <span className="badge badge-serious">{data.seriousCount} Serious</span>
              <span className="badge badge-moderate">{data.moderateCount} Moderate</span>
              <span className="badge badge-minor">{data.minorCount} Minor</span>
            </div>
          </div>
        </div>
      </section>

      {/* Resolved Issues */}
      <section aria-labelledby="fixed-heading">
        <h2 id="fixed-heading">Resolved Issues ({data.fixedThisMonthCount})</h2>
        {data.fixedIssues.length === 0 ? (
          <p className="small" style={{ color: '#6B7280' }}>
            No previously identified issues were marked resolved during this period.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Rule / Description</th>
                <th scope="col" style={{ width: '80pt' }}>
                  Impact
                </th>
                <th scope="col" style={{ width: '90pt' }}>
                  Resolved
                </th>
              </tr>
            </thead>
            <tbody>
              {data.fixedIssues.slice(0, 15).map((f, i) => (
                <tr key={i}>
                  <td>{f.title}</td>
                  <td>
                    <span className={`badge badge-${f.impact}`}>{f.impact}</span>
                  </td>
                  <td className="small">{f.fixedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Top Open Issues */}
      <section aria-labelledby="open-heading">
        <h2 id="open-heading">Priority Items for Upcoming Sprint</h2>
        {data.topOpenIssues.length === 0 ? (
          <p className="small" style={{ color: '#16A34A', fontWeight: 600 }}>
            No high-severity open issues detected on scanned pages.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col" style={{ width: '80pt' }}>
                  Impact
                </th>
                <th scope="col">Example Selector</th>
                <th scope="col" style={{ width: '70pt', textAlign: 'right' }}>
                  Instances
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topOpenIssues.slice(0, 10).map((issue, i) => (
                <tr key={i}>
                  <td>{issue.title}</td>
                  <td>
                    <span className={`badge badge-${issue.impact}`}>{issue.impact}</span>
                  </td>
                  <td className="small" style={{ fontFamily: 'monospace' }}>
                    {issue.selector.slice(0, 40)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{issue.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="limits-heading">
        <Limitations />
      </section>
    </Document>
  );
}
