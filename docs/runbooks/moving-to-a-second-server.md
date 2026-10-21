# Runbook: Moving to a second server

**When:** CPU, memory or disk on the single server stays above ~70 % (staff system panel,
`/staff/queues`), scan queues back up on most days, or availability needs exceed 99.5 %.

The app is built to split cleanly (spec 4): the web app never touches the database, the api is
stateless, and all background work is in the worker reading pg-boss from Postgres.

## Step 1: move the worker (biggest win)

Scans run Chromium and dominate CPU and memory.

1. Provision a second server (same region; ARM64 if the images are arm64).
2. Copy the worker's environment file; it needs `DATABASE_URL`, `R2_*`, `RESEND_API_KEY`,
   `ENCRYPTION_KEY`, `GEMINI_API_KEY`, `SCANNER_*`, `APP_URL`.
3. Allow the new server's IP in the database firewall.
4. Start the worker there: `docker compose up -d worker`.
5. Stop the worker on the first server. pg-boss hands jobs to whichever worker is running; two
   workers at once is also safe (jobs are claimed with row locks), so there is no downtime.
6. Watch `/staff/queues` for 30 minutes.

## Step 2: move the database (if self-hosted)

Prefer a managed Postgres (Supabase, which we already use, or similar) over running a replica by hand.

1. Turn on maintenance mode (`maintenance-mode.md`).
2. Take a fresh dump and restore it on the new database (`restore-from-backup.md`, steps 2–3).
3. Point `DATABASE_URL` for api and worker at the new database and restart.
4. Run `npm run db:migrate` (no-op if current), unset maintenance mode.

## Step 3: more API capacity

Run a second api container behind Caddy (`reverse_proxy api1:4000 api2:4000`). Things that are
per-process today and must move to Postgres first:

- Rate limits (`backend/src/lib/rate-limiter.ts` is in memory): sign-in, per-user, API-key and
  staff TOTP limits would otherwise be per instance.
- Live scan progress (SSE) already uses Postgres `NOTIFY`, so it works across instances.

## Checklist

- [ ] UptimeRobot monitors updated with the new hosts
- [ ] Backups still run (the backup job runs where Postgres is)
- [ ] Sentry release tags still set for each service
- [ ] Runbooks updated with new host names
