/**
 * P6-11 / spec 13.2 load test: queue 50 site scans against the local fixture store and watch
 * the queue drain, scan durations and memory.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/app_test \
 *     npx tsx tests/load/queue-load.ts --sites 50 --pages 10
 *
 * Needs a disposable Postgres (it creates and then purges its own orgs) and Chromium
 * (`npx playwright install chromium`). Refuses to run with NODE_ENV=production.
 */
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createDb, createPool } from '../../src/db/client.js';
import { asOrgId, createRepositories } from '../../src/db/repositories/index.js';
import { runMigrations } from '../../src/db/scripts/migrate.js';
import { ensureRulesSeeded } from '../../src/db/seed-rules.js';
import { strictPolicy } from '../../src/scanner/net/guard.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import {
  createBoss,
  enqueueScanRun,
  ensureQueues,
  registerWorkers,
} from '../../src/worker/boss.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { startFixtureSite } from '../fixtures/site/fixture-site.js';

const { values } = parseArgs({
  options: {
    sites: { type: 'string', default: '50' },
    pages: { type: 'string', default: '10' },
    'timeout-min': { type: 'string', default: '60' },
  },
});

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production.');
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable Postgres database.');

const SITES = Number(values.sites);
const PAGES = Number(values.pages);
const TIMEOUT_MS = Number(values['timeout-min']) * 60_000;

function chromiumRssBytes(): number {
  try {
    const out = execFileSync('ps', ['-eo', 'rss=,comm='], { encoding: 'utf8' });
    return (
      out
        .split('\n')
        .filter((l) => /chrom|headless_shell/i.test(l))
        .reduce((sum, l) => sum + Number(l.trim().split(/\s+/)[0] ?? 0), 0) * 1024
    );
  } catch {
    return 0;
  }
}

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : 0;

const pool = createPool({ url, ssl: process.env.TEST_DATABASE_SSL === 'true' });
const db = createDb(pool);
await runMigrations(db);
await ensureRulesSeeded(db);
const repos = createRepositories(db);
const fixture = await startFixtureSite();
const boss = createBoss({ connectionString: url });
await boss.start();
await ensureQueues(boss);

const ctx: WorkerContext = {
  repos,
  storage: new MemoryStorageService(),
  boss,
  pool,
  autoProcess: false,
  scannerConcurrency: Number(process.env.SCANNER_CONCURRENCY) || 2,
  // The fixture store is on 127.0.0.1: allow private addresses for this run only.
  scannerPolicy: {
    ...strictPolicy,
    allowedPorts: [fixture.port],
    isAllowedAddress: () => true,
  },
};

console.log(`Queueing ${SITES} scans of ${PAGES} pages against http://127.0.0.1:${fixture.port}`);
const orgIds: string[] = [];
const scanIds: string[] = [];
for (let i = 0; i < SITES; i++) {
  const org = await repos.organizations.create({
    name: `Load test ${i}`,
    slug: `load-test-${Date.now()}-${i}`,
    plan: 'agency_pro',
    billingStatus: 'active',
  });
  const orgId = asOrgId(org!.id);
  orgIds.push(orgId);
  const site = await repos.sites.create(orgId, {
    name: `Fixture ${i}`,
    rootUrl: `http://127.0.0.1:${fixture.port}`,
    platform: 'shopify',
    scanFrequency: 'manual',
    pageLimit: PAGES,
  });
  await repos.sites.setVerified(orgId, site.id, 'file');
  const scan = await repos.scans.create(orgId, {
    siteId: site.id,
    trigger: 'manual',
    standard: 'wcag22aa',
    pagesPlanned: PAGES,
  });
  scanIds.push(scan!.id);
  await enqueueScanRun(boss, scan!.id);
}

const started = Date.now();
let peakRss = 0;
await registerWorkers(boss, ctx);

const finished = new Set(['completed', 'partial', 'failed', 'canceled']);
while (Date.now() - started < TIMEOUT_MS) {
  const rss = process.memoryUsage().rss + chromiumRssBytes();
  peakRss = Math.max(peakRss, rss);
  const { rows } = await pool.query<{ status: string; n: number }>(
    `select status, count(*)::int as n from scans where id = any($1::uuid[]) group by status`,
    [scanIds],
  );
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const done = rows.filter((r) => finished.has(r.status)).reduce((s, r) => s + r.n, 0);
  const queues = await boss.getQueues(['scan.run', 'scan.process']);
  console.log(
    `${Math.round((Date.now() - started) / 1000)}s  done ${done}/${SITES}  ${JSON.stringify(counts)}  ` +
      `queued ${queues.map((q) => `${q.name}=${q.queuedCount}/${q.activeCount}`).join(' ')}  rss ${mb(rss)}`,
  );
  if (done === SITES) break;
  await new Promise((r) => setTimeout(r, 5_000));
}

const { rows: durations } = await pool.query<{ ms: number; status: string; queue_ms: number }>(
  `select extract(epoch from (finished_at - started_at)) * 1000 as ms,
          extract(epoch from (started_at - queued_at)) * 1000 as queue_ms, status
     from scans where id = any($1::uuid[]) and finished_at is not null`,
  [scanIds],
);
const runMs = durations.map((d) => Number(d.ms)).sort((a, b) => a - b);
const waitMs = durations.map((d) => Number(d.queue_ms)).sort((a, b) => a - b);
const failed = durations.filter((d) => d.status === 'failed').length;

console.log('\n--- Load test report ---');
console.log(`Scans finished: ${durations.length}/${SITES} (failed ${failed})`);
console.log(`Wall time: ${Math.round((Date.now() - started) / 1000)} s`);
console.log(
  `Scan run time p50 ${Math.round(pct(runMs, 50))} ms, p95 ${Math.round(pct(runMs, 95))} ms`,
);
console.log(
  `Queue wait p50 ${Math.round(pct(waitMs, 50) / 1000)} s, p95 ${Math.round(pct(waitMs, 95) / 1000)} s`,
);
console.log(`Peak memory (node + Chromium): ${mb(peakRss)}`);

await boss.stop({ graceful: false, timeout: 5_000 });
for (const orgId of orgIds) await repos.retention.purgeOrganization(asOrgId(orgId));
await fixture.close();
await pool.end();
process.exit(durations.length === SITES && failed === 0 ? 0 : 1);
