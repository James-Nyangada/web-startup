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
} from './components.js';
import { reportCss } from './styles.js';

function Document({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: reportCss }} />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

/** R-01: one-to-two page scan summary. */
export function ScanSummaryReport({ scan }: { scan: ScanResult }) {
  const title = 'Accessibility scan summary';
  return (
    <Document title={`${title} – ${scan.rootUrl}`}>
      <Cover scan={scan} title={title} />
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
export function FullReport({ scan }: { scan: ScanResult }) {
  const title = 'Accessibility scan report';
  const confirmed = scan.issues.filter((i) => !i.needsReview);
  const review = scan.issues.filter((i) => i.needsReview);
  return (
    <Document title={`${title} – ${scan.rootUrl}`}>
      <Cover scan={scan} title={title} />
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
