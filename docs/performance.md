# Performance pass (P6-11)

Targets come from spec 13.1. This page records what was changed in Phase 6, how to measure,
and the results table to fill in on staging. **Nothing below is a measured number yet**: the
review sandbox had no database, network or production build.

## Targets

| Area | Target | How to measure |
| --- | --- | --- |
| App pages (p75, signed in) | LCP < 2.0 s, interaction latency < 200 ms | Lighthouse (desktop, "mid-range laptop" throttling) on S-20, S-21, S-24, S-25, S-26 against staging; Sentry performance p75 once live |
| API | p95 < 300 ms reads, < 800 ms writes | Request logs (`pino-http` `responseTime`) on staging for a week: `jq` p95 per route |
| Scan throughput | ≥ 250 pages in < 15 min on 2 OCPU; free check < 60 s | `SCANNER_LOAD_TESTS=1` 250-page test (P1-08) and the queue load test below |
| Queue under load | 50 scans queued: all finish, memory stable | `npm run load:queue` (below) |

## What changed

### Indexes (migration `0019_performance_indexes`)

Reviewed the repository queries that run most often or on the largest tables:

| # | Query (where) | Before | Index now used |
| --- | --- | --- | --- |
| 1 | Due scheduled scans, every 10 min (`sites.findDueForScheduledScan`) | Scan of `sites` filtered by status and `next_scan_at` | `sites_due_scan_idx` partial on `next_scan_at` where active and not deleted |
| 2 | Retention prune of `issue_occurrences` by org and age (daily) | `org_id` only, then filter | `issue_occurrences_org_created_idx (org_id, created_at)` |
| 3 | Retention prune of `page_results` by org and age | `org_id` only | `page_results_org_created_idx (org_id, created_at)` |
| 4 | Org scan history, retention raw-file cutoff, staff "last activity" | `scans_org_id_idx` + sort | `scans_org_queued_idx (org_id, queued_at desc)` (replaces the plain `org_id` index) |
| 5 | Staff metrics: scans in a time window, all orgs | Seq scan | `scans_queued_at_idx` |
| 6 | Free checks: global daily cap and staff leads list | Seq scan | `free_checks_created_idx (created_at desc)` |
| 7 | Audit log by actor (S-51 filter, personal data export) | Seq scan | `audit_log_actor_created_idx` partial where `actor_id` not null |
| 8 | S-51 audit log page (org, newest first, keyset cursor) | Offset paging | Existing `audit_log_org_created_idx`; now keyset `(created_at, id) <` cursor, constant time per page |
| 9 | Issues list per site by status and impact | — | Existing `issues_site_status_impact_idx` (no change needed) |
| 10 | My tasks (org, assignee) | — | Existing `issues_org_assignee_idx` (no change needed) |

The `org_id`-only indexes dropped in 0019 are covered by the new composite indexes, which lead with `org_id`.

To confirm on staging (copy of production data), run each with `EXPLAIN (ANALYZE, BUFFERS)` and
record the plan node and time below:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.* FROM sites s JOIN organizations o ON o.id = s.org_id
 WHERE s.status = 'active' AND s.deleted_at IS NULL AND s.next_scan_at IS NOT NULL
   AND s.next_scan_at <= now() AND o.deleted_at IS NULL
   AND o.billing_status NOT IN ('read_only', 'paused', 'canceled')
 ORDER BY s.next_scan_at LIMIT 20;
```

### Other changes

- **Audit log** uses keyset pagination instead of a fixed `limit` (P6-08).
- **Staff org list** computes site counts and last activity with correlated subqueries that use
  indexes 4 and the existing `audit_log_org_created_idx`.
- **API keys** record `last_used_at` at most once a minute per key, so API traffic does not turn
  every read into a write.
- **Logos** are limited to 1 MB and 1000 × 1000 px (P6-10), keeping portal and report images small;
  they are served with a one-year immutable cache header.
- **Web**: the API reference is regenerated at most every 5 minutes (`revalidate = 300`); help
  articles are statically generated (`generateStaticParams`).

## Bundle analysis

```bash
cd web
npx next experimental-analyze     # Next 16.1+: interactive treemap of client bundles
```

Look for: GSAP loaded on app pages that do not animate, the fix-guide data (`lib/fix-guides-data.ts`,
740 lines) pulled into client bundles, and duplicated date libraries. Record the first-load JS of
S-20, S-25 and `/` below.

## Load test: 50 scans queued

```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/app_test npm run load:queue -- --sites 50 --pages 10
```

`tests/load/queue-load.ts` creates 50 throwaway orgs with one verified site each, pointed at the
local fixture store, queues a manual scan for each, runs the real worker handlers in-process and
prints every 5 s: scans done, queue depths and memory (node + Chromium). It ends with run-time and
queue-wait percentiles, peak memory, and purges the orgs. Exit code 1 if any scan failed or the
run timed out (default 60 min).

Expected on the 2-OCPU server with `SCANNER_CONCURRENCY=2` (one scan at a time per worker):
scans run strictly one after another, so wall time ≈ 50 × single-scan time; memory must stay flat
(no growth from scan to scan) and under 2 GB.

## Results (fill in on staging)

| Measurement | Target | Result | Date |
| --- | --- | --- | --- |
| LCP p75, S-25 Issues | < 2.0 s | | |
| INP, S-25 filters | < 200 ms | | |
| API p95 reads | < 300 ms | | |
| API p95 writes | < 800 ms | | |
| 250-page scan | < 15 min | | |
| Free check | < 60 s | | |
| 50 queued scans: failures | 0 | | |
| 50 queued scans: peak memory | < 2 GB, flat | | |
| First-load JS `/` | (record) | | |
