import { scoreBand } from '../scanner/results/score.js';
import { RULE_CATALOG, ruleInfo, type Impact } from '../scanner/rules/catalog.js';
import type { FoundIssue } from '../scanner/results/issues.js';
import type { ScanResult } from '../scanner/scan.js';

export const IMPACTS: Impact[] = ['critical', 'serious', 'moderate', 'minor'];

const STANDARD_LABEL = {
  wcag21aa: 'WCAG 2.1 level A and AA',
  wcag22aa: 'WCAG 2.2 level A and AA',
} as const;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC';

const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};

export function SeverityBadge({ impact }: { impact: Impact }) {
  return <span className={`badge sev-${impact}`}>{impact}</span>;
}

export function Cover({ scan, title }: { scan: ScanResult; title: string }) {
  return (
    <header className="cover">
      <h1>{title}</h1>
      <p className="site">{scan.rootUrl}</p>
      <dl className="meta">
        <dt>Scanned</dt>
        <dd>{formatDate(scan.finishedAt)}</dd>
        <dt>Standard checked</dt>
        <dd>{STANDARD_LABEL[scan.standard]} (automated checks only)</dd>
        <dt>Pages tested</dt>
        <dd>
          {scan.pagesScanned} of {scan.pagesPlanned} planned
          {scan.pagesFailed > 0 && ` (${scan.pagesFailed} could not be tested)`}, chosen from{' '}
          {scan.pagesDiscovered} pages found
        </dd>
        <dt>Scan status</dt>
        <dd>
          {scan.status === 'completed'
            ? 'Completed'
            : scan.status === 'partial'
              ? 'Partial: some pages failed'
              : 'Failed'}
        </dd>
      </dl>
    </header>
  );
}

