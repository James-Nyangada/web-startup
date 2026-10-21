# Runbook: Maintenance mode

Use for risky migrations, restores and server moves (P6-12).

## Turn on

Set `MAINTENANCE_MODE=true` in the environment of **web**, **api** and **worker**, then restart them.

- web (`proxy.ts`): every page shows `/maintenance` with HTTP 503 and `Retry-After: 600`.
- api: every request except `/health*` and `/internal/*` returns 503 `MAINTENANCE`. Paddle
  retries webhooks that get a non-2xx, so none are lost.
- worker: starts, but registers no job handlers and no cron schedules. Jobs wait in the queue.

Post on the status page before you start.

## Turn off

Unset `MAINTENANCE_MODE` (or set `false`) and restart the three services. The worker resumes the
queue; missed scheduled scans run on the next `scan.schedule` tick.

Check: `GET /health/deep` is 200, the home page loads, one scan completes.
