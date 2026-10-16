import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { discover } from '../discovery/discover.js';
import { createGuardedFetch } from '../net/guarded-fetch.js';
import { planScan } from '../plan.js';
import type { ScanLogger } from '../types.js';
import { normalizeUrl } from '../url/normalize.js';

const DEFAULT_USER_AGENT = 'PRODUCT_NAMEBot/1.0 (+https://example.com/bot)';

const usage = `Usage: npm run scan:discover -- <url> [options]

Finds the pages of a site and shows which ones a scan would test.

Options:
  --limit <n>       Pages to plan (default 50)
  --pin <url>       Always include this URL (repeatable)
  --exclude <glob>  Skip matching paths, e.g. "/blog/**" (repeatable)
  --seed <text>     Sampling seed (default: the site's host)
  --out <file>      Also write the full result as JSON
  --verbose         Show debug messages
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '50' },
    pin: { type: 'string', multiple: true, default: [] },
    exclude: { type: 'string', multiple: true, default: [] },
    seed: { type: 'string' },
    out: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const input = positionals[0];
if (values.help || !input) {
  console.log(usage);
  process.exit(input ? 0 : 1);
}

const rootUrl = normalizeUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
const limit = Number(values.limit);
if (!rootUrl || !Number.isInteger(limit) || limit < 1) {
  console.error(usage);
  process.exit(1);
}

const log: ScanLogger = {
  debug: (message, data) => values.verbose && console.error(`  · ${message}`, data ?? ''),
  warn: (message, data) => console.error(`  ! ${message}`, data ?? ''),
};

const userAgent = process.env.SCANNER_USER_AGENT || DEFAULT_USER_AGENT;
const started = performance.now();
console.error(`Discovering ${rootUrl} as "${userAgent}"`);

const discovery = await discover({
  rootUrl,
  pinnedUrls: values.pin,
  excludedPaths: values.exclude,
  fetch: createGuardedFetch({ userAgent }),
  userAgent,
  log,
  onProgress: (message) => console.error(`  ${message}`),
});

const plan = planScan({
  discovery,
  pageLimit: limit,
  seed: values.seed ?? new URL(rootUrl).host,
});

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `\n${discovery.urls.length} URL(s) found in ${seconds}s, ${plan.templates.length} template(s)`,
);
console.log(`Platform: ${discovery.platform.platform}`);
console.log(
  `Dropped (other host, skipped pattern, excluded or disallowed): ${discovery.stats.dropped}`,
);

console.log('\nTemplates (largest first):');
console.table(plan.templates.slice(0, 20).map((t) => ({ template: t.key, urls: t.count })));
if (plan.templates.length > 20) console.log(`…and ${plan.templates.length - 20} more`);

console.log(`\nPlanned pages (${plan.planned.length} of limit ${limit}):`);
console.table(plan.planned.map((p) => ({ url: p.url, template: p.templateKey, why: p.reason })));

if (values.out) {
  await writeFile(values.out, JSON.stringify({ discovery, plan }, null, 2));
  console.log(`Full result written to ${values.out}`);
}
