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
