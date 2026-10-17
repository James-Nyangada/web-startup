import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { strictPolicy, type GuardPolicy } from '../net/guard.js';
import { scoreBand } from '../results/score.js';
import { ruleInfo } from '../rules/catalog.js';
import { runScan, type ScanResult } from '../scan.js';
import { STANDARDS, type ScanLogger, type Standard } from '../types.js';
import { normalizeUrl } from '../url/normalize.js';

const DEFAULT_USER_AGENT = 'PRODUCT_NAMEBot/1.0 (+https://example.com/bot)';

const usage = `Usage: npm run scan -- <url> [options]

Scans a site for automatically detectable accessibility problems (WCAG A/AA).

Options:
  --limit <n>         Pages to test (default 25)
  --standard <s>      wcag22aa (default) or wcag21aa
  --concurrency <n>   Pages tested in parallel (default: SCANNER_CONCURRENCY or 2)
  --pin <url>         Always test this URL (repeatable)
  --exclude <glob>    Skip matching paths, e.g. "/blog/**" (repeatable)
  --out <file>        Write the full result as JSON
  --pdf <file>        Write a PDF report (see --report and --paper)
  --report <type>     summary (R-01) or full (R-02, default)
  --paper <size>      a4 (default) or letter
  --allow-private     Development only: allow localhost/private addresses (fixture store)
  --verbose           Show debug messages
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '25' },
    standard: { type: 'string', default: 'wcag22aa' },
    concurrency: { type: 'string' },
    pin: { type: 'string', multiple: true, default: [] },
    exclude: { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
    pdf: { type: 'string' },
    report: { type: 'string', default: 'full' },
    paper: { type: 'string', default: 'a4' },
    'allow-private': { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const fail = (message: string): never => {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
};

const input = positionals[0];
if (values.help || !input) {
  console.log(usage);
  process.exit(input ? 0 : 1);
}

const rootUrl =
  normalizeUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`) ??
  fail(`Not a valid URL: ${input}`);
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) fail('--limit must be a positive whole number');
if (!STANDARDS.includes(values.standard as Standard))
  fail('--standard must be wcag22aa or wcag21aa');
if (!['summary', 'full'].includes(values.report)) fail('--report must be summary or full');
if (!['a4', 'letter'].includes(values.paper)) fail('--paper must be a4 or letter');
const concurrency = Number(values.concurrency ?? process.env.SCANNER_CONCURRENCY ?? 2);

let policy: GuardPolicy = strictPolicy;
if (values['allow-private']) {
  if (process.env.NODE_ENV === 'production') fail('--allow-private is not available in production');
  policy = {
    ...strictPolicy,
    allowedPorts: Array.from({ length: 65_535 }, (_, i) => i + 1),
    isAllowedAddress: () => true,
  };
  console.error('! --allow-private: SSRF protection is OFF for this run');
}

const log: ScanLogger = {
  debug: (message, data) => values.verbose && console.error(`  · ${message}`, data ?? ''),
  warn: (message, data) => console.error(`  ! ${message}`, data ?? ''),
};

const userAgent = process.env.SCANNER_USER_AGENT || DEFAULT_USER_AGENT;
console.error(`Scanning ${rootUrl} (${values.standard}, up to ${limit} pages)`);

const result = await runScan({
  rootUrl,
  pageLimit: limit,
  standard: values.standard as Standard,
  userAgent,
  pinnedUrls: values.pin,
  excludedPaths: values.exclude,
  concurrency,
  policy,
  ...(values['allow-private'] && { requestIntervalMs: 0 }),
  log,
  onProgress: (p) => {
    if (p.message) console.error(`  ${p.message}`);
  },
});

for (const [i, page] of result.pages.entries()) {
  const marker = page.status === 'ok' ? '✓' : '✗';
  const detail =
    page.status === 'ok'
      ? `score ${page.score}, ${page.violations} problem(s), ${page.loadMs} ms`
      : `${page.status}${page.httpStatus ? ` ${page.httpStatus}` : ''}${page.error ? `: ${page.error}` : ''}`;
  console.error(
    `  [${String(i + 1).padStart(3)}/${result.pagesPlanned}] ${marker} ${page.url}  (${detail})`,
  );
}

printSummary(result);

if (values.out) {
  await writeFile(
    values.out,
    JSON.stringify(result, (key, value: unknown) => (key === 'pageResults' ? undefined : value), 2),
  );
  console.log(`\nFull result written to ${values.out}`);
}

if (values.pdf) {
  const { renderReportPdf } = await import('../../reports/render.js');
  const pdf = await renderReportPdf(result, {
    type: values.report as 'summary' | 'full',
    paper: values.paper as 'a4' | 'letter',
  });
  await writeFile(values.pdf, pdf);
  console.log(`PDF report written to ${values.pdf}`);
}

function printSummary(scan: ScanResult) {
  const seconds = ((Date.parse(scan.finishedAt) - Date.parse(scan.startedAt)) / 1000).toFixed(1);
  console.log(`\n${scan.rootUrl} — ${scan.status} in ${seconds}s`);
  console.log(
    `Platform: ${scan.platform} · axe-core ${scan.axeVersion} · engine ${scan.engineVersion} · ${scan.standard}`,
  );
  console.log(
    `Pages: ${scan.pagesScanned} tested, ${scan.pagesFailed} failed, ${scan.pagesDiscovered} discovered in ${scan.templatesFound} template(s)`,
  );
  if (scan.score !== null)
    console.log(`Automated check score: ${scan.score}/100 (${scoreBand(scan.score)})`);
  console.log(
    `Issues: ${scan.counts.critical} critical, ${scan.counts.serious} serious, ${scan.counts.moderate} moderate, ${scan.counts.minor} minor` +
      (scan.counts.needsReview ? `, ${scan.counts.needsReview} need a manual check` : ''),
  );
  const top = scan.issues.filter((i) => !i.needsReview).slice(0, 15);
  if (top.length) {
    console.table(
      top.map((issue) => ({
        impact: issue.impact,
        problem: ruleInfo(issue.ruleId).title.slice(0, 60),
        wcag: issue.wcagCriteria.join(', '),
        template: issue.templateKey,
        found: issue.occurrenceCount,
      })),
    );
  }
  console.log(
    'Automated testing finds only some accessibility problems. A clean result does not mean a site is accessible.',
  );
}
