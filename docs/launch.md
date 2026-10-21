# Launch checklist (P6-13)

Launch happens when every box is ticked and the sign-off at the bottom is complete.
**[code]** = delivered in the repository; it still needs checking on production.
**[ops]** = must be done or verified on the live systems.

## 1. Product and data safety

- [ ] [code] All Phase 6 migrations applied on staging, then production (`0018_phase6_tables`, `0019_performance_indexes`), on a copy of production data first (DoD 0.2)
- [ ] [ops] Restore test done within the last 30 days and logged in `docs/runbooks/restore-from-backup.md`
- [ ] [ops] Nightly `pg_dump` → `age` → R2 running; last 3 nights present
- [ ] [ops] Org purge verified on staging: delete a test org, set `deleted_at` back 31 days, run `retention.prune`, confirm no rows (`database.test.ts` P6-09 test does the same in CI) and no R2 objects remain
- [ ] [ops] Personal data export end to end: request in S-48 → E-22 arrives → zip downloads and opens

## 2. Security (see `docs/security/asvs-l1.md`)

- [ ] [code] ASVS L1 review complete; open findings F-4 (new sign-in notice) and F-6 (dependency audit) closed or accepted
- [ ] [ops] `security.yml` green: `npm audit` (high/critical) and gitleaks
- [ ] [ops] Accepted risks R-1 – R-4 signed off by the product owner
- [ ] [ops] Production env: `AUTH_SECRET`, `ENCRYPTION_KEY` unique and in the password manager; `COOKIE_DOMAIN` set; `NODE_ENV=production`
- [ ] [ops] Web CSP enforced (not `CSP_REPORT_ONLY`) after a week of clean report-only on staging
- [ ] [ops] At least one staff account with TOTP enrolled; staff list reviewed (`docs/runbooks/staff-access.md`)
- [ ] [ops] Caddy: `/internal/*` returns 404 from the internet; on-demand TLS `ask` points at `/internal/tls-allowed`

## 3. Monitoring and alerts (spec 13.3)

- [ ] [ops] UptimeRobot monitors: `https://app.<domain>/sign-in`, `https://api.<domain>/health`, `https://api.<domain>/health/deep` (HTTP 200, plus a keyword monitor that alerts when `"warn"` appears: low disk or queue lag over 15 minutes), marketing home page
- [ ] [ops] **Alerts tested**: stop the api container on staging and confirm the email/SMS arrives within 5 minutes; same for a failing `/health/deep` (stop Postgres)
- [ ] [ops] Sentry for web, api and worker receiving events, release = git SHA; a test error triggered from each and an alert received
- [ ] [ops] Disk and queue alerts: `/health/deep` returns `"status":"warn"` under 10 % free disk or a job waiting over 15 minutes (runbooks `disk-full.md`, `scanner-stuck.md`)
- [ ] [ops] Public status page (UptimeRobot) published; `NEXT_PUBLIC_STATUS_URL` set so the footer, help centre and maintenance page link to it

## 4. Runbooks (`docs/runbooks/`)

- [x] [code] Restore from backup
- [x] [code] Rotate secrets
- [x] [code] Scanner stuck
- [x] [code] Disk full
- [x] [code] Paddle webhook replay
- [x] [code] Moving to a second server
- [x] [code] Maintenance mode, custom domain TLS, staff access
- [ ] [ops] Each runbook read by whoever is on call; host names filled in

## 5. Support and help

- [ ] [ops] `support@plainsight.io` mailbox live, with an auto-reply stating response time (one working day)
- [x] [code] Help centre basics: 10 articles at `/help`
- [ ] [ops] Help articles reviewed for accuracy against production behaviour
- [x] [code] API reference at `/developers/api`, served at `docs.<domain>` (`DOCS_HOST`)
- [ ] [ops] `docs.<domain>` DNS and Caddy site live

## 6. Legal (spec 16, open question 6)

- [ ] [ops] **Legal review** of Terms, Privacy Policy and DPA completed; "Last updated" dates set
- [ ] [ops] Subprocessors list matches production (Supabase added in Phase 6; confirm hosting provider and regions)
- [x] [code] DPA downloadable (`/legal/dpa/download`) with signature blocks
- [ ] [ops] Banned wording check: "compliant", "compliance guaranteed", "ADA-proof", "lawsuit protection", "100% accessible" (DoD 0.2). Phase 6 removed promises in emails, footer and blog; remaining uses are in the FAQ ("No tool can make a site compliant") and a blog post describing the law. Legal to confirm these are acceptable.

## 7. Billing

- [ ] [ops] Paddle live mode: price IDs, webhook secret, test purchase and refund on production
- [ ] [ops] Webhook endpoint reachable and signature verified (Paddle dashboard → test event)

## 8. Accessibility of our own product

- [ ] [ops] `web-ci.yml` axe audit green, including the Phase 6 screens (S-40, S-47, S-51, S-70 – S-75, help, API reference, 404, maintenance)
- [ ] [ops] Manual keyboard + NVDA + VoiceOver pass on the Phase 6 screens (spec 13.1), recorded like `docs/a11y/phase-2.md`

## 9. Performance (see `docs/performance.md`)

- [ ] [ops] Results table in `docs/performance.md` filled in on staging and within targets

## Sign-off

| Area | Name | Date |
| --- | --- | --- |
| Engineering | | |
| Security | | |
| Legal | | |
| Product owner | | |
