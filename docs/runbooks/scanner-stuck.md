# Runbook: Scanner stuck

**Alert:** `GET /health/deep` shows `checks.queue.status = "warn"`: a job has been ready for over 15 minutes without a worker taking it.

**Symptoms:** scans sit in `queued`, `discovering` or `scanning` for a long time; customers
report "scan never finishes"; the staff queue screen (S-72, `/staff/queues`) shows `scan.run`
ready count growing while running stays at 0, or failed (dead) jobs piling up.

## 1. Look

1. `/staff/queues`: check `scan.run` and `scan.process`. Open **Jobs → Failed** to read errors.
2. `/staff/queues` server panel: memory above 90 % or disk above 90 % → go to `disk-full.md`
   or restart the worker (step 3).
3. Worker logs: `docker compose logs --tail 200 worker`. Look for Chromium launch errors,
   `ECONNREFUSED` to Postgres, or `Timeout`.
4. A single site timing out (slow host, bot protection) only fails that scan; the scan's error
   hint on the site page tells the customer what to do.

## 2. Common causes

| Cause | Fix |
| --- | --- |
| Worker container stopped or crash-looping | `docker compose up -d worker`; check logs for the crash |
| `MAINTENANCE_MODE=true` left on | Worker logs say so at start. Unset it and restart the worker |
| Chromium cannot start (missing libs after image change) | Rebuild image; `npx playwright install --with-deps chromium` in the image |
| Out of memory with high `SCANNER_CONCURRENCY` | Lower to 2 (default), restart worker |
| Postgres connection pool exhausted | Restart worker; check `DATABASE_POOL_MAX` against the database's limit |
| One huge site blocking the single scan lane | Cancel that scan from its page; scans are limited to 25 min by pg-boss expiry |

## 3. Recover

- Restarting the worker is safe: on start it re-queues scans that were interrupted
  (`recoverInterruptedScans`), and pg-boss retries `scan.run` twice with a 5-minute backoff.
- Retry dead jobs from `/staff/queues` once the cause is fixed. Delete dead jobs that are no longer
  useful (for example scans of deleted sites).
- After recovery, check one scan finishes end to end: run **Scan now** on a test site.

## 4. Tell customers

If scheduled scans were delayed more than a day, post on the status page. Missed scheduled scans
are picked up on the next `scan.schedule` tick (every 10 minutes); there is nothing for customers to do.
