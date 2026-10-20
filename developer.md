# Developer Specification — Accessibility Monitoring SaaS

**Version:** 1.0 · **Date:** 15 October 2026 · **Owner:** Godfrey Evans Ochieng Nyangada
**Companion documents:** `DESIGN_SPEC.md` (UX/UI), *Build Blueprint & Go-to-Market* (strategy)

> **Working name.** The product name is not final. This document uses `PRODUCT_NAME` in copy and `app` in code identifiers. Replace with one search-and-replace when the name is chosen.

---

## Contents

- [0. How to use this document](#0-how-to-use-this-document)
- [1. Product summary](#1-product-summary)
- [2. Tech stack (fixed)](#2-tech-stack-fixed)
- [3. Environments and configuration](#3-environments-and-configuration)
- [4. Architecture](#4-architecture)
- [5. Data model](#5-data-model)
- [6. Domain logic](#6-domain-logic)
- [7. API specification](#7-api-specification)
- [8. Front-end routes](#8-front-end-routes)
- [9. Background jobs (pg-boss)](#9-background-jobs-pg-boss)
- [10. Emails and notifications](#10-emails-and-notifications)
- [11. Security requirements](#11-security-requirements)
- [12. Billing with Paddle](#12-billing-with-paddle)
- [13. Quality, performance and operations](#13-quality-performance-and-operations)
- [14. Phased build plan](#14-phased-build-plan)
- [15. Explicitly out of scope (v1)](#15-explicitly-out-of-scope-v1)
- [16. Open questions to resolve before the relevant phase](#16-open-questions-to-resolve-before-the-relevant-phase)

---

## 0. How to use this document

- Build **phase by phase, in order.** Each phase ends with a demo-able, deployable result.
- Each phase is broken into **chunks** with IDs such as `P2-07`. One chunk is roughly 0.5–3 days of work and should be one pull request.
- Every chunk lists **acceptance criteria.** A chunk is done only when all criteria pass *and* the global Definition of Done (section 0.2) is met.
- If something in this document is unclear or seems wrong, raise it before building. Do not guess silently.
- Screens referenced as `[S-xx]` are specified in `DESIGN_SPEC.md`.

### 0.1 Conventions

| Item | Convention |
| --- | --- |
| Language | TypeScript everywhere, `strict: true`, no `any` without a comment explaining why |
| Package manager | pnpm (workspaces) + Turborepo |
| Naming | `camelCase` in TS, `snake_case` in SQL, `kebab-case` for file names and URL paths |
| IDs | UUID v7 (time-ordered) generated in the app, stored as `uuid` |
| Timestamps | `timestamptz`, always UTC in the database; formatted to the viewer's time zone in the UI |
| Money | Integer cents + ISO currency code; never floats |
| API style | JSON over HTTPS, REST, versioned under `/v1` |
| Commits | Conventional Commits (`feat:`, `fix:`, `chore:` …) |
| Branches | `main` is always deployable; feature branches `p2-07-issue-list` |

### 0.2 Definition of Done (applies to every chunk)

- [ ] Code merged to `main` via pull request; CI green (lint, type-check, unit tests, e2e where relevant).
- [ ] New logic has unit tests; new endpoints have at least one integration test, including an authorization test.
- [ ] Every new UI screen passes an automated axe-core check in CI with **zero** violations, and has been tested with keyboard only.
- [ ] UI matches `DESIGN_SPEC.md` (tokens, components, states: loading, empty, error, success).
- [ ] No secrets in code. New env vars added to `.env.example` and to section 3.
- [ ] Database changes shipped as a Drizzle migration; migration runs cleanly on a copy of production data.
- [ ] User-facing text never uses the words *compliant*, *compliance guaranteed*, *ADA-proof*, *lawsuit protection*, *100% accessible*.
- [ ] Deployed to production (or behind a feature flag) and smoke-tested.

---

## 1. Product summary

### 1.1 What the product does

PRODUCT_NAME monitors websites for automatically detectable accessibility problems (WCAG 2.1 / 2.2, level A and AA), tracks each problem over time (new, open, fixed, regressed), tells people exactly how to fix it on their platform (Shopify, WordPress, other), and produces branded reports and a dated evidence record.

It is **not** an overlay, does not inject scripts into customer sites, and **never claims a site is compliant.** Automated testing finds only part of WCAG; the product says so everywhere.

### 1.2 Customers

| Segment | Description | Main plan |
| --- | --- | --- |
| Agencies & freelancers (primary) | Manage 5–75 client websites; resell monitoring as a care plan | Agency, Agency Pro |
| Store owners (secondary) | Small/medium e-commerce selling into the US or EU | Store, Growth |

### 1.3 Roles

| Role | Scope | Can do |
| --- | --- | --- |
| `owner` | Organisation | Everything, including billing, deleting the organisation, transferring ownership |
| `admin` | Organisation | Everything except billing changes, org deletion and ownership transfer |
| `member` | Organisation | View all sites; run scans; update issue status, assignment, notes; log manual checks; generate reports |
| `client_viewer` | One or more specific sites (client portal) | Read-only: site status, open issues, reports, evidence pack for their assigned sites only |
| `staff` (internal) | Whole platform | Internal admin panel (section 14, Phase 6). Flag on `users`, not an org role |

### 1.4 Plans and limits

All limits are enforced server-side in one place (`packages/shared/src/plans.ts`) and read by API, worker and UI.

| Limit / feature | Trial | Store | Growth | Agency | Agency Pro |
| --- | --- | --- | --- | --- | --- |
| Price (USD / month) | 0 (14 days) | 29 | 79 | 199 | 399 |
| Annual price (USD / year) | — | 290 | 790 | 1,990 | 3,990 |
| Sites | 3 | 1 | 3 | 25 | 75 |
| Pages scanned per scan (per site) | 50 | 250 | 500 | 250 | 500 |
| Scheduled frequency | Weekly | Weekly | Daily | Weekly (daily per site toggle, max 5 daily sites) | Daily |
| Manual "Scan now" per site per day | 2 | 2 | 5 | 3 | 10 |
| Team members (excl. client viewers) | 3 | 2 | 5 | 10 | Unlimited |
| Client viewers | 0 | 0 | 0 | Unlimited | Unlimited |
| Regression alerts (email) | Yes | No | Yes | Yes | Yes |
| Slack webhook | No | No | Yes | Yes | Yes |
| White-label (logo, colour, sender name) | No | No | No | Yes | Yes |
| Custom portal domain (`status.agency.com`) | No | No | No | No | Yes |
| Scheduled client reports | No | No | No | Yes | Yes |
| Evidence pack export | Yes | Yes | Yes | Yes | Yes |
| Public REST API + API keys | No | No | No | No | Yes |
| Data retention (scan history) | 30 days | 12 months | 12 months | 24 months | 24 months |

Rules:
- Trial: no card required; at end, organisation becomes `read_only` (can view, cannot scan) until it subscribes. Data kept 30 days after trial end, then deleted with 7 and 1 days' email warning.
- Downgrade that exceeds a limit (e.g. 30 sites → Agency 25): user must choose which sites to pause before downgrade completes. Paused sites keep history, are not scanned.
- Founding price: support Paddle discount codes; no custom code needed beyond passing a discount ID to checkout.

---

## 2. Tech stack (fixed)

| Layer | Choice | Notes |
| --- | --- | --- |
| Web app | Next.js 15 (App Router), React, Tailwind CSS v4 | Server Components by default; client components only where interactive |
| UI primitives | Radix UI primitives + own components styled with Tailwind | Accessible by default; see DESIGN_SPEC component list |
| Icons | Lucide | Always paired with text or `aria-label` |
| Charts | Recharts (or Visx) wrapped in an accessible `TrendChart` component with a data-table fallback | |
| API | Express 5 + TypeScript | All business logic and database writes live here |
| Validation | Zod (schemas in `packages/shared`) | Same schema validates on client, API and worker |
| ORM / migrations | Drizzle ORM + drizzle-kit | |
| Database | PostgreSQL 16 | Also hosts the job queue |
| Job queue | pg-boss | Cron schedules, retries, dead-letter |
| Auth | Better Auth (email + password, magic link, optional Google OAuth) | Sessions in Postgres, HTTP-only cookies |
| Scanner | Playwright (Chromium) + `@axe-core/playwright` | Pin axe-core version; record it on each scan |
| PDF | Playwright `page.pdf()` rendering React server-rendered HTML | |
| Email | Resend + React Email | |
| Payments | Paddle Billing (merchant of record) | Paddle.js overlay checkout, webhooks |
| Object storage | Cloudflare R2 (S3 API) | Raw scan JSON (gzip), PDFs, screenshots, logos |
| AI fix suggestions | Provider-agnostic interface; first adapter Google Gemini | Cached; behind a feature flag and per-org monthly cap |
| Bot protection | Cloudflare Turnstile | Free checker, sign-up |
| Logs / errors | pino (JSON logs), Sentry | |
| Analytics | Self-hosted Umami (no cookies) | |
| Hosting | One ARM VM (Oracle Always Free; Hetzner fallback), Docker Compose, Caddy | Marketing site + fix guides on Cloudflare Pages |
| CI/CD | GitHub Actions | Build multi-arch images (arm64), deploy over SSH |

**Out of scope for the stack:** MongoDB, Redis, Kubernetes, Vercel (Hobby forbids commercial use).

### 2.1 Repository layout

```
/
├─ apps/
│  ├─ web/            # Next.js app: app.<domain> (dashboard, client portal, admin)
│  ├─ site/           # Next.js static export: <domain> (marketing, pricing, fix guides, free checker UI)
│  ├─ api/            # Express API: api.<domain>
│  └─ worker/         # pg-boss consumers: scans, reports, emails, cron
├─ packages/
│  ├─ db/             # Drizzle schema, migrations, db client, seed scripts
│  ├─ shared/         # Zod schemas, types, plans.ts, rule metadata, error codes
│  ├─ scanner/        # Pure scan engine (discovery, grouping, sampling, axe run, fingerprinting)
│  ├─ fix-guides/     # Markdown fix guides + loader (used by site and web)
│  ├─ emails/         # React Email templates
│  ├─ reports/        # React report templates (HTML → PDF)
│  └─ ui/             # Shared design-system components (tokens from DESIGN_SPEC)
├─ plugins/
│  ├─ wordpress/      # PHP plugin (Phase 7)
│  └─ shopify/        # Shopify embedded app (Phase 7)
├─ infra/
│  ├─ docker-compose.yml
│  ├─ Caddyfile
│  ├─ backup.sh
│  └─ deploy/         # GitHub Actions deploy scripts
└─ docs/              # ADRs, runbooks
```

`packages/scanner` must have **no database or queue imports**: it takes inputs and returns results, so it can be tested in isolation and run from a CLI.

---

## 3. Environments and configuration

| Environment | Purpose | Data |
| --- | --- | --- |
| `local` | Developer machines via `docker compose -f infra/docker-compose.dev.yml` | Seed data |
| `staging` | Same VM, separate compose project and database, `staging.` subdomains | Seed + anonymised samples |
| `production` | Live | Real |

Paddle has a sandbox; staging uses it. Production uses live Paddle.

### 3.1 Environment variables (`.env.example`)

| Variable | Used by | Description |
| --- | --- | --- |
| `NODE_ENV` | all | `development` / `production` |
| `APP_URL` | web, api, worker | e.g. `https://app.example.com` |
| `SITE_URL` | site, api, worker | Marketing site URL |
| `API_URL` | web, site | e.g. `https://api.example.com` |
| `DATABASE_URL` | api, worker | Postgres connection (app user, not superuser) |
| `AUTH_SECRET` | api | Better Auth secret (32+ bytes) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Optional OAuth |
| `PADDLE_ENV` | api, web | `sandbox` / `production` |
| `PADDLE_API_KEY` | api | Server API key |
| `PADDLE_WEBHOOK_SECRET` | api | Webhook signature secret |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | web, site | Paddle.js client token |
| `PADDLE_PRICE_*` | shared | Price IDs per plan and interval (8 vars) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | api, worker | Object storage |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | worker | Email |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | site, api | Bot protection |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `AI_MONTHLY_CAP_PER_ORG` | worker | AI fix suggestions |
| `SENTRY_DSN_*` | all | One per app |
| `SCANNER_CONCURRENCY` | worker | Parallel pages (default 2) |
| `SCANNER_USER_AGENT` | worker | e.g. `PRODUCT_NAMEBot/1.0 (+https://example.com/bot)` |
| `FREE_CHECK_DAILY_CAP` | api | Global daily cap for free checks (default 300) |
| `ENCRYPTION_KEY` | api, worker | AES-256-GCM key for encrypting webhook URLs and API secrets at rest |

---

## 4. Architecture

```
Browser ──HTTPS──▶ Cloudflare ──▶ Caddy ─┬─▶ web  (Next.js, app.<domain>)
                                          ├─▶ api  (Express, api.<domain>)
Paddle webhooks ─────────────────────────┘
                                             api ──▶ PostgreSQL (data + pg-boss)
                                             worker ◀─▶ PostgreSQL
                                             worker ──▶ customer sites (public pages)
                                             worker/api ──▶ R2, Resend, AI provider
Marketing + fix guides: Cloudflare Pages (site) ──▶ api (free checker, waitlist)
```

- **web** renders pages. It reads data by calling **api** from the server with the user's session cookie forwarded. It never touches the database directly.
- **api** owns authentication, authorization, business rules, database writes and job enqueueing.
- **worker** runs every background job (section 9). It writes scan results directly to the database through `packages/db` repositories that enforce the same invariants as the API.
- **Multi-tenancy:** every tenant table has `org_id`. Every repository function requires an `orgId` argument; queries without it do not compile (enforce with a typed repository layer, not ad-hoc queries in route handlers).
- **Custom portal domains (Agency Pro):** Caddy "on-demand TLS" with an `ask` endpoint on the API (`GET /internal/tls-allowed?domain=`) that returns 200 only for verified custom domains.

### 4.1 Error format

All API errors return:

```json
{ "error": { "code": "SITE_LIMIT_REACHED", "message": "Your plan allows 3 sites.", "details": {} } }
```

`code` values live in `packages/shared/src/errors.ts`. HTTP status: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found (also used when a resource exists in another org), 409 conflict, 422 business rule, 429 rate limited, 500 unexpected.

### 4.2 Pagination

Cursor-based: `?limit=50&cursor=<opaque>`; response `{ "data": [...], "nextCursor": "..." | null }`. Max limit 200.

---

## 5. Data model

All tables have `id uuid pk`, `created_at timestamptz default now()`, `updated_at timestamptz` (trigger-updated) unless stated. Tenant tables have `org_id uuid not null references organizations(id) on delete cascade` and an index on `org_id`.

### 5.1 Identity and organisations

**`users`** — `email citext unique not null`, `name text`, `email_verified_at timestamptz`, `avatar_url text`, `time_zone text default 'UTC'`, `is_staff boolean default false`, `last_active_org_id uuid null`, `deleted_at timestamptz null`.
(Better Auth also creates `sessions`, `accounts`, `verifications`; keep its schema, add FKs to `users`.)

**`organizations`** — `name text not null`, `slug citext unique`, `plan text not null default 'trial'` (`trial|store|growth|agency|agency_pro`), `billing_status text not null default 'trialing'` (`trialing|active|past_due|paused|canceled|read_only`), `trial_ends_at timestamptz`, `paddle_customer_id text unique null`, `time_zone text default 'UTC'`, `deleted_at timestamptz null`.

**`memberships`** — `org_id`, `user_id`, `role text` (`owner|admin|member`), unique `(org_id, user_id)`. Exactly one `owner` per org (enforced in service + partial unique index `where role = 'owner'`).

**`invitations`** — `org_id`, `email citext`, `role text` (`admin|member|client_viewer`), `site_ids uuid[]` (client viewers only), `token_hash text unique`, `invited_by uuid`, `expires_at timestamptz` (7 days), `accepted_at timestamptz null`, `revoked_at timestamptz null`.

**`client_access`** — `org_id`, `user_id`, `site_id`, unique `(user_id, site_id)`. A user with rows here and no membership is a client viewer of those sites.

**`branding`** (1:1 with org) — `org_id unique`, `display_name text`, `logo_light_key text`, `logo_dark_key text`, `primary_color text` (hex, validated for contrast ≥ 4.5:1 against white for buttons), `email_sender_name text`, `report_footer text`, `hide_product_brand boolean default false`, `custom_domain citext unique null`, `custom_domain_verified_at timestamptz null`, `custom_domain_verify_token text`.

### 5.2 Sites and scanning

**`sites`** — `org_id`, `name text`, `root_url text not null` (normalised: scheme + host, no trailing slash), `platform text` (`shopify|wordpress|woocommerce|webflow|wix|squarespace|custom|unknown`), `client_name text null`, `status text default 'pending_verification'` (`pending_verification|active|paused|error`), `verify_method text null` (`meta|dns|file|plugin|shopify`), `verify_token text not null`, `verified_at timestamptz null`, `scan_frequency text` (`weekly|daily|manual`), `scan_day smallint` (0–6, weekly), `scan_hour smallint` (0–23, org time zone), `page_limit int`, `standard text default 'wcag22aa'` (`wcag21aa|wcag22aa`), `pinned_urls text[] default '{}'`, `excluded_paths text[] default '{}'`, `auth_note text null` (future), `last_scan_id uuid null`, `next_scan_at timestamptz null`, `score smallint null` (latest), `deleted_at timestamptz null`. Unique `(org_id, root_url) where deleted_at is null`.

**`scans`** — `org_id`, `site_id`, `trigger text` (`scheduled|manual|onboarding|api|plugin`), `status text` (`queued|discovering|scanning|processing|completed|partial|failed|canceled`), `queued_at`, `started_at`, `finished_at`, `pages_discovered int`, `pages_planned int`, `pages_scanned int`, `pages_failed int`, `templates_found int`, `axe_version text`, `engine_version text`, `standard text`, `score smallint null`, `counts jsonb` (`{critical, serious, moderate, minor, new, fixed, regressed, open}`), `raw_key text` (R2 key of gzip JSON), `error_code text null`, `error_message text null`, `requested_by uuid null`.
Index `(site_id, queued_at desc)`.

**`pages`** — `org_id`, `site_id`, `url text`, `url_hash text` (sha256 of normalised URL), `template_key text`, `title text`, `first_seen_scan_id`, `last_scanned_scan_id`, `last_status_code int`, `is_pinned boolean`. Unique `(site_id, url_hash)`.

**`page_results`** — `org_id`, `scan_id`, `page_id`, `status text` (`ok|timeout|http_error|blocked|skipped`), `http_status int`, `load_ms int`, `violations int`, `passes int`, `incomplete int`, `score smallint`, `screenshot_key text null`. Unique `(scan_id, page_id)`.

**`issues`** — `org_id`, `site_id`, `fingerprint text not null`, `rule_id text not null`, `impact text` (`critical|serious|moderate|minor`), `wcag_criteria text[]` (e.g. `{'1.1.1'}`), `wcag_level text` (`A|AA`), `template_key text`, `selector text` (normalised), `html_snippet text` (max 2,000 chars), `failure_summary text`, `status text` (`open|fixed|ignored`), `ignored_reason text null` (`false_positive|not_applicable|wont_fix|accepted_risk`), `ignored_note text`, `ignored_by uuid null`, `ignored_at`, `is_regression boolean default false`, `regression_count int default 0`, `first_seen_scan_id`, `last_seen_scan_id`, `fixed_scan_id uuid null`, `fixed_at`, `occurrence_count int` (in last scan), `assignee_id uuid null`, `due_date date null`, `needs_review boolean default false` (axe "incomplete"). Unique `(site_id, fingerprint)`. Indexes `(site_id, status, impact)`, `(org_id, assignee_id)`.

**`issue_occurrences`** — `org_id`, `scan_id`, `issue_id`, `page_id`, `target text` (exact selector on that page). Index `(issue_id, scan_id)`. Pruned per retention.

**`issue_events`** — `org_id`, `issue_id`, `type text` (`created|fixed|regressed|ignored|unignored|assigned|due_date_set|note_added`), `actor_id uuid null` (null = system), `scan_id uuid null`, `data jsonb`. Feeds the issue timeline and the evidence pack.

**`issue_notes`** — `org_id`, `issue_id`, `author_id`, `body text` (markdown, max 5,000), `visible_to_client boolean default false`, `deleted_at`.

### 5.3 Knowledge base

**`rules`** (seeded, not tenant) — `rule_id text pk`, `title text` (plain English), `description text`, `who_is_affected text`, `wcag_criteria text[]`, `wcag_level text`, `default_impact text`, `weight smallint` (critical 10, serious 6, moderate 3, minor 1), `help_url text` (Deque docs), `axe_version text`.

**`fix_guides`** (not tenant) — `rule_id`, `platform text` (`shopify|wordpress|generic|…`), `slug text unique`, `title text`, `body_md text`, `source text` (`written|ai_reviewed`), `reviewed_at timestamptz`, `published boolean`. Unique `(rule_id, platform)`. Source of truth is `packages/fix-guides/*.md`; a seed script upserts into this table on deploy.

**`ai_suggestions`** (not tenant; cache) — `cache_key text unique` (sha256 of `rule_id + platform + normalised snippet`), `rule_id`, `platform`, `suggestion_md text`, `model text`, `tokens_in int`, `tokens_out int`, `flagged boolean default false` (user reported bad).

**`ai_usage`** — `org_id`, `month date`, `requests int`. Unique `(org_id, month)`.

### 5.4 Evidence, reports, manual checks

**`evidence_events`** — `org_id`, `site_id`, `type text` (`site_added|site_verified|scan_completed|issue_fixed|issue_regressed|issue_ignored|manual_check_logged|statement_published|report_generated|report_sent|plan_changed`), `actor_id uuid null`, `occurred_at timestamptz`, `data jsonb`. **Append-only**: no update/delete grants for the app DB user on this table (except retention job using a separate role).

**`manual_checks`** — `org_id`, `site_id`, `check_type text` (`keyboard|screen_reader|zoom_reflow|color_contrast_manual|captions|forms|other`), `performed_at date`, `performed_by_name text`, `tool text` (e.g. "NVDA 2026.2 + Firefox"), `result text` (`pass|issues_found|partial`), `notes text`, `attachment_key text null`, `created_by uuid`.

**`statements`** — `org_id`, `site_id`, `version int`, `status text` (`draft|published`), `data jsonb` (form answers), `rendered_html text`, `published_at`, `published_by`. Public URL `/s/<site-public-id>/accessibility-statement` optional.

**`reports`** — `org_id`, `site_id null` (null = multi-site agency summary), `scan_id null`, `type text` (`scan_summary|full|evidence_pack|client_monthly|agency_overview`), `status text` (`queued|rendering|ready|failed`), `file_key text`, `file_size int`, `branded boolean`, `requested_by uuid null`, `expires_at timestamptz null`.

**`report_schedules`** — `org_id`, `site_id`, `recipients citext[]` (max 10), `day_of_month smallint` (1–28), `type text` (`client_monthly`), `active boolean`, `last_sent_at`.

### 5.5 Notifications and integrations

**`notification_preferences`** — `user_id`, `org_id`, `scan_completed text` (`all|issues_only|off`), `regressions boolean`, `weekly_digest boolean`, `billing boolean` (owners always receive critical billing mail). Unique `(user_id, org_id)`.

**`webhooks`** — `org_id`, `kind text` (`slack|generic`), `url_encrypted text`, `events text[]`, `site_ids uuid[]` (empty = all), `active boolean`, `last_status int`, `last_error text`, `failure_count int`. Auto-disable after 10 consecutive failures; email owner.

**`api_keys`** (Agency Pro) — `org_id`, `name text`, `prefix text` (first 8 chars, shown), `key_hash text unique` (sha256), `scopes text[]` (`read`, `scan:write`), `last_used_at`, `revoked_at`, `created_by`.

**`in_app_notifications`** — `org_id`, `user_id`, `type text`, `title text`, `body text`, `link text`, `read_at timestamptz null`.

### 5.6 Billing

**`subscriptions`** — `org_id unique`, `paddle_subscription_id text unique`, `paddle_price_id text`, `plan text`, `interval text` (`month|year`), `status text` (Paddle status), `current_period_start`, `current_period_end`, `cancel_at_period_end boolean`, `scheduled_change jsonb null`.

**`paddle_events`** — `event_id text pk`, `event_type text`, `received_at`, `processed_at timestamptz null`, `payload jsonb`, `error text null`. Idempotency + audit.

**`invoices`** (mirror) — `org_id`, `paddle_transaction_id text unique`, `amount_cents int`, `currency text`, `status text`, `billed_at`, `invoice_url text`.

### 5.7 Leads, audit and system

**`free_checks`** — `url text`, `domain text`, `email citext null`, `ip_hash text`, `status text`, `result jsonb` (summary only), `report_key text null`, `marketing_consent boolean default false`, `converted_org_id uuid null`. Index `(ip_hash, created_at)`, `(domain, created_at)`.

**`waitlist`** — `email citext unique`, `source text`, `consent boolean`.

**`audit_log`** — `org_id null`, `actor_id null`, `actor_type text` (`user|staff|system|api_key`), `action text` (e.g. `member.removed`, `site.deleted`, `billing.plan_changed`, `staff.impersonation_started`), `target_type`, `target_id`, `ip inet`, `user_agent text`, `data jsonb`. Append-only.

**`feature_flags`** — `key text pk`, `enabled boolean`, `org_ids uuid[]` (allow-list).

### 5.8 Retention

A nightly job deletes `issue_occurrences`, `page_results` and raw R2 scan files older than the plan's retention window. It **never** deletes `issues`, `issue_events` or `evidence_events` while the org exists. On org deletion: soft delete immediately, hard delete everything (DB + R2) after 30 days.

---

## 6. Domain logic

### 6.1 URL normalisation

1. Lower-case scheme and host; remove default ports; remove fragment.
2. Remove tracking parameters (`utm_*`, `gclid`, `fbclid`, `ref`, `variant` on Shopify is **kept**).
3. Sort remaining query parameters; remove trailing slash except root.
4. Only `http`/`https`; only the site's host (and `www.` ↔ apex treated as same site). Subdomains are separate sites.

### 6.2 Discovery

1. Fetch `robots.txt`; respect `Disallow` for our user agent and `*`. Record `Crawl-delay` (cap at 5 s).
2. Fetch sitemaps: `robots.txt` Sitemap entries, then `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`. Follow sitemap indexes up to 3 levels and 50,000 URLs total.
3. If fewer than 20 URLs found, crawl: start at root + pinned URLs, BFS, depth ≤ 3, same host only, max 2,000 URLs discovered, links from `<a href>` in rendered HTML.
4. Drop URLs matching `excluded_paths` (glob), non-HTML extensions, `mailto:`, `tel:`, logout/cart-add/checkout-step URLs (patterns list in `packages/scanner/src/skip-patterns.ts`).
5. Rate: ≤ 1 request/second per host (or crawl-delay), max 2 concurrent per host.

### 6.3 Template grouping

`template_key` is computed per URL:
- **Shopify:** first path segment mapped: `products` → `product`, `collections` → `collection` (and `collections/*/products/*` → `product`), `pages` → `page:<handle>` for the 10 most common handles else `page`, `blogs/*/` → `blog-index`, `blogs/*/*` → `article`, `cart`, `search`, `account`, `/` → `home`.
- **WordPress/WooCommerce:** `/product/` → `product`, `/product-category/` → `product-category`, `/category/` → `category`, `/tag/` → `tag`, `/author/` → `author`, date paths `/YYYY/MM/` → `post`, else top-level page → `page:<slug>` for pages in the main navigation, else `page`.
- **Other:** replace path segments that are numeric, UUID-like, or longer than 30 chars with `*`; keep first two segments: e.g. `/blog/my-long-post-title` → `blog/*`.

### 6.4 Sampling

Planned page list (deduplicated), in order, until `page_limit`:
1. Home page.
2. Pinned URLs (max 25).
3. Key pages if found: cart, contact, search, login/account, checkout entry page (do not submit anything).
4. For each template sorted by number of URLs desc: up to 3 URLs (first, a middle one, and the most recently `lastmod` one).
5. Fill remaining budget round-robin across templates.

Pages are re-sampled each scan but previously scanned URLs of the same template are preferred (stability for issue tracking); 1 in 3 picks rotates to a new URL so coverage grows over time.

### 6.5 Page test

For each planned page:
1. New browser context: viewport 1280×800, `reducedMotion: 'reduce'`, locale `en-US`, JavaScript enabled, `bypassCSP: false`.
2. Route guard: abort requests to private/link-local/loopback addresses (section 11.2), to media types `media` and to a blocklist of analytics/ads hosts. Keep CSS, fonts, images.
3. `goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })`, then wait for network idle up to 5 s, then wait 500 ms.
4. Dismiss known cookie banners? **No.** Banners are part of the page and must be tested.
5. Run axe with `runOnly: { type: 'tag', values: [...] }` — `wcag2a, wcag2aa, wcag21a, wcag21aa` plus `wcag22aa` when `standard = wcag22aa`; `resultTypes: ['violations', 'incomplete']`. Also collect pass counts per rule (axe `passes` length) for scoring.
6. Optional full-page screenshot (JPEG q60, max 1280×4000) for pages with critical issues; store in R2.
7. Hard per-page timeout 45 s → `page_results.status = timeout`.
8. Restart the browser every 50 pages or when RSS > 1.5 GB.

### 6.6 Fingerprint and selector normalisation

```
normalizedSelector = selector
  .replace(/:nth-(child|of-type)\(\d+\)/g, '')
  .replace(/#[A-Za-z0-9_-]*\d{3,}[A-Za-z0-9_-]*/g, '#*')     // generated IDs
  .replace(/\.(?:css|sc|jsx|svelte)-[a-z0-9]{5,}/gi, '.*')     // CSS-in-JS hashes
  .replace(/\s+/g, ' ').trim()
fingerprint = sha256(rule_id + '|' + template_key + '|' + normalizedSelector)
```

One `issues` row per fingerprint per site. `occurrence_count` = number of (page, target) pairs in the latest scan.

### 6.7 Issue status machine

After every completed or partial scan, for each issue in the site:

| Previous status | Seen in this scan? | Its page(s) scanned this time? | New status | Events |
| --- | --- | --- | --- | --- |
| (none) | Yes | — | `open` | `created` (counts as **new**) |
| `open` | Yes | — | `open` | — |
| `open` | No | Yes, all pages it was seen on last time were scanned OK | `fixed` | `fixed`, evidence `issue_fixed` |
| `open` | No | No / some failed | `open` (unchanged) | — |
| `fixed` | Yes | — | `open`, `is_regression = true`, `regression_count++` | `regressed`, evidence `issue_regressed`, regression alert |
| `ignored` | any | — | `ignored` (unchanged; occurrences still recorded) | — |

"Pages scanned" uses template coverage: an issue is considered checked if **any** page of its `template_key` was scanned successfully *and* the specific pages where it last occurred were scanned, or if ≥ 3 pages of that template were scanned without it.

A scan whose `pages_failed / pages_planned > 50%` is `partial` and **must not** mark anything fixed.

### 6.8 Score

Heuristic, displayed as "Automated check score" with an explanation; never called a compliance score.

```
For each successfully scanned page:
  P = Σ over rules that passed on the page: weight(rule)
  F = Σ over rules with violations on the page: weight(rule) × min(1 + log2(nodes), 4)
  pageScore = P + F == 0 ? 100 : round(100 × P / (P + F))
siteScore = round(mean(pageScore))     // across scanned pages
```

Weights come from `rules.weight`. Score bands for UI: 90–100 "Good", 70–89 "Needs work", 0–69 "Poor".

### 6.9 Ownership verification

| Method | How | Check |
| --- | --- | --- |
| `meta` | `<meta name="PRODUCT_NAME-verify" content="<token>">` on home page | Fetch home page HTML, parse head |
| `dns` | TXT record `PRODUCT_NAME-verify=<token>` on the apex or `_PRODUCT_NAME.<host>` | DNS-over-HTTPS lookup (Cloudflare 1.1.1.1) |
| `file` | `/.well-known/PRODUCT_NAME-verify.txt` containing token | Fetch file |
| `plugin` | WordPress plugin posts signed token | API callback (Phase 7) |
| `shopify` | Installed via Shopify OAuth | Shop domain matches (Phase 7) |

Re-verify weekly before scheduled scans; if verification fails 3 times in a row, set `status = error`, notify owner/admins, stop scheduled scans.

Unverified sites: user may run **one** onboarding scan limited to 10 pages so they see value immediately; scheduled scans require verification.

### 6.10 AI fix suggestions

- Only for issues without a written guide for their `(rule_id, platform)`, or when the user clicks "Suggest a fix for this element".
- Prompt includes: rule title and description, WCAG criterion, platform, normalised HTML snippet (max 2,000 chars, strip `value` attributes, emails, phone numbers), failure summary. **Never** include customer personal data or full pages.
- Output: markdown, max 300 words, must contain the corrected HTML/Liquid/PHP snippet in a fenced code block. Validate structure; on failure, show "Suggestion unavailable".
- Cache by `cache_key`; per-org monthly cap from env; label in UI "AI suggestion — check before applying". "Report a bad suggestion" sets `flagged` and removes it from cache for that key.

---

## 7. API specification

Base URL: `https://api.<domain>/v1`. Auth: session cookie (web app) or `Authorization: Bearer <api_key>` (public API, Agency Pro). All org-scoped routes are under `/orgs/:orgId/…`; the API checks membership and role on every request. A resource in another org returns **404**, never 403.

Role shorthand: **O** owner, **A** admin, **M** member, **C** client viewer (own sites only), **S** staff, **P** public (no auth), **K** API key.

### 7.1 Auth and session

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/sign-up` | P | Email + password (+ Turnstile token). Sends verification email |
| POST | `/auth/sign-in` | P | Email + password |
| POST | `/auth/magic-link` | P | Send sign-in link |
| GET | `/auth/magic-link/verify?token=` | P | Complete magic link |
| POST | `/auth/sign-out` | any | End session |
| POST | `/auth/verify-email` | P | Verify with token |
| POST | `/auth/forgot-password` / `/auth/reset-password` | P | Reset flow |
| GET | `/auth/oauth/google` + callback | P | Optional Google sign-in |
| GET | `/me` | any | Current user, memberships, client access, active org |
| PATCH | `/me` | any | Name, time zone, avatar |
| POST | `/me/change-password` | any | Requires current password |
| GET | `/me/sessions` / DELETE `/me/sessions/:id` | any | List and revoke sessions |
| POST | `/me/export` | any | Request personal data export (GDPR) → emailed link |
| DELETE | `/me` | any | Delete account (blocked if sole owner of an org with an active subscription) |

Sign-in rate limit: 5 attempts per 15 minutes per email + IP. Passwords: min 10 chars, checked against a common-password list; hashed by Better Auth (scrypt/argon2).

### 7.2 Organisations and members

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/orgs` | any | Create org (starts trial). Body: `name`, `type` (`agency|store`), `timeZone` |
| GET | `/orgs/:orgId` | O A M | Org details, plan, usage vs limits |
| PATCH | `/orgs/:orgId` | O A | Name, time zone, slug |
| DELETE | `/orgs/:orgId` | O | Soft delete (requires typing org name; cancels subscription at period end) |
| POST | `/orgs/:orgId/transfer-ownership` | O | To an existing admin |
| GET | `/orgs/:orgId/members` | O A M | Members + pending invitations |
| POST | `/orgs/:orgId/invitations` | O A | Invite `email`, `role`, `siteIds` (client viewers) |
| DELETE | `/orgs/:orgId/invitations/:id` | O A | Revoke |
| POST | `/orgs/:orgId/invitations/:id/resend` | O A | Resend email |
| POST | `/invitations/accept` | any | Accept with token (creates account if needed) |
| PATCH | `/orgs/:orgId/members/:userId` | O A | Change role (admins cannot promote to owner) |
| DELETE | `/orgs/:orgId/members/:userId` | O A | Remove (cannot remove owner) |
| GET | `/orgs/:orgId/clients` | O A | Client viewers with their site access |
| PUT | `/orgs/:orgId/clients/:userId/sites` | O A | Set the sites a client viewer can see |
| DELETE | `/orgs/:orgId/clients/:userId` | O A | Remove client access entirely |
| GET | `/orgs/:orgId/audit-log` | O A | Paginated audit log |

### 7.3 Sites

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/orgs/:orgId/sites` | O A M | List with latest score, counts, status, next scan; filters `status`, `platform`, `client`, `q`; sort `score|name|lastScan|openCritical` |
| POST | `/orgs/:orgId/sites` | O A M | Add site: `rootUrl`, `name`, `platform?`, `clientName?`. Detects platform if omitted. Checks plan limit. Enqueues onboarding scan (10 pages) |
| GET | `/orgs/:orgId/sites/:siteId` | O A M C | Site detail + latest scan summary + trend (last 12 scans) |
| PATCH | `/orgs/:orgId/sites/:siteId` | O A | Name, client name, frequency, day/hour, page limit (≤ plan), standard, pinned URLs, excluded paths |
| POST | `/orgs/:orgId/sites/:siteId/pause` / `resume` | O A | Pause/resume scheduled scans |
| DELETE | `/orgs/:orgId/sites/:siteId` | O A | Soft delete; history kept 30 days |
| GET | `/orgs/:orgId/sites/:siteId/verification` | O A M | Token + instructions for each method |
| POST | `/orgs/:orgId/sites/:siteId/verify` | O A M | Body `method`; runs check now; returns result + reason on failure |
| POST | `/sites/detect-platform` | O A M | Body `url`; returns detected platform (from generator meta, Shopify headers, `wp-json`) |

### 7.4 Scans

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/orgs/:orgId/sites/:siteId/scans` | O A M K | "Scan now" — checks verification, daily manual limit, no scan already running |
| GET | `/orgs/:orgId/sites/:siteId/scans` | O A M C K | Scan history (paginated) |
| GET | `/orgs/:orgId/scans/:scanId` | O A M C K | Scan detail: status, progress, counts, score, diff vs previous (new/fixed/regressed lists) |
| GET | `/orgs/:orgId/scans/:scanId/events` | O A M | **Server-Sent Events** progress stream: `{phase, pagesScanned, pagesPlanned, currentUrl}` |
| POST | `/orgs/:orgId/scans/:scanId/cancel` | O A M | Cancel queued/running scan |
| GET | `/orgs/:orgId/scans/:scanId/pages` | O A M | Per-page results |
| GET | `/orgs/:orgId/sites/:siteId/pages` | O A M | Discovered pages grouped by template |
| GET | `/orgs/:orgId/scans/:scanId/raw` | O A | Short-lived signed URL to raw JSON (power users) |

### 7.5 Issues

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/orgs/:orgId/sites/:siteId/issues` | O A M C K | Filters: `status` (multi), `impact` (multi), `wcag`, `template`, `rule`, `assignee`, `isRegression`, `needsReview`, `q`; group `rule|template|none`; sort `impact|occurrences|firstSeen|lastSeen` |
| GET | `/orgs/:orgId/issues` | O A M | Cross-site issues (agency view, "My tasks" with `assignee=me`) |
| GET | `/orgs/:orgId/issues/:issueId` | O A M C K | Detail: rule info, occurrences (latest scan, paginated), snippet, timeline (`issue_events`), notes (clients see only `visible_to_client`), fix guide, AI suggestion if cached |
| PATCH | `/orgs/:orgId/issues/:issueId` | O A M | `assigneeId`, `dueDate` |
| POST | `/orgs/:orgId/issues/:issueId/ignore` | O A M | `reason`, `note` (required for `accepted_risk`, `wont_fix`) |
| POST | `/orgs/:orgId/issues/:issueId/unignore` | O A M | Back to `open` |
| POST | `/orgs/:orgId/issues/bulk` | O A M | Bulk assign / ignore / set due date for ≤ 200 issues |
| POST | `/orgs/:orgId/issues/:issueId/recheck` | O A M | Re-test only the pages where it occurred (counts toward manual scan limit as 1) |
| POST | `/orgs/:orgId/issues/:issueId/notes` | O A M | Add note |
| PATCH / DELETE | `/orgs/:orgId/issues/:issueId/notes/:noteId` | author, O A | Edit / delete note |
| POST | `/orgs/:orgId/issues/:issueId/ai-suggestion` | O A M | Generate (or return cached) AI fix suggestion; counts toward monthly cap |
| POST | `/orgs/:orgId/issues/:issueId/ai-suggestion/report` | O A M | Flag bad suggestion |
| GET | `/orgs/:orgId/sites/:siteId/issues/export.csv` | O A M | CSV export of current filter |

### 7.6 Evidence, manual checks, statements

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/orgs/:orgId/sites/:siteId/evidence` | O A M C | Timeline of `evidence_events`, filter by type and date range |
| GET / POST | `/orgs/:orgId/sites/:siteId/manual-checks` | O A M (C read) | List / log a manual check (multipart for attachment, max 10 MB, PDF/PNG/JPG) |
| PATCH / DELETE | `/orgs/:orgId/manual-checks/:id` | O A, creator | Edit / delete (deletion recorded in audit log; evidence event remains with `deleted: true`) |
| GET | `/orgs/:orgId/sites/:siteId/statements` | O A M | Versions |
| POST | `/orgs/:orgId/sites/:siteId/statements` | O A M | Save draft (`data` per statement form schema) |
| POST | `/orgs/:orgId/statements/:id/publish` | O A | Publish → public URL + evidence event |
| GET | `/public/statements/:sitePublicId` | P | Published statement HTML (used by public page) |

### 7.7 Reports

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/orgs/:orgId/reports` | O A M | Generate: `type`, `siteId?`, `scanId?`, `dateRange?`, `branded` |
| GET | `/orgs/:orgId/reports` | O A M C | List (clients: own sites only) |
| GET | `/orgs/:orgId/reports/:id/download` | O A M C | Signed URL (15 min) |
| POST | `/orgs/:orgId/reports/:id/send` | O A M | Email the report to ≤ 10 recipients with an optional message |
| GET / POST / PATCH / DELETE | `/orgs/:orgId/report-schedules[/:id]` | O A | Monthly client report schedules (Agency plans) |

### 7.8 Branding, notifications, integrations, API keys

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET / PATCH | `/orgs/:orgId/branding` | O A | Display name, colours (validated), sender name, footer, hide product brand |
| POST | `/orgs/:orgId/branding/logo` | O A | Upload logo (SVG sanitised or PNG ≤ 1 MB, ≤ 1000 px); `variant=light|dark` |
| POST | `/orgs/:orgId/branding/custom-domain` | O | Set domain → returns CNAME target + TXT token (Agency Pro) |
| POST | `/orgs/:orgId/branding/custom-domain/verify` | O | Check DNS, enable |
| GET / PUT | `/orgs/:orgId/notification-preferences` | any member | Own preferences |
| GET / PATCH | `/notifications` · POST `/notifications/read-all` | any | In-app notifications |
| GET / POST / PATCH / DELETE | `/orgs/:orgId/webhooks[/:id]` | O A | Slack / generic webhooks |
| POST | `/orgs/:orgId/webhooks/:id/test` | O A | Send test event |
| GET / POST / DELETE | `/orgs/:orgId/api-keys[/:id]` | O | Create (secret shown once) / list / revoke |

### 7.9 Billing

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/orgs/:orgId/billing` | O | Plan, status, period, usage, next invoice, payment method summary (from Paddle) |
| POST | `/orgs/:orgId/billing/checkout` | O | Returns Paddle checkout settings (price ID, customer email, `custom_data: {orgId}`) for Paddle.js |
| POST | `/orgs/:orgId/billing/change-plan` | O | Preview + apply upgrade/downgrade via Paddle subscription update (proration: `prorated_immediately` for upgrades, `full_next_billing_period` for downgrades) |
| POST | `/orgs/:orgId/billing/cancel` | O | Cancel at period end, with optional reason (stored) |
| POST | `/orgs/:orgId/billing/resume` | O | Undo scheduled cancel |
| GET | `/orgs/:orgId/billing/portal` | O | Paddle customer portal URL (update card, invoices) |
| GET | `/orgs/:orgId/invoices` | O | Invoice list with links |
| POST | `/webhooks/paddle` | Paddle | Signature-verified webhook (section 12) |

### 7.10 Public marketing endpoints

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/public/free-checks` | P | `url`, `turnstileToken` → `{ checkId }`; limits in section 11.4 |
| GET | `/public/free-checks/:checkId` | P (unguessable id) | Status + summary (top 10 issues, score, counts) |
| POST | `/public/free-checks/:checkId/email` | P | `email`, `marketingConsent` → emails full PDF |
| POST | `/public/waitlist` | P | `email`, `consent` |
| GET | `/public/plans` | P | Plan table from `plans.ts` (pricing page uses this) |

### 7.11 Public REST API (Agency Pro, API keys)

Same handlers as above, exposed with key auth and scopes: `GET /sites`, `GET /sites/:id`, `GET /sites/:id/issues`, `GET /issues/:id`, `GET /sites/:id/scans`, `GET /scans/:id`, `POST /sites/:id/scans` (`scan:write`). Rate limit 60 requests/minute per key. OpenAPI 3.1 document generated from Zod schemas, served at `/v1/openapi.json` and rendered at `docs.<domain>`.

### 7.12 Staff (internal admin)

`/staff/*` routes require `users.is_staff = true` **and** a second factor (TOTP) for the session. Endpoints: list/search orgs, org detail (plan, usage, sites, recent scans, errors), extend trial, apply plan override, start/stop impersonation (read-only, banner shown, audited), queue stats and dead jobs (retry/delete), free-check and lead list, fix-guide and flagged AI-suggestion review, feature flags.

---

## 8. Front-end routes

Screen IDs refer to `DESIGN_SPEC.md`.

### 8.1 Marketing site (`apps/site`, static, `<domain>`)

| Route | Screen |
| --- | --- |
| `/` | S-01 Home |
| `/pricing` | S-02 Pricing |
| `/check` and `/check/:checkId` | S-03 Free checker (input, progress, result) |
| `/fix` · `/fix/:platform` · `/fix/:platform/:slug` | S-04 Fix guide index · S-05 Fix guide article |
| `/agencies` | S-06 For agencies |
| `/legal/terms`, `/legal/privacy`, `/legal/dpa`, `/legal/subprocessors`, `/bot` | S-07 Legal and bot information |
| `/blog`, `/blog/:slug`, `/changelog` | S-08 Blog, changelog |

The free-checker result is rendered client-side from the API; everything else is static and pre-rendered. Generate `sitemap.xml`, `robots.txt`, Open Graph images per guide (build-time).

### 8.2 App (`apps/web`, `app.<domain>`)

| Route | Screen |
| --- | --- |
| `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password`, `/verify-email`, `/magic` | S-10 – S-12 |
| `/invite/:token` | S-13 Accept invitation |
| `/onboarding` | S-14 Onboarding wizard |
| `/[org]` | S-20 Overview |
| `/[org]/sites` | S-21 Sites list (+ S-22 Add site dialog) |
| `/[org]/sites/[site]/verify` | S-23 Verification |
| `/[org]/sites/[site]` | S-24 Site overview |
| `/[org]/sites/[site]/issues` · `/issues/[issue]` | S-25 Issues · S-26 Issue detail |
| `/[org]/sites/[site]/scans` · `/scans/[scan]` | S-27 Scan history · S-28 Scan detail / live progress |
| `/[org]/sites/[site]/pages` | S-29 Pages and templates |
| `/[org]/sites/[site]/reports` | S-30 Reports |
| `/[org]/sites/[site]/evidence` | S-31 Evidence |
| `/[org]/sites/[site]/manual-checks` | S-32 Manual checks |
| `/[org]/sites/[site]/statement` | S-33 Statement editor |
| `/[org]/sites/[site]/settings` | S-34 Site settings |
| `/[org]/settings` · `/members` · `/clients` · `/branding` · `/billing` · `/notifications` · `/integrations` · `/api-keys` · `/audit-log` | S-40 – S-47, S-51 |
| `/account` | S-48 Profile and security |
| `/[org]/my-tasks` | S-49 My tasks |
| (panel) | S-50 Notification centre |
| `/portal` · `/portal/sites/[site]` (also served on custom domain) | S-60 · S-61 Client portal |
| `/staff/*` | S-70 – S-75 Admin |
| 404 / 500 / maintenance | S-80 |
| `⌘K` / `Ctrl+K` anywhere | S-81 Command palette |

`[org]` is the org slug. Users with one org land on it directly; client viewers always land on `/portal`.

---

## 9. Background jobs (pg-boss)

| Queue | Payload | Trigger | Concurrency | Retries | Timeout |
| --- | --- | --- | --- | --- | --- |
| `scan.run` | `{scanId}` | Scan now, scheduler, onboarding, API | 1 scan at a time per worker; `SCANNER_CONCURRENCY` pages in parallel inside it | 2 (backoff 5 min) | 25 min |
| `scan.process` | `{scanId}` | End of `scan.run` | 2 | 3 | 5 min |
| `issue.recheck` | `{issueId}` | Recheck button | 1 | 1 | 5 min |
| `scan.schedule` (cron, every 10 min) | — | Cron | 1 | — | — | Enqueues `scan.run` for sites with `next_scan_at <= now()`, verified, org not read-only; spreads load (max 20 per tick) |
| `site.reverify` | `{siteId}` | Before scheduled scans, weekly | 4 | 2 | 1 min |
| `report.render` | `{reportId}` | Report request, schedule, free check | 1 | 2 | 5 min |
| `report.schedule` (cron, daily 06:00 UTC) | — | Cron | 1 | — | — | Creates monthly client reports due today |
| `email.send` | `{template, to, data, orgId?}` | Many | 5 | 5 (exponential) | 30 s |
| `webhook.deliver` | `{webhookId, event, payload}` | Events | 5 | 5 | 10 s |
| `digest.weekly` (cron, Mon 07:00 org TZ) | — | Cron | 1 | — | — |
| `ai.suggest` | `{issueId, userId}` | Button / batch | 2 | 1 | 60 s |
| `free-check.run` | `{checkId}` | Public | 1 (own lane, never blocks paid scans) | 0 | 90 s |
| `trial.lifecycle` (cron, hourly) | — | Cron | 1 | — | — | Trial reminders (day 10, 13), expiry → `read_only`, deletion warnings |
| `retention.prune` (cron, daily 02:00 UTC) | — | Cron | 1 | — | — |
| `backup.verify` (cron, monthly) | — | Cron | 1 | — | — | Restore latest dump into a temp DB, run sanity queries, report to staff |
| `paddle.process` | `{eventId}` | Webhook | 1 (ordered per subscription) | 5 | 30 s |

Priority: paid scheduled/manual scans > rechecks > free checks. Dead-lettered jobs are visible on the staff queue screen (S-72).

**Progress:** `scan.run` writes progress to `scans` every 5 pages and publishes via Postgres `NOTIFY scan_progress, '<scanId>'`; the API SSE endpoint listens and forwards.

---

## 10. Emails and notifications

All emails: React Email, plain-text alternative, accessible (real headings, alt text, 16 px body, 4.5:1 contrast), white-labelled where noted (W), with unsubscribe link for non-essential mail. Template IDs match `DESIGN_SPEC.md`.

| ID | Email | Trigger | Recipients | W |
| --- | --- | --- | --- | --- |
| E-01 | Verify your email | Sign-up | User | |
| E-02 | Magic sign-in link | Request | User | |
| E-03 | Reset password | Request | User | |
| E-04 | Invitation to organisation | Invite | Invitee | W (for client viewers) |
| E-05 | Welcome + next steps | First org created | Owner | |
| E-06 | First scan ready | Onboarding scan done | Requester | |
| E-07 | Scan completed summary | Scan done (per preference) | Opted-in members | |
| E-08 | Regression alert | Issue regressed or ≥ 10 new serious/critical | Opted-in members | |
| E-09 | Site verification failing | 3 failed re-verifications | Owner, admins | |
| E-10 | Weekly digest | Cron | Opted-in members | |
| E-11 | Report ready / report shared | Report rendered / sent | Requester / recipients | W |
| E-12 | Monthly client report | Schedule | Recipients | W |
| E-13 | Free check report | Free check email submitted | Visitor | |
| E-14 | Trial ending (day 10, day 13) | Cron | Owner | |
| E-15 | Trial ended, read-only | Cron | Owner | |
| E-16 | Payment receipt | Paddle sends its own receipts; we do **not** duplicate | — | |
| E-17 | Payment failed / past due | Paddle webhook | Owner | |
| E-18 | Subscription canceled / will end | Webhook | Owner | |
| E-19 | Plan changed | Webhook | Owner | |
| E-20 | Data deletion warning (7 days, 1 day) | Cron | Owner | |
| E-21 | Webhook disabled after failures | Delivery job | Owner, admins | |
| E-22 | Personal data export ready | Export job | User | |
| E-23 | Security notice: new sign-in / password changed | Auth events | User | |

In-app notifications mirror E-06, E-07, E-08, E-09, E-11, E-17, E-21 plus "issue assigned to you".

Slack/generic webhook events: `scan.completed`, `issue.regressed`, `issues.new_critical`, `site.verification_failed`. Generic webhooks are signed with HMAC-SHA256 (`X-Signature` header) and include `id`, `type`, `createdAt`, `data`.

---

## 11. Security requirements

### 11.1 Application

- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, domain `.<domain>`; CSRF protection for cookie-authenticated mutating requests (double-submit token or Origin check).
- Every input validated with Zod; output encoding by React; HTML from fix guides and statements sanitised with DOMPurify on the server.
- Authorization in one place: a `requireOrgRole(roles)` middleware + repository functions that require `orgId`. Client viewers additionally filtered by `client_access`.
- Tests: for every org-scoped endpoint, an automated test proves a user from org B gets 404 on org A's resource.
- Rate limits (Postgres-backed token bucket): auth (section 7.1), free checks (11.4), API keys 60/min, general 300/min per user.
- Security headers via Helmet and Caddy: HSTS (preload), CSP with nonces, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- Uploads: type sniffed (not trusted from extension), size-limited, SVG sanitised, stored in R2 with random keys, served via signed URLs or a separate cookie-less asset domain.
- Secrets at rest: webhook URLs and anything sensitive encrypted with AES-256-GCM (`ENCRYPTION_KEY`); API keys stored as SHA-256 hashes only.
- Staff access: TOTP required, impersonation read-only and audited, visible banner for staff.
- Dependencies: Dependabot + `pnpm audit` in CI (fail on high severity).

### 11.2 Scanner network guard (SSRF protection)

The scanner fetches URLs supplied by customers and the public. It **must** refuse anything internal.

1. Allow only `http:` and `https:`, ports 80 and 443.
2. Resolve the hostname (A and AAAA). Reject if **any** resolved address is in: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`, `::/128`, `::1/128`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96` mapped private ranges.
3. Pin the resolved IP for the connection (prevents DNS rebinding) for non-browser fetches (robots, sitemaps, verification).
4. Inside Playwright, `page.route('**/*')` checks every request (including subresources and redirects) against the same rules and aborts violations.
5. Re-check on every redirect; max 5 redirects.
6. The worker container has no access to the Docker network's Postgres port except via its own service account, and the cloud metadata endpoint is additionally blocked with an iptables rule on the host.
7. Unit tests cover every range, IPv6, decimal/octal IP notations (`http://2130706433`), and a redirect to a private address.

### 11.3 Scanner behaviour toward websites

- Honest user agent with a link to `/bot` explaining what we do and how to block us.
- Respect robots.txt; ≤ 1 request/second per host; never submit forms, never click "add to cart" or anything that changes state.
- Stop a scan if the site returns 429 or 503 three times; mark `partial`.

### 11.4 Free-checker abuse limits

- Turnstile required. One page only, 60 s cap.
- Per IP hash: 3 checks per hour, 10 per day. Per domain: 5 per day. Global: `FREE_CHECK_DAILY_CAP`.
- IP stored only as a salted SHA-256 hash (salt rotated monthly).
- Results expire after 30 days unless the email was submitted (then 90 days).

### 11.5 Privacy (GDPR)

- Data processing agreement available for agencies; subprocessors list public.
- Personal data export (`/me/export`) and account deletion supported; org deletion purges after 30 days.
- Scanner stores page HTML snippets of failing elements only; strips `value` attributes and obvious personal data patterns (emails, phone numbers) from snippets before storing.
- No third-party trackers in the app or marketing site; Umami only.

---

## 12. Billing with Paddle

### 12.1 Setup

- Products: Store, Growth, Agency, Agency Pro; each with monthly and annual prices (8 price IDs in env).
- Checkout: Paddle.js overlay opened from S-02 (pricing, signed-in) or S-44 (billing). `customData: { orgId }`, customer email prefilled.
- Customer portal link for card changes and invoices.

### 12.2 Webhook handling

1. `POST /webhooks/paddle`: verify `Paddle-Signature` with `PADDLE_WEBHOOK_SECRET` (reject > 5 min old). Insert into `paddle_events` (`event_id` PK makes duplicates no-ops). Return 200 immediately. Enqueue `paddle.process`.
2. Process by type:

| Event | Action |
| --- | --- |
| `customer.created` / `updated` | Store `paddle_customer_id` on org (via `custom_data.orgId`) |
| `subscription.created` / `activated` | Upsert `subscriptions`; set org `plan`, `billing_status = active`; evidence `plan_changed`; E-19 not sent on first activation (E-05 already) |
| `subscription.updated` | Upsert; apply plan change; if new limits exceeded, enforce downgrade rules (section 1.4) |
| `subscription.past_due` | `billing_status = past_due`; E-17; banner in app; scans continue for 7 days, then `read_only` |
| `subscription.paused` | `billing_status = paused` → read-only |
| `subscription.canceled` | `billing_status = canceled` → read-only; E-18; data retention countdown 30 days |
| `transaction.completed` | Upsert `invoices` |
| `transaction.payment_failed` | Log; E-17 if not already sent this period |

3. Processing must be idempotent and ordered by `occurred_at` per subscription (ignore events older than the stored state).
4. Plan resolution: price ID → plan via a map in `plans.ts`; unknown price ID → error to Sentry, no state change.

### 12.3 Plan enforcement points

Site creation, site resume, page limit setting, scan frequency setting, manual scan, invitation (member count), client viewer invitation, branding endpoints, report schedules, webhooks (Slack), API keys, custom domain, AI suggestion cap. Each returns `422 PLAN_LIMIT` with `details: { limit, current, upgradeTo }` so the UI can show the right upgrade prompt.

---

## 13. Quality, performance and operations

### 13.1 Non-functional targets

| Area | Target |
| --- | --- |
| App pages (p75, logged in) | Largest Contentful Paint < 2.0 s on a mid-range laptop; interaction latency < 200 ms |
| API | p95 < 300 ms for reads, < 800 ms for writes (excluding job work) |
| Scan throughput | ≥ 250 pages in < 15 min on the 2-OCPU server; free check < 60 s |
| Availability | 99.5% monthly for app and API (single server; documented maintenance windows) |
| Data loss | RPO 24 h (nightly backup), RTO 4 h (documented restore runbook) |
| Accessibility of our own product | WCAG 2.2 AA; zero axe violations in CI; manual keyboard + NVDA + VoiceOver pass before each phase release |
| Browsers | Last 2 versions of Chrome, Edge, Firefox, Safari; iOS Safari 17+; Android Chrome |
| Responsive | Full functionality from 360 px wide |

### 13.2 Testing

- **Unit (Vitest):** scanner pure functions (normalisation, grouping, sampling, fingerprinting, status machine, score), SSRF guard, plan limits, Paddle event processing, permission checks.
- **Scanner fixtures:** a local fixture server (`packages/scanner/fixtures`) with known-bad pages (missing alt, low contrast, unlabeled inputs, bad headings) and a Shopify-like and WordPress-like URL structure. Golden-file tests compare results.
- **Integration (Vitest + Supertest + test Postgres):** every endpoint, including cross-org 404 tests.
- **End-to-end (Playwright):** sign-up → onboarding → add fixture site → verify (file method on fixture server) → scan → view issue → ignore → generate report → invite client → client sees portal. Billing e2e in Paddle sandbox (manual checklist + webhook simulation tests).
- **Accessibility:** `@axe-core/playwright` on every app route in e2e; storybook-style component tests with axe for `packages/ui`.
- **Load:** a script that enqueues 50 site scans against fixture server to check queue behaviour and memory.

### 13.3 Observability and runbooks

- Structured logs with `requestId`, `orgId`, `jobId`; log retention 14 days on disk (rotated).
- Sentry for web, API, worker; release tags = git SHA.
- Health endpoints: `GET /health` (API up), `GET /health/deep` (DB, queue lag, disk) — monitored by UptimeRobot.
- Metrics table/view for staff dashboard: queue depth, scans per day, scan failure rate, average scan time, free checks per day, trial → paid conversion, MRR (from subscriptions).
- Runbooks in `docs/runbooks/`: restore from backup, rotate secrets, scanner stuck, disk full, Paddle webhook replay, moving to a second server.

### 13.4 Deployment

- GitHub Actions builds arm64 images for web, api, worker; pushes to GHCR; SSH deploy runs `docker compose pull && docker compose up -d` with migrations run first in a one-off container.
- Zero-downtime-ish: Caddy health checks; worker drains (finishes current page batch) on SIGTERM; scans interrupted mid-way resume as `queued` on restart.
- Marketing site deploys to Cloudflare Pages on push to `main` (path filter `apps/site`, `packages/fix-guides`).
- Nightly `pg_dump` (compressed, encrypted with `age`) to R2; keep 14 daily + 8 weekly + 6 monthly.

---

## 14. Phased build plan

### 14.1 Phase overview

| Phase | Weeks (≈15–20 h/week) | Outcome | Design input needed (DESIGN_SPEC phase) |
| --- | --- | --- | --- |
| 0 — Foundation | 1–2 | Repo, CI/CD, server, database, UI kit base, waitlist page | D1 Design system foundations |
| 1 — Scan engine | 2–4 | CLI scans real sites and produces a PDF report | D1 (report template R-01/R-02) |
| 2 — Core app | 4–8 | Design partners use the app: sites, scans, issues, reports, team | D2 Core app screens |
| 3 — Marketing, free checker, fix guides, AI | 7–9 | Public site that attracts leads without ads | D3 Marketing site + free checker |
| 4 — Billing and agency | 9–11 | Self-serve payment, plan limits, white-label, client portal | D4 Billing + agency screens |
| 5 — Evidence and alerts | 11–13 | Reasons to keep paying: evidence pack, alerts, integrations | D5 Evidence + notifications |
| 6 — Admin, API, hardening, launch | 13–15 | Safe to sell to strangers at scale; public launch | D6 Admin + edge states |
| 7 — Distribution | 16+ | WordPress plugin and Shopify app | D7 Plugin and app surfaces |

Phases 2 and 3 overlap on purpose: P3 chunks can start once P2-08 (worker) is done.

### 14.2 Chunk format

> **ID — Title** · *Depends on:* … · *Size:* S (≤ 1 day) / M (2–3 days) / L (4–5 days, split if possible)
> What to build. **Acceptance criteria** as a checklist.

---

### Phase 0 — Foundation

**P0-01 — Monorepo scaffold** · *Depends on:* — · *Size:* S
Create the layout in section 2.1 with pnpm workspaces and Turborepo; empty apps that build and start.
- [ ] `pnpm install && pnpm build` succeeds from a clean clone.
- [ ] `pnpm dev` starts web (3000), site (3001), api (4000), worker together.
- [ ] Shared `tsconfig.base.json` with `strict: true`; each package extends it.

**P0-02 — Code quality tooling** · *Depends on:* P0-01 · *Size:* S
ESLint (typescript-eslint, jsx-a11y, import order), Prettier, Vitest, lint-staged + Husky pre-commit, Conventional Commits check.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` work at the root and per package.
- [ ] `eslint-plugin-jsx-a11y` runs in recommended strict mode for `apps/web`, `apps/site`, `packages/ui`.

**P0-03 — Continuous integration** · *Depends on:* P0-02 · *Size:* S
GitHub Actions: install (cached), lint, typecheck, unit tests, build; Postgres service container for integration tests.
- [ ] Pull requests are blocked unless CI is green.
- [ ] CI time under 8 minutes.

**P0-04 — Local development environment** · *Depends on:* P0-01 · *Size:* S
`infra/docker-compose.dev.yml` with Postgres 16, Mailpit (email catcher), MinIO (S3-compatible, stands in for R2), and the scanner fixture server (added in P1-12).
- [ ] One command starts all services; `README.md` explains setup in under 10 steps.
- [ ] `.env.example` complete for local.

**P0-05 — Production server** · *Depends on:* — · *Size:* M
Provision the ARM VM (Oracle Always Free; Hetzner fallback). Ubuntu LTS, Docker, Caddy, UFW (80/443 only, SSH key-only on a non-default port), unattended upgrades, fail2ban, swap file, iptables rule blocking `169.254.169.254` from containers.
- [ ] `https://app.<domain>`, `https://api.<domain>` and `https://staging.app.<domain>` serve a placeholder over HTTPS.
- [ ] Server hardening checklist in `docs/runbooks/server.md` completed and dated.

**P0-06 — Deploy pipeline** · *Depends on:* P0-03, P0-05 · *Size:* M
Build multi-arch images, push to GHCR, deploy to staging on every merge to `main`, to production on a tagged release (`v*`). Migrations run before app containers restart.
- [ ] A merge to `main` is live on staging within 10 minutes without manual steps.
- [ ] Rollback documented: redeploy previous tag in one command.

**P0-07 — Database package** · *Depends on:* P0-04 · *Size:* M
Drizzle config, client, migration runner, `updated_at` trigger, UUID v7 helper, base tables `users`, `organizations`, `memberships`, `audit_log`, `feature_flags`; typed repository pattern requiring `orgId`; seed script.
- [ ] `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset` work.
- [ ] A repository function cannot be called without `orgId` (type error).
- [ ] App DB user has no `DELETE`/`UPDATE` on append-only tables (`audit_log`, later `evidence_events`).

**P0-08 — UI kit foundation** · *Depends on:* P0-01, design D1 tokens · *Size:* L
In `packages/ui`: Tailwind v4 theme from DESIGN_SPEC tokens (light and dark), fonts, focus ring, and the base components: Button, IconButton, Link, Input, Textarea, Select, Checkbox, Radio, Switch, Label/Field/HelpText/ErrorText, Badge, SeverityBadge, StatusBadge, Card, Tabs, Dialog, Drawer, Toast, Tooltip, DropdownMenu, Table (sortable header, empty state), Pagination, Skeleton, Spinner, Alert/Banner, EmptyState, Breadcrumbs, Avatar, Kbd, CodeBlock (copy button).
- [ ] Every component documented in a `/dev/ui` route (dev only) showing all variants and states.
- [ ] Every component passes axe and keyboard checks; focus visible in both themes.
- [ ] Theme follows system preference with a manual override stored per user.

**P0-09 — Logging, errors, health** · *Depends on:* P0-01 · *Size:* S
pino logger with request IDs, Sentry in all apps, `GET /health` and `/health/deep`, UptimeRobot monitors.
- [ ] A thrown error in each app appears in Sentry with release SHA.
- [ ] Health checks alert by email within 5 minutes of downtime.

**P0-10 — Backups** · *Depends on:* P0-05 · *Size:* S
Nightly encrypted `pg_dump` to R2 with the retention scheme in 13.4; restore runbook.
- [ ] A restore from yesterday's backup into a fresh database has been performed and timed; result recorded in the runbook.

**P0-11 — Waitlist landing page** · *Depends on:* P0-08 · *Size:* S
Single page on Cloudflare Pages (from `apps/site`) with value proposition and waitlist form → `POST /public/waitlist` with Turnstile.
- [ ] Form works with keyboard and screen reader; success and error states announced (`aria-live`).
- [ ] Consent checkbox not pre-ticked; privacy link present.

---

### Phase 1 — Scan engine (`packages/scanner` + CLI)

**P1-01 — URL normalisation and skip patterns** · *Depends on:* P0-02 · *Size:* S
Implement section 6.1 and the skip-pattern list.
- [ ] 40+ unit tests including tracking params, trailing slashes, `www`, fragments, non-HTML extensions.

**P1-02 — Network guard (SSRF)** · *Depends on:* P0-02 · *Size:* M
Implement section 11.2 as `assertPublicUrl(url)` and `createGuardedFetch()` plus a Playwright route handler.
- [ ] Unit tests for every blocked range, IPv6, IPv4-mapped IPv6, decimal/octal/hex IP forms, `localhost` variants, redirect to private IP, DNS returning mixed public + private.
- [ ] Guard is the **only** way the scanner makes HTTP requests (lint rule bans direct `fetch` in `packages/scanner` outside the guard module).

**P1-03 — robots.txt and sitemap discovery** · *Depends on:* P1-01, P1-02 · *Size:* M
Section 6.2 steps 1–2 with a robots parser and streaming XML sitemap parser (gzip support).
- [ ] Handles sitemap indexes, `.xml.gz`, 50,000-URL cap, malformed XML (skips, logs, continues).
- [ ] Disallowed paths never appear in output.

**P1-04 — Fallback crawler** · *Depends on:* P1-03 · *Size:* M
BFS link crawl per 6.2 step 3 using the guarded fetch and an HTML parser (no browser), with rate limiting.
- [ ] Stays on host; depth ≤ 3; ≤ 2,000 URLs; respects crawl-delay and the 1 request/second default.

**P1-05 — Platform detection** · *Depends on:* P1-02 · *Size:* S
Detect Shopify (`Shopify.theme`, `cdn.shopify.com`, `x-shopid` header), WordPress (`/wp-json/`, generator meta, `wp-content`), WooCommerce (WP + `woocommerce` classes), Webflow, Wix, Squarespace.
- [ ] Correct on 20 real reference sites (list kept in `fixtures/platforms.json`).

**P1-06 — Template grouping** · *Depends on:* P1-01, P1-05 · *Size:* M
Section 6.3.
- [ ] Unit tests per platform with realistic URL lists; 400 product URLs → 1 template.

**P1-07 — Sampling** · *Depends on:* P1-06 · *Size:* S
Section 6.4 including stability preference and rotation (takes previous page list as input).
- [ ] Deterministic given the same inputs and seed; never exceeds `pageLimit`; always includes home and pinned URLs.

**P1-08 — Page runner** · *Depends on:* P1-02 · *Size:* L
Section 6.5: Playwright browser pool, contexts, route guard, resource blocking, waits, axe run with tags by standard, pass counts, optional screenshots, timeouts, recycling, concurrency.
- [ ] Runs 250 fixture pages with concurrency 2 without memory above 2 GB.
- [ ] A page that hangs is marked `timeout` and does not stall the run.
- [ ] axe-core version recorded in output.

**P1-09 — Result normalisation and fingerprinting** · *Depends on:* P1-06, P1-08 · *Size:* M
Section 6.6: convert axe output into `{rule, impact, wcag, templateKey, selector, normalizedSelector, snippet, target, page}` records; group into issues with fingerprints; strip `value` attributes and personal-data patterns from snippets; truncate to 2,000 chars.
- [ ] Same element on 50 pages of one template = 1 issue with 50 occurrences.
- [ ] Generated IDs and CSS-in-JS hashes do not change fingerprints between two runs of the fixture site with randomised IDs.

**P1-10 — Status machine and score** · *Depends on:* P1-09 · *Size:* M
Sections 6.7 and 6.8 as pure functions: `diffScans(previousIssues, currentResults, scannedPages) → {created, stillOpen, fixed, regressed}` and `scoreScan(pageResults)`.
- [ ] Table-driven tests covering every row of the 6.7 table, including partial scans and failed pages.

**P1-11 — Rule knowledge base** · *Depends on:* — · *Size:* M (content-heavy)
Seed file with every axe rule included in the WCAG tags used: plain-English title, description, who is affected, WCAG criteria, level, default impact, weight. Titles written for non-experts (see DESIGN_SPEC voice).
- [ ] Every rule axe can return under our tags has an entry (test fails if axe adds a rule we don't describe).

**P1-12 — CLI and fixtures** · *Depends on:* P1-03 … P1-10 · *Size:* M
`pnpm scan <url> --limit 100 --standard wcag22aa --out result.json` plus the fixture server with known-bad pages and golden-file tests.
- [ ] CLI prints a progress line per page and a summary table.
- [ ] Golden tests pass in CI using the fixture server.

**P1-13 — Report renderer v0** · *Depends on:* P1-12, design R-01/R-02 · *Size:* M
`packages/reports`: React templates for R-01 Scan summary and R-02 Full report rendered to HTML, printed to PDF with Playwright (A4 and US Letter, tagged PDF where Chromium supports it, header/footer with page numbers). CLI flag `--pdf`.
- [ ] PDF opens correctly in Acrobat, Preview and Chrome; text is selectable; headings bookmarked.
- [ ] "What automated testing cannot check" section always present.

**P1-14 — Benchmark** · *Depends on:* P1-12 · *Size:* S
Run against 20 real sites on the production server; record pages/minute, memory peak, failure reasons.
- [ ] Results in `docs/benchmarks/2026-xx.md`; top 25 most frequent rules listed (input for fix guides P3-05).

---

### Phase 2 — Core app

**P2-01 — Schema for core app** · *Depends on:* P0-07 · *Size:* M
Migrations for: `invitations`, `sites`, `scans`, `pages`, `page_results`, `issues`, `issue_occurrences`, `issue_events`, `issue_notes`, `rules`, `fix_guides`, `reports`, `in_app_notifications`, `notification_preferences`, plus Better Auth tables.
- [ ] All indexes and constraints from section 5 present; migration reversible on staging.

**P2-02 — Authentication** · *Depends on:* P2-01, P0-08 · *Size:* L
Better Auth in API; screens S-10 Sign up, S-11 Sign in, S-12 forgot/reset/verify/magic-link; optional Google sign-in behind a flag; rate limits; E-01, E-02, E-03, E-23.
- [ ] A user can sign up, verify, sign in with password or magic link, reset password, sign out.
- [ ] Unverified users can use the app but see a banner; they cannot invite others until verified.
- [ ] Errors are specific and accessible (field-level, announced, focus moves to error summary).

**P2-03 — Organisations and authorization core** · *Depends on:* P2-02 · *Size:* M
`POST /orgs`, org context resolution from slug, `requireOrgRole`, standard error format, cross-org 404 test helper, audit log writer.
- [ ] Integration test template that every later endpoint test reuses for the cross-org check.

**P2-04 — App shell** · *Depends on:* P2-03 · *Size:* M
Layout per DESIGN_SPEC: sidebar navigation (collapsible), top bar with org switcher, search/command palette trigger, notifications bell (placeholder), user menu, breadcrumbs, skip link, global banners region (S-82, with the priority order from DESIGN_SPEC), toasts.
- [ ] Shell usable at 360 px (navigation becomes a drawer), keyboard-operable, landmarks correct (`header`, `nav`, `main`).
- [ ] Command palette (S-81) can jump to any site and any settings page.

**P2-05 — Onboarding wizard** · *Depends on:* P2-04, P2-06 · *Size:* M
S-14: organisation name + type (agency/store) → add first site (URL, detected platform) → start 10-page onboarding scan → watch live progress → land on site overview with a "Verify to enable monitoring" prompt. Skippable; resumable.
- [ ] A new user reaches their first results in under 3 minutes on a typical site.
- [ ] Agency type sets defaults (client name field shown, overview sorted worst-first).

**P2-06 — Sites** · *Depends on:* P2-03 · *Size:* M
Sites API (7.3, excluding verify) + S-21 Sites list + S-22 Add site dialog + platform detection call; duplicate detection; plan limit check stub (real limits in P4-01).
- [ ] Adding `https://www.example.com/shop?x=1` stores `https://www.example.com`.
- [ ] List supports search, filter by status/platform/client, sort, and empty state.

**P2-07 — Ownership verification** · *Depends on:* P2-06, P1-02 · *Size:* M
Methods `meta`, `dns`, `file` (section 6.9); S-23 with copy buttons and per-method instructions (Shopify theme.liquid, WordPress header plugin, DNS providers); `site.reverify` job; E-09.
- [ ] Each method verified against the fixture server and a real domain.
- [ ] Failure message says exactly what was found (e.g. "Found the meta tag, but the token doesn't match").

**P2-08 — Worker and queue** · *Depends on:* P2-01, P1-12 · *Size:* L
`apps/worker` with pg-boss; `scan.run` wraps `packages/scanner` and persists pages, page results, issues, occurrences, events, raw JSON to R2; `scan.process` applies the status machine and computes counts/score; graceful shutdown and resume.
- [ ] Killing the worker mid-scan and restarting completes or cleanly re-queues the scan.
- [ ] A 250-page scan writes correct counts; issue table unique constraint never violated.

**P2-09 — Scheduling and manual scans** · *Depends on:* P2-08 · *Size:* M
`scan.schedule` cron, `next_scan_at` calculation in org time zone, "Scan now" with per-day limits, single running scan per site, cancel.
- [ ] Weekly scan fires at the configured day/hour ± 10 minutes across a DST change (test).
- [ ] Second "Scan now" while one runs returns `409 SCAN_IN_PROGRESS`.

**P2-10 — Live scan progress** · *Depends on:* P2-08 · *Size:* M
SSE endpoint + `NOTIFY` bridge; S-28 Scan detail showing phases (discovering, scanning x of y, processing), current URL, and an accessible progress bar with throttled `aria-live` updates (every 10% or 15 s).
- [ ] Reconnects automatically; falls back to polling every 5 s if SSE fails.

**P2-11 — Site overview** · *Depends on:* P2-08 · *Size:* M
S-24: score with band and explanation, counts by severity, new/fixed/regressed since last scan, trend chart (last 12 scans) with table alternative, top 5 issues to fix first (ordered by impact × occurrences), next scheduled scan, verification status.
- [ ] Chart has a visually hidden data table and a text summary ("Score rose from 62 to 78 over 6 scans").

**P2-12 — Issues list** · *Depends on:* P2-08 · *Size:* L
S-25 with filters (status, severity, WCAG criterion, template, rule, assignee, regression, needs review), grouping (by rule / by template / flat), sorting, URL-synced filter state, saved default view per user, bulk selection.
- [ ] 2,000 issues render with server pagination and stay responsive.
- [ ] Filters operable by keyboard; result count announced on change.

**P2-13 — Issue detail** · *Depends on:* P2-12, P1-11 · *Size:* L
S-26: plain-English title, severity, WCAG criterion with link, who is affected, where it occurs (pages + selectors, paginated), HTML snippet (syntax-highlighted, copyable), axe failure summary, fix-guide slot (filled in P3-06), AI suggestion slot (P3-07), timeline from `issue_events`, notes.
- [ ] Opens as a side drawer from the list (keeps list context) and as a full page via direct URL.
- [ ] Focus returns to the originating row when the drawer closes.

**P2-14 — Issue actions** · *Depends on:* P2-13 · *Size:* M
Ignore/unignore with reason and note, assign, due date, notes (markdown, edit/delete), bulk actions (≤ 200), recheck job (`issue.recheck`), events written for each action.
- [ ] Ignoring with `accepted_risk` or `wont_fix` requires a note.
- [ ] Recheck updates the issue within 2 minutes on a typical page and shows the outcome in a toast.

**P2-15 — Scan history and comparison** · *Depends on:* P2-08 · *Size:* S
S-27 list (date, trigger, pages, score, counts, status) and scan detail diff (new/fixed/regressed lists).
- [ ] Partial and failed scans show reasons and a "what to do" hint.

**P2-16 — Pages, templates and site settings** · *Depends on:* P2-06, P2-08 · *Size:* M
S-29 pages grouped by template with last result per page; pin/unpin pages; S-34 site settings (name, client, frequency, day/hour, page limit, standard, pinned URLs, excluded paths with live preview of matches, pause/resume, delete with confirmation).
- [ ] Excluded-path preview shows how many discovered URLs match.

**P2-17 — Team members and invitations** · *Depends on:* P2-03, P2-18 · *Size:* M
S-41 members list, invite (admin/member), change role, remove, resend/revoke; S-13 accept invitation (existing or new account); E-04; audit log entries.
- [ ] Invitation tokens are single-use, expire after 7 days, stored hashed.

**P2-18 — Email infrastructure** · *Depends on:* P2-08 · *Size:* M
`packages/emails` with shared layout (DESIGN_SPEC email section), `email.send` job, Resend adapter, Mailpit locally; templates E-01 – E-07; plain-text versions; unsubscribe handling for non-essential mail.
- [ ] Every template has a preview route in development and passes a contrast check.

**P2-19 — On-demand reports** · *Depends on:* P1-13, P2-08 · *Size:* M
S-30 generate R-01/R-02 for a scan, list reports, download (signed URL), send by email (E-11) with optional message.
- [ ] Report generation for a 250-page scan completes in under 2 minutes.

**P2-20 — Organisation overview** · *Depends on:* P2-11 · *Size:* M
S-20: for agencies, a table of all sites worst-first (score, critical/serious open, regressions, last scan, next scan, verification) with client grouping; for stores with one site, redirect to that site's overview.
- [ ] Sorting and filtering persist per user.

**P2-21 — Account settings** · *Depends on:* P2-02 · *Size:* S
S-48: name, avatar, time zone, theme preference, password change, active sessions with revoke, delete account (P6-09 completes the data side).

**P2-22 — CSV export** · *Depends on:* P2-12 · *Size:* S
Issues export respecting current filters; columns documented.
- [ ] Opens correctly in Excel and Google Sheets (UTF-8 BOM, escaped quotes).

**P2-23 — Phase 2 accessibility and e2e gate** · *Depends on:* all P2 · *Size:* M
Full e2e flow (13.2) green; manual keyboard + NVDA (Windows) + VoiceOver (macOS) test of every P2 screen; fixes merged.
- [ ] Test notes saved in `docs/a11y/phase-2.md` with date and tester.
- [ ] Three design partners onboarded on production.

---

### Phase 3 — Marketing site, free checker, fix guides, AI

**P3-01 — Marketing site framework** · *Depends on:* P0-08, design D3 · *Size:* L
`apps/site` static export: shared header/footer, S-01 Home, S-06 For agencies, S-07 legal pages and `/bot`, S-08 blog + changelog (MDX), metadata, Open Graph images, `sitemap.xml`, `robots.txt`, Umami.
- [ ] Lighthouse: Performance ≥ 95, Accessibility 100, SEO 100, Best Practices ≥ 95 on Home.
- [ ] No cookies set; no third-party scripts except Turnstile on forms.

**P3-02 — Pricing page** · *Depends on:* P3-01 · *Size:* S
S-02 driven by `GET /public/plans`, monthly/annual toggle, comparison table, FAQ, "Start free trial" CTA; when signed in, buttons open Paddle checkout (wired in P4-02).
- [ ] Comparison table is a real `<table>` with row and column headers.

**P3-03 — Free checker backend** · *Depends on:* P2-08 · *Size:* M
`POST /public/free-checks`, separate `free-check.run` lane, one page, 60 s cap, limits in 11.4, results stored in `free_checks`, PDF via `report.render` (R-06 Free check report), E-13.
- [ ] Load test: 30 free checks in 5 minutes never delay a paid scan's start by more than 1 minute.

**P3-04 — Free checker UI** · *Depends on:* P3-03, P3-01 · *Size:* M
S-03: URL input with validation, Turnstile, progress state, result (score, counts, top issues with plain-English explanations, "what this can't check" note), email capture with consent, CTA to start trial with the URL pre-filled.
- [ ] Shareable result URL works for 30 days; result page has `noindex`.

**P3-05 — Fix guide pipeline and first 50 guides** · *Depends on:* P1-14 · *Size:* L (content-heavy)
Markdown format with front matter (`rule_id`, `platform`, `title`, `summary`, `reviewed_at`), sections (What's wrong, Who it affects, How to fix on <platform>, Code example, How to check your fix). Loader + validation + seed into `fix_guides`. Write guides for the top 25 rules × Shopify and WordPress.
- [ ] CI fails if a guide is missing required sections or front matter.
- [ ] Each guide has been tested by actually applying the fix on a fixture/test theme.

**P3-06 — Fix guide pages and in-app embedding** · *Depends on:* P3-05, P2-13 · *Size:* M
S-04 index (filter by platform, search), S-05 article (table of contents, copyable code, related guides, CTA), in-app guide panel on issue detail (S-26) chosen by site platform with fallback to `generic`.
- [ ] Guides render identically in the site and the app (shared renderer).

**P3-07 — AI fix suggestions** · *Depends on:* P2-13 · *Size:* M
Provider interface + Gemini adapter, prompt per section 6.10, input scrubbing, output validation, cache, per-org monthly cap, `ai_usage`, feature flag, UI states (generate, loading, result with label, report bad suggestion, cap reached).
- [ ] No request is made when a cached suggestion exists.
- [ ] Snippets sent to the provider contain no emails or phone numbers (unit test).

**P3-08 — Free check to sign-up conversion** · *Depends on:* P3-04, P2-05 · *Size:* S
"Monitor this site" carries the URL into sign-up and onboarding; `free_checks.converted_org_id` set.

---

### Phase 4 — Billing and agency features

**P4-01 — Plans and limit enforcement** · *Depends on:* P2 complete · *Size:* M
`plans.ts` (section 1.4), `assertWithinPlan(org, feature, nextValue)` used at every point in 12.3, `422 PLAN_LIMIT` errors, usage endpoint, UI upgrade prompts (DESIGN_SPEC pattern).
- [x] Test per enforcement point.

**P4-02 — Paddle checkout and billing page** · *Depends on:* P4-01 · *Size:* M
Sandbox + live products and prices, Paddle.js loaded only on pricing/billing pages, checkout endpoint, S-44 Billing (current plan, usage meters, change plan, cancel/resume, customer portal link, invoices).
- [x] Sandbox purchase activates the plan in the app within 30 seconds.

**P4-03 — Paddle webhooks** · *Depends on:* P4-02 · *Size:* M
Section 12.2 in full, with replay tooling for staff.
- [x] Duplicate and out-of-order events are handled (tests with recorded payloads).

**P4-04 — Plan changes and downgrades** · *Depends on:* P4-03 · *Size:* M
Upgrade (immediate, prorated), downgrade (next period) with preview of price; downgrade flow that asks which sites/members to pause or remove when over the new limit; cancel at period end with reason survey; resume.
- [x] No data is deleted by a downgrade; paused sites are clearly labelled.

**P4-05 — Trial lifecycle and read-only mode** · *Depends on:* P4-01 · *Size:* M
`trial.lifecycle` job, E-14, E-15, E-20; read-only mode (all mutating endpoints return `402 BILLING_REQUIRED` except billing and data export); banners per DESIGN_SPEC.
- [x] Read-only org can view everything and export, cannot scan or invite.

**P4-06 — Payment problems** · *Depends on:* P4-03 · *Size:* S
Past-due banner, 7-day grace period then read-only, E-17, E-18, E-19.

**P4-07 — Branding (white-label)** · *Depends on:* P4-01 · *Size:* L
S-43: display name, light/dark logo upload with preview, primary colour with automatic contrast check and suggested accessible alternative, email sender name, report footer, "hide PRODUCT_NAME branding". Applied to reports (R-01 … R-05), client-facing emails (E-04 for clients, E-11, E-12), and client portal.
- [x] Live preview of a report cover, an email header and the portal header.
- [x] Colours failing 4.5:1 on white cannot be saved for buttons/links (user sees the suggested alternative).

**P4-08 — Client viewers** · *Depends on:* P2-17, P4-07 · *Size:* M
Invite client viewers to one or more sites (S-42), manage their site access, remove; branded invitation email.
- [x] A client viewer can never see another site or any org settings (tests).

**P4-09 — Client portal** · *Depends on:* P4-08 · *Size:* L
S-60 portal home (their sites, status in plain language), S-61 site view (score, trend, open issues by severity in simple language, progress since last month, published reports, evidence pack download, notes marked visible to client). Agency branding throughout; no upsell or PRODUCT_NAME marketing.
- [x] Portal passes the same accessibility gate as the main app.

**P4-10 — Agency overview and cross-site views** · *Depends on:* P2-20 · *Size:* M
S-20 enhancements: group by client, cross-site "most common issues" (same rule across many sites → fix once in shared theme), R-05 Agency overview report.
- [x] Cross-site view links each rule to the affected sites and counts.

**P4-11 — Scan frequency by plan** · *Depends on:* P4-01, P2-09 · *Size:* S
Daily toggles with plan caps (Agency: 5 daily sites).

---

### Phase 5 — Evidence, alerts and integrations

**P5-01 — Evidence events and timeline** · *Depends on:* P2 complete · *Size:* M
Write every event type in 5.4 at its source; S-31 timeline with filters and date range; append-only verified by test (app DB user lacks update/delete).
- [x] Every row on the timeline links to its source (scan, issue, check, report).

**P5-02 — Manual checks** · *Depends on:* P5-01 · *Size:* M
S-32: log a check (type, date, tester name, tools, result, notes, optional attachment), list, edit, delete (audited); built-in guidance for each check type (what to test, how long it takes).
- [x] Attachments scanned for type and size; served via signed URLs.

**P5-03 — Accessibility statement generator** · *Depends on:* P5-01 · *Size:* L
S-33 multi-step form (organisation, scope, standard targeted, measures taken, known limitations — pre-filled from open issues the user selects, feedback contact, enforcement procedure note for EU sites, date), live preview, versioning, publish to a public URL with the org's branding, embed snippet. Clear "template, not legal advice" notice.
- [x] Published statement is valid HTML, accessible, and shows its last-updated date.

**P5-04 — Evidence pack** · *Depends on:* P5-01, P5-02, P1-13 · *Size:* M
R-03 PDF: cover, summary, scan history table and trend, issues fixed with dates, open issues with assignee and due date, ignored issues with reasons, manual-check log, published statement link, methodology and limitations. Date-range selectable.
- [x] Generated for a site with 12 months of history in under 3 minutes.

**P5-05 — Alerts and notification centre** · *Depends on:* P2-18 · *Size:* M
Regression and new-critical detection in `scan.process`; E-08; in-app notifications (S-50 bell + panel, mark read, link to item); per-user preferences (S-45); "issue assigned to you" notification.
- [ ] No duplicate alerts for the same regression across scans.

**P5-06 — Weekly digest** · *Depends on:* P5-05 · *Size:* S
E-10 summarising each site's score change, new/fixed counts and overdue assigned issues.

**P5-07 — Integrations: Slack and generic webhooks** · *Depends on:* P5-05 · *Size:* M
S-46: add Slack incoming webhook or generic URL, choose events and sites, test button, delivery log (last 20), auto-disable + E-21. Signed payloads for generic webhooks.
- [ ] Webhook URL validated with the SSRF guard.

**P5-08 — Scheduled client reports** · *Depends on:* P4-07, P2-19 · *Size:* M
Report schedules UI (inside S-30 for agency plans), `report.schedule` job, R-04 Client monthly report, E-12 branded.
- [ ] Recipients receive the report on the configured day; failures retried and reported.

**P5-09 — My tasks** · *Depends on:* P2-14 · *Size:* S
S-49: issues assigned to me across sites, grouped by due date (overdue, this week, later, no date).

**P5-10 — Data retention** · *Depends on:* P2-08 · *Size:* S
`retention.prune` per section 5.8 with dry-run mode and staff report.

---

### Phase 6 — Admin, public API, hardening and launch

**P6-01 — Staff access** · *Depends on:* P2-02 · *Size:* M
`is_staff` flag, TOTP enrolment and enforcement for staff sessions, `/staff` shell.

**P6-02 — Organisation admin** · *Depends on:* P6-01 · *Size:* M
S-70 org search/list (plan, status, sites, MRR, last activity), S-71 org detail (members, sites, scans, errors, billing events), extend trial, plan override with expiry, read-only impersonation with banner and audit.

**P6-03 — Queue and system monitor** · *Depends on:* P6-01 · *Size:* S
S-72 queue depths, running jobs, failures, dead-letter retry/delete, scan failure rate, average scan duration, disk/memory of server.

**P6-04 — Leads** · *Depends on:* P6-01, P3-03 · *Size:* S
S-73 free checks and waitlist with consent status, conversion flag, CSV export of consented leads only.

**P6-05 — Content review and flags** · *Depends on:* P6-01, P3-07 · *Size:* S
S-74 flagged AI suggestions (approve/delete, promote to written guide draft), S-75 feature flags with org allow-lists.

**P6-06 — API keys and public API** · *Depends on:* P4-01 · *Size:* M
S-47 create/revoke keys (secret shown once with copy), scopes, last used; key auth middleware; rate limits; OpenAPI generation; docs site at `docs.<domain>`.
- [ ] Every public endpoint documented with examples; docs pass the accessibility gate.

**P6-07 — Custom portal domain** · *Depends on:* P4-09 · *Size:* M
CNAME + TXT verification, Caddy on-demand TLS `ask` endpoint, host-based routing to the org's portal, status display in S-43.
- [ ] Certificates issued automatically; unverified domains never get a certificate.

**P6-08 — Audit log UI** · *Depends on:* P2-03 · *Size:* S
S-51 searchable, filterable list for owners and admins; CSV export.

**P6-09 — Privacy operations** · *Depends on:* P2-21 · *Size:* M
Personal data export (JSON + attachments zip, E-22), account deletion, org deletion with 30-day purge across DB and R2, subprocessors page, DPA download.
- [ ] Purge job verified on staging: no rows or objects remain for the deleted org.

**P6-10 — Security review** · *Depends on:* all · *Size:* M
OWASP ASVS level 1 checklist, SSRF test suite rerun, authorization matrix test (every role × every endpoint), dependency audit, secret scanning, CSP report-only → enforce.
- [ ] Findings fixed or recorded with an accepted-risk note.

**P6-11 — Performance pass** · *Depends on:* all · *Size:* M
Measure against 13.1; fix slow queries (EXPLAIN on top 10), add missing indexes, bundle analysis, image optimisation, load test with 50 concurrent scans queued.

**P6-12 — Edge states** · *Depends on:* P0-08 · *Size:* S
S-80 404, 500, maintenance mode (env flag shows maintenance page, worker pauses), offline toast, session-expired handling (re-auth dialog preserving unsaved form input).

**P6-13 — Launch readiness** · *Depends on:* all · *Size:* S
Runbooks complete, restore test repeated, monitoring alerts tested, status page (UptimeRobot public page), support email + help centre basics (10 articles), legal pages final.
- [ ] Launch checklist in `docs/launch.md` signed off.

---

### Phase 7 — Distribution

**P7-01 — WordPress plugin** · *Depends on:* P6-06 · *Size:* L
`plugins/wordpress`: settings page to paste an API key or connect via OAuth-like handshake, automatic ownership verification (`plugin` method), dashboard widget (score, open critical/serious, last scan, link to app), "Scan now" button, uninstall cleanup. GPL-2.0-or-later licence. WordPress coding standards, nonces, capability checks, escaping. Submit to WordPress.org.
- [ ] Passes Plugin Check (PCP) with no errors; tested on the two latest WordPress versions and PHP 8.1–8.3.

**P7-02 — Shopify app** · *Depends on:* P6-06 · *Size:* L
`plugins/shopify` from Shopify's current Node/Remix app template: OAuth install creates or links an org and site (`shopify` verification), embedded admin page with score and top issues (Polaris UI), deep links into our app, mandatory GDPR webhooks, billing through Shopify's Billing API per current App Store rules (re-check rules before starting), app review submission.
- [ ] Passes Shopify's automated checks and app review.

**P7-03 — Platform deep links** · *Depends on:* P7-02 · *Size:* S
In issue detail for Shopify sites, link to the theme editor / code editor for the likely file (`sections/*.liquid`, `snippets/*.liquid`) when the template is known; for WordPress, link to the block/site editor.

---

## 15. Explicitly out of scope (v1)

- Overlays, widgets, or any script injected into customer sites. **Never.**
- Automatic code changes to customer sites.
- Scanning pages behind login (future: authenticated scans with secure credential storage).
- Mobile app (native) accessibility testing; PDF document accessibility testing.
- Manual audits performed by us (later via partner auditors, sold separately).
- Languages other than English in the product UI (strings must still be externalised for future translation).
- SSO/SAML, SCIM.

## 16. Open questions to resolve before the relevant phase

| # | Question | Needed by |
| --- | --- | --- |
| 1 | Final product name and domain | P0-05 |
| 2 | Is Oracle ARM capacity available in a nearby region, or start on Hetzner? | P0-05 |
| 3 | Who reviews fix guides for accuracy (accessibility specialist partner)? | P3-05 |
| 4 | Gemini free-tier terms acceptable for customer HTML snippets, or use a paid tier with no-training guarantee? | P3-07 |
| 5 | Shopify App Store billing rules at the time of building | P7-02 |
| 6 | Legal review of terms, privacy policy and DPA | P6-13 |

---
*End of developer specification.*