export function ScoreBlock({ scan }: { scan: ScanResult }) {
  if (scan.score === null) {
    return (
      <section aria-labelledby="score-heading">
        <h2 id="score-heading">Automated check score</h2>
        <p>No pages could be tested, so there is no score for this scan.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="score-heading">
      <h2 id="score-heading">Automated check score</h2>
      <div className="score">
        <p className="value" aria-label={`Score ${scan.score} out of 100`}>
          {scan.score}
          <span className="small muted">/100</span>
        </p>
        <div>
          <p className="band">{scoreBand(scan.score)}</p>
          <p className="small">
            The share of automated checks that passed across the tested pages, weighted by how
            severe each problem is. It is a way to track progress over time, not a measure of
            compliance: automated tools find only part of the problems people with disabilities
            face.
          </p>
        </div>
      </div>
    </section>
  );
}

export function CountsBlock({ scan }: { scan: ScanResult }) {
  return (
    <section aria-labelledby="counts-heading">
      <h2 id="counts-heading">Problems found</h2>
      <div className="counts">
        {IMPACTS.map((impact) => (
          <div key={impact} className={`count sev-${impact}`}>
            <span className="n">{scan.counts[impact]}</span>
            <span style={{ textTransform: 'capitalize' }}>{impact}</span>
          </div>
        ))}
      </div>
      <p className="small muted">
        Each problem is counted once per page template, however many pages it appears on.
        {scan.counts.needsReview > 0 &&
          ` A further ${scan.counts.needsReview} item(s) could not be decided automatically and need a person to check them.`}
      </p>
    </section>
  );
}

export function TopIssuesTable({ issues, limit }: { issues: FoundIssue[]; limit: number }) {
  const rows = issues.filter((i) => !i.needsReview).slice(0, limit);
  if (rows.length === 0)
    return <p>No problems were found by the automated checks on the tested pages.</p>;
  return (
    <table>
      <caption className="small muted" style={{ textAlign: 'left' }}>
        Most important problems first: by severity, then by how often they occur.
      </caption>
      <thead>
        <tr>
          <th scope="col">Severity</th>
          <th scope="col">Problem</th>
          <th scope="col">WCAG</th>
          <th scope="col">Page type</th>
          <th scope="col" className="num">
            Found
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((issue) => (
          <tr key={issue.fingerprint}>
            <td>
              <SeverityBadge impact={issue.impact} />
            </td>
            <td>{ruleInfo(issue.ruleId).title}</td>
            <td>{issue.wcagCriteria.join(', ')}</td>
            <td>{issue.templateKey}</td>
            <td className="num">{issue.occurrenceCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function IssueDetail({
  issue,
  maxOccurrences = 10,
}: {
  issue: FoundIssue;
  maxOccurrences?: number;
}) {
  const info = ruleInfo(issue.ruleId);
  const shown = issue.occurrences.slice(0, maxOccurrences);
  return (
    <article className="issue" aria-labelledby={`issue-${issue.fingerprint.slice(0, 12)}`}>
      <h3 id={`issue-${issue.fingerprint.slice(0, 12)}`}>
        {info.title} <SeverityBadge impact={issue.impact} />
      </h3>
      <p>{info.description}</p>
      <p className="small">
        <strong>WCAG:</strong> {issue.wcagCriteria.join(', ')} (level {issue.wcagLevel}) ·{' '}
        <strong>Page type:</strong> {issue.templateKey} · <strong>Found:</strong>{' '}
        {issue.occurrenceCount} time(s) on {issue.pageUrls.length} page(s) ·{' '}
        <a href={info.helpUrl}>Technical details</a>
      </p>
      {info.whoIsAffected.length > 0 && (
        <p className="small">
          <strong>Who is affected:</strong> {info.whoIsAffected.join('; ')}.
        </p>
      )}
      <p className="small">
        <strong>Example element:</strong>
      </p>
      <pre>{issue.htmlSnippet}</pre>
      {issue.failureSummary && <pre>{issue.failureSummary}</pre>}
      <p className="small">
        <strong>Where:</strong>
      </p>
      <ul className="small">
        {shown.map((o) => (
          <li key={`${o.pageUrl}|${o.target}`}>
            <span className="url">{pathOf(o.pageUrl)}</span> — <code>{o.target}</code>
          </li>
        ))}
        {issue.occurrences.length > shown.length && (
          <li>…and {issue.occurrences.length - shown.length} more</li>
        )}
      </ul>
    </article>
  );
}

export function PagesTable({ scan }: { scan: ScanResult }) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Page</th>
          <th scope="col">Type</th>
          <th scope="col">Result</th>
          <th scope="col" className="num">
            Score
          </th>
          <th scope="col" className="num">
            Problems
          </th>
        </tr>
      </thead>
      <tbody>
        {scan.pages.map((page) => (
          <tr key={page.url}>
            <td className="url">{pathOf(page.url)}</td>
            <td>{page.templateKey}</td>
            <td>
              {page.status === 'ok' ? 'Tested' : `Not tested (${page.status.replace('_', ' ')})`}
            </td>
            <td className="num">{page.score ?? '–'}</td>
            <td className="num">{page.status === 'ok' ? page.violations : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Always present (P1-13 acceptance). */
export function Limitations() {
  return (
    <section aria-labelledby="limits-heading">
      <h2 id="limits-heading">What automated testing cannot check</h2>
      <p>
        Automated tools reliably detect only a portion of accessibility problems. This report does
        not show that the site is accessible or that it meets WCAG. A person still needs to check,
        for example:
      </p>
      <ul className="limits">
        <li>
          Whether every task can be completed using only a keyboard, with a visible focus indicator
          throughout.
        </li>
        <li>
          Whether the site makes sense with a screen reader: reading order, announcements and
          dynamic updates.
        </li>
        <li>
          Whether alt text, link text, headings and labels are accurate and meaningful, not just
          present.
        </li>
        <li>
          Whether videos have accurate captions and audio description, and audio has transcripts.
        </li>
        <li>
          Whether content works at 200% zoom and at 320 px wide without loss of content or function.
        </li>
        <li>
          Whether forms explain errors clearly and let people correct them; time limits can be
          extended.
        </li>
        <li>
          Whether colour is used as the only way to convey meaning, and whether motion can be
          paused.
        </li>
        <li>Pages behind a login, checkout steps, and pages not included in the tested sample.</li>
      </ul>
    </section>
  );
}

export function Methodology({ scan }: { scan: ScanResult }) {
  return (
    <section aria-labelledby="method-heading">
      <h2 id="method-heading">How this scan was done</h2>
      <p className="small">
        Pages were found from the site&apos;s robots.txt and sitemaps
        {scan.discovery.crawled ? ' and by following links' : ''}, grouped by page type, and a
        sample was tested in Chromium at 1280×800 with reduced motion. Each page was checked with
        axe-core {scan.axeVersion} (engine {scan.engineVersion}) against{' '}
        {STANDARD_LABEL[scan.standard]} rules ({RULE_CATALOG.size} automated rules). Problems on the
        same element of the same page type are counted once. The robots.txt rules of the site were
        respected.
      </p>
    </section>
  );
}
