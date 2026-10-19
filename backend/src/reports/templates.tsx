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
