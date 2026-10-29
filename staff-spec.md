# Staff Admin 2.0 — Specification (Phase 8)

**Product:** EveryVisitor · **Version:** 1.0 · **Date:** 29 October 2026 · **Owner:** Godfrey Evans Ochieng Nyangada
**Builds on:** `DEVELOPER_SPEC.md` (Phase 6 staff area: S-70 – S-75) and `DESIGN_SPEC.md` (tokens, components).

---

## Contents

- [0. Goal and scope](#0-goal-and-scope)
- [1. Staff roles and permissions](#1-staff-roles-and-permissions)
- [2. Navigation and screens](#2-navigation-and-screens)
- [3. Content management (CMS)](#3-content-management-cms)
- [4. Analytics dashboards](#4-analytics-dashboards)
- [5. Customer management additions](#5-customer-management-additions)
- [6. Data model additions](#6-data-model-additions)
- [7. API additions](#7-api-additions)
- [8. Background jobs](#8-background-jobs)
- [9. Phased build plan](#9-phased-build-plan)
- [10. Out of scope](#10-out-of-scope)

---

## 0. Goal and scope

The Phase 6 staff area lets you see customers, queues, leads and flags. It cannot change website content or show how the business and website are performing. Phase 8 adds three things:

1. **Content management:** write and publish blog posts, fix guides, changelog entries, homepage text, FAQs, legal pages and site-wide banners from the staff area, with no code change or manual deploy.
2. **Analytics:** dashboards with graphs for revenue, signups and conversion, website traffic, product usage and retention.
3. **Customer management:** notes, tags, a health score and simple emails to customers.

**Principle:** keep it lean. This is an internal tool for one to three people, not a WordPress replacement. Every feature must save you time each week or answer a question you currently can't answer.

**Definition of Done** for every chunk: as in `DEVELOPER_SPEC.md` section 0.2 (tests, axe-clean, keyboard-tested, audit-logged, staff TOTP enforced).

---

## 1. Staff roles and permissions

Today, staff is one flag (`users.is_staff`). Replace it with roles so you can later give a writer or support helper limited access.

| Permission | Owner | Admin | Editor | Support | Analyst |
| --- | --- | --- | --- | --- | --- |
| View dashboards and analytics | ✓ | ✓ | — | — | ✓ |
| View revenue figures (MRR, invoices) | ✓ | ✓ | — | — | ✓ |
| Write and edit content (drafts) | ✓ | ✓ | ✓ | — | — |
| Publish or unpublish content | ✓ | ✓ | ✓ | — | — |
| Edit legal pages | ✓ | — | — | — | — |
| View customers, add notes and tags | ✓ | ✓ | — | ✓ | — |
| Email customers from admin | ✓ | ✓ | — | ✓ | — |
| Impersonate (read-only) | ✓ | ✓ | — | ✓ | — |
| Extend trials, plan overrides | ✓ | ✓ | — | — | — |
| Feature flags, site settings | ✓ | ✓ | — | — | — |
| Manage staff members and roles | ✓ | — | — | — | — |

Rules:
- Every staff session requires TOTP (unchanged).
- Every staff action is written to `audit_log` with `actor_type = 'staff'`.
- Exactly one staff `owner` must always exist.

---

## 2. Navigation and screens

New staff sidebar (existing screens kept):

```
Dashboard              S-90  (new home: key numbers + charts)
Analytics
  Business             S-91
  Website traffic      S-92
  Product usage        S-93
  Funnel & retention   S-94
Customers              S-70 / S-71 (enhanced, section 5)
Leads                  S-73
Content
  Blog posts           S-95 list · S-96 editor
  Fix guides           S-95 list · S-96 editor (same editor, guide template)
  Changelog            S-97
  Site pages           S-98 (homepage, FAQ, pricing copy, legal)
  Media library        S-99
  Banners              S-100
System
  Queues               S-72
  Content review       S-74
  Feature flags        S-75
  Site settings        S-101
  Staff & roles        S-102
  Audit log            S-51 (all orgs, staff filter)
```

Design: reuse `packages/ui` components and DESIGN_SPEC tokens. Charts follow DESIGN_SPEC section 12 (title states the finding, text summary, "View as table" toggle).

---

## 3. Content management (CMS)

### 3.1 How publishing works

The marketing site (`apps/site`) is a static export on Cloudflare Pages. Content moves from files in the repo to the database; the site reads it at build time.

1. Staff edit content in the admin. It is saved to Postgres as a **draft**.
2. **Publish** marks it `published` and enqueues `site.rebuild`.
3. `site.rebuild` calls the **Cloudflare Pages deploy hook** (a secret URL, `CF_PAGES_DEPLOY_HOOK_URL`). Calls are debounced: at most one rebuild every 2 minutes; publishes within that window are batched.
4. During the build, `apps/site` fetches published content from `GET /v1/public/content/*` and generates the pages, sitemap, RSS feed and Open Graph images as today.
5. The admin shows deploy status: queued → building → live (poll Cloudflare's deployments API with `CF_API_TOKEN`), with the time it went live.

**Scheduled publishing:** a post with `publish_at` in the future stays `scheduled`; the `content.publish-scheduled` cron (every 5 minutes) publishes it and triggers a rebuild.

**Preview:** each draft has a private preview link (`/preview/<token>`) served by `apps/web` (server-rendered with the same components as the site), valid 7 days, `noindex`.

**If the site is not a static export** (server-rendered Next.js), skip the deploy hook and use on-demand revalidation (`revalidatePath`) instead; everything else stays the same.

**Migration:** a one-off script imports existing blog MDX files and `packages/fix-guides/*.md` into the new tables, preserving slugs and dates, so no URL changes.

### 3.2 Blog posts (S-95, S-96)

**List (S-95):** title, status (Draft, Scheduled, Published, Archived), author, tags, publish date, last edited, views (last 30 days, from analytics). Search, filter by status and tag, sort. Actions: edit, duplicate, preview, unpublish, archive.

**Editor (S-96):**
- **Title** (required, ≤ 90 characters, counter shown).
- **Slug** (auto from title, editable; uniqueness checked live; changing a published slug creates a **301 redirect** from the old URL automatically).
- **Body:** Markdown editor with toolbar (headings, bold, italic, lists, link, quote, code, table, image), side-by-side live preview using the real site styles, autosave every 10 seconds, word count and reading time.
- **Excerpt** (≤ 200 characters; used on the blog list and as the default meta description).
- **Cover image** from the media library, **alt text required** (or "decorative" explicitly ticked).
- **Author:** chosen from real staff users only, with their name, role and photo from their staff profile. **No free-text author field.** (Prevents invented authors.)
- **Tags** (pick or create).
- **SEO panel:** SEO title (≤ 60 chars), meta description (≤ 160 chars), Open Graph image (auto-generated from title if empty), canonical URL (optional), `noindex` toggle, and a Google-style search result preview.
- **Publish panel:** status, publish date/time (org time zone shown), "Publish now", "Schedule", "Unpublish".
- **Revisions:** every save of a published post creates a revision; view a diff and restore any revision.
- **Content checks** shown as warnings before publishing (all must be acknowledged, none block):
  - Banned words: *compliant, compliance guaranteed, ADA-proof, lawsuit-proof, certified, 100% accessible* (configurable list in site settings).
  - Images without alt text; headings that skip levels (e.g. H2 → H4); links with text "click here"; empty links.
  - Statistics without a link nearby (a number followed by % or a large figure with no link in the same paragraph): "Add a source?"
  - Title or date mentions a past event as future (e.g. "Before June 2025" on a post dated later).

### 3.3 Fix guides

Same list and editor as blog posts, with a **guide template** instead of a free body:
- Fields: rule (select from `rules` table), platform (Shopify / WordPress / Generic), title, summary, and required sections: *What's wrong · Who it affects · How to fix on <platform> · Code example · How to check your fix*.
- `reviewed_at` and `reviewed_by` (staff user) set when an Admin marks it reviewed; unreviewed guides show "Not yet reviewed" in the admin.
- Publishing a guide also updates the in-app fix-guide panel (same table), with no deploy needed for the app.
- Coverage view: a table of the top 50 most frequent rules (from scan data) × platform, showing which have a published guide. Missing ones highlighted, so you know what to write next.

### 3.4 Changelog (S-97)

Entries with date, title, type (New, Improved, Fixed), short Markdown body, optional "Show in app" toggle (displays a "What's new" dot in the app for 14 days). Published entries appear on `/changelog` and in the monthly customer email digest.

### 3.5 Site pages (S-98)

Structured content, not free HTML, so the design cannot break.

| Page / section | Editable fields |
| --- | --- |
| Homepage hero | Headline, sub-headline, free-check button label, trust line |
| Homepage "business question" facts | Up to 3 items: statement, **source name and URL (required)** |
| Homepage "How it works" | 4 steps: title, one-line text, screenshot (media library, alt text required) |
| Homepage agency section | Headline, sub-text, 3 bullets, image + alt |
| Overlay comparison table | Rows: label, overlay value, EveryVisitor value |
| FAQ (home and pricing) | Question, answer (Markdown), order, which page(s) it appears on |
| Pricing page copy | Plan descriptions and "most popular" badge. **Prices and limits are read from `plans.ts` and Paddle, not edited here**, so the site can never show a price that differs from checkout |
| Footer | Tagline, link groups |
| Legal pages | Terms, Privacy, Refunds, DPA, Subprocessors, Bot page, Accessibility statement |

Each section is a JSON document validated by a Zod schema in `packages/shared/content-schemas.ts`. Draft → preview → publish, like posts.

**Legal pages (Owner only):**
- Version history with effective date; "Last updated" on the page set automatically.
- Publishing a new version of Terms, Privacy or Refunds offers: "Email all customers about this change" (sends a short notice with a summary field and the link; required by many privacy laws for material changes).
- Old versions remain viewable at `/legal/terms/v/<n>` for reference.

### 3.6 Media library (S-99)

- Upload PNG, JPG, WebP, SVG (sanitised), GIF, MP4 (≤ 50 MB), PDF; drag and drop or button.
- Stored in R2; images automatically resized to 640 / 1280 / 1920 px widths and converted to WebP and AVIF at upload.
- **Alt text required** for images, or marked decorative. Title, caption, credit fields.
- Grid and list views; search; filter by type; "Used in" list showing where each file appears; deletion blocked while in use.
- Copy URL / insert into editor.

### 3.7 Banners (S-100)

Announcement banners for the marketing site, the app, or both: message (≤ 140 characters), link, style (info, success, warning), audience (everyone / logged-in / trial / specific plans), start and end time, dismissible toggle. Rendered with the S-82 banner component (correct priority order, accessible as a `region` with a label). One active banner per surface.

---

## 4. Analytics dashboards

### 4.1 Data sources

| Source | What it provides | How |
| --- | --- | --- |
| **App database** | Signups, orgs, trials, activation, scans, issues, free checks, leads | Direct queries + nightly snapshot |
| **Paddle mirror** (`subscriptions`, `invoices`, `paddle_events`) | MRR, plan mix, new/expansion/contraction/churned revenue, refunds | Already mirrored by webhooks (Phase 4) |
| **Umami** (self-hosted) | Visitors, page views, top pages, referrers, countries, devices, UTM campaigns | Umami REST API (`UMAMI_API_URL`, `UMAMI_API_TOKEN`), cached hourly |
| **Resend** (optional) | Emails sent, delivered, bounced, opened | Resend API, cached daily |

**Performance:** dashboards read from a `metrics_daily` table computed nightly at 01:00 UTC (and recomputed for "today" every hour), never from heavy live queries. Umami responses are cached in `analytics_cache` for 1 hour.

**Common controls on every dashboard:** date range (7 days, 30 days, 90 days, 12 months, custom), "Compare with previous period" toggle, granularity (day / week / month), CSV export of every chart's data, last-updated time.

### 4.2 Definitions (single source of truth: `packages/shared/metrics.ts`)

| Metric | Definition |
| --- | --- |
| **MRR** | Sum of active subscriptions' monthly price (annual ÷ 12), in USD, excluding tax and Paddle fees |
| **Active subscription** | Paddle status `active` or `past_due` |
| **New MRR / Expansion / Contraction / Churned MRR** | Monthly change in MRR from new subscribers / upgrades / downgrades / cancellations |
| **Net MRR change** | New + Expansion − Contraction − Churned |
| **ARPA** | MRR ÷ number of paying organisations |
| **Trial started** | Organisation created (trial begins) |
| **Activated** | Within 7 days of signup: ≥ 1 site verified **and** ≥ 1 full scan completed **and** ≥ 1 issue marked fixed or rechecked |
| **Trial → paid conversion** | Orgs whose first paid subscription started within 30 days of signup ÷ orgs that started a trial in the period |
| **Logo churn (monthly)** | Paying orgs that cancelled in the month ÷ paying orgs at the start of the month |
| **Weekly active org** | Org with ≥ 1 member signed in or ≥ 1 report generated in the last 7 days |
| **Scan failure rate** | Scans `failed` or `partial` ÷ all scans |

### 4.3 Dashboard home (S-90)

The first screen after staff sign-in. Answers "how is the business doing today?" in 10 seconds.

- **Stat cards (with change vs previous period):** MRR · Paying customers · Trials active · Trial → paid conversion (30 days) · Monthly churn · Visitors (30 days) · Free checks (30 days) · Scan failure rate (7 days).
- **Charts:** MRR over the last 12 months (line); new signups per week (bars) with paid conversions marked; website visitors per day (line).
- **Needs attention list:** payments past due · trials ending in the next 3 days that are not activated · customers inactive for 14+ days · failed scans in the last 24 hours · webhooks auto-disabled · flagged AI suggestions · content scheduled today.
- **Recent activity feed:** new signups, new paying customers, cancellations (with reason), refunds.

### 4.4 Business (S-91)

- MRR over time (line) with an MRR movement chart below: new, expansion, contraction, churned per month (bars above and below zero).
- Paying customers over time (line), split by plan (stacked area or small multiples).
- Plan mix today (horizontal bars: count and MRR per plan).
- Monthly vs annual split.
- Revenue collected per month (from invoices), refunds per month.
- Cancellation reasons (bars, from the cancel survey).
- Top 10 customers by MRR (table).

### 4.5 Website traffic (S-92, from Umami)

- Visitors and page views per day (line, with comparison period dashed).
- Top pages (table: page, visitors, average time, bounce rate if Umami provides it).
- **Top fix guides and blog posts** (table, with sign-ups attributed where a visitor later signed up in the same session/UTM).
- Referrers (table: LinkedIn, Google, Reddit, direct …) and UTM campaigns (table).
- Countries (table, top 15) and devices (desktop / mobile / tablet bars).
- Free-checker usage: checks per day, share that submitted an email, share that started a trial.

**UTM convention** (so LinkedIn and other posts are measurable): `utm_source=linkedin|reddit|facebook|tiktok|email`, `utm_medium=social|community|outreach`, `utm_campaign=<post-or-campaign-slug>`. The admin includes a small **link builder** that creates tagged links to paste into posts.

### 4.6 Product usage (S-93)

- Scans per day and pages scanned per day (bars).
- Scan failure rate and average scan duration (line).
- Issues found vs fixed per week across all customers (two lines) — the clearest sign customers get value.
- Weekly active organisations (line).
- Feature adoption: % of paying orgs using reports, scheduled client reports, client portal, Slack, API, manual checks, statements (horizontal bars).
- AI suggestions generated and flagged per week.

### 4.7 Funnel and retention (S-94)

- **Funnel for the selected period:** website visitors → free checks → sign-ups → activated → paid. Bars sized by count, with the conversion % between steps (DESIGN_SPEC funnel rules).
- **Funnel by source:** the same funnel broken down by first-touch `utm_source` (table).
- **Retention cohorts:** rows = month of first payment; columns = months 1–12; cells = % still paying (heat-map table with numbers in every cell and a text summary).
- **Time to activate:** distribution of days from sign-up to activation (bars).

### 4.8 Accessibility of the charts

All charts: title that states the finding, text summary above, "View as table" toggle, keyboard-focusable data points with tooltips, never colour alone (patterns or direct labels), passes axe. The analytics pages are internal, but we keep our own standard.

---

## 5. Customer management additions

On S-70 (list) and S-71 (detail):

- **Health score** (0–100, shown as Good / At risk / Poor with the reasons): based on last sign-in, scans in the last 14 days, open critical issues trend, reports generated, payment status. Recomputed nightly. Filter and sort the customer list by it.
- **Tags** (e.g. "design partner", "agency", "founding price", "needs onboarding") and **notes** (timestamped, author shown, Markdown) on each organisation.
- **Timeline** on the organisation page: sign-up, trial events, payments, plan changes, support emails sent, notes — one chronological view.
- **Email a customer** from the admin: choose a template (welcome check-in, trial help, inactive check-in, payment issue, custom), edit, send via Resend from `support@`, logged on the timeline. Respect unsubscribe for non-essential email.
- **Segments:** saved filters (e.g. "trial, not activated, day 5+") with an export of contacts who agreed to emails.
- **Trial tools:** extend trial (exists), "send activation help" one-click email.

---

## 6. Data model additions

All new tables have `id uuid`, `created_at`, `updated_at`. Content tables are not tenant-scoped.

**`staff_members`** — `user_id unique`, `role` (`owner|admin|editor|support|analyst`), `display_name`, `job_title`, `bio`, `avatar_key`, `active boolean`. Replaces `users.is_staff` (keep the column for one release, then drop).

**`content_posts`** — `type` (`blog|guide`), `slug unique per type`, `title`, `excerpt`, `body_md`, `cover_media_id`, `cover_alt`, `author_staff_id` (FK, required), `tags text[]`, `seo_title`, `seo_description`, `og_media_id`, `canonical_url`, `noindex boolean`, `status` (`draft|scheduled|published|archived`), `publish_at`, `published_at`, `updated_by`, guide-only: `rule_id`, `platform`, `sections jsonb`, `reviewed_at`, `reviewed_by`.

**`content_revisions`** — `post_id` or `page_key`, `version int`, `data jsonb`, `created_by`, `note text`.

**`content_pages`** — `page_key` (e.g. `home.hero`, `home.faq`, `legal.terms`), `data jsonb` (validated by Zod schema per key), `status`, `published_version`, `effective_date` (legal), `published_at`, `published_by`.

**`redirects`** — `from_path unique`, `to_path`, `status_code` (301), `created_by`. Served by the site build (Cloudflare Pages `_redirects` file generated at build).

**`changelog_entries`** — `date`, `title`, `type`, `body_md`, `show_in_app boolean`, `status`, `published_at`.

**`media_assets`** — `key`, `filename`, `mime`, `size`, `width`, `height`, `variants jsonb`, `alt_text`, `is_decorative boolean`, `caption`, `credit`, `uploaded_by`.

**`banners`** — `surface` (`site|app|both`), `message`, `link_url`, `style`, `audience jsonb`, `starts_at`, `ends_at`, `dismissible`, `active`.

**`site_settings`** (single row) — `support_email`, `banned_words text[]`, `maintenance_mode`, `deploy_hook_configured boolean` (the hook URL itself stays in env).

**`site_deploys`** — `trigger` (`publish|manual|schedule`), `requested_by`, `cf_deployment_id`, `status` (`queued|building|live|failed`), `started_at`, `finished_at`, `error`.

**`metrics_daily`** — `date`, `metric` (text key from `metrics.ts`), `dimension` (e.g. plan or source, nullable), `value numeric`. Unique `(date, metric, dimension)`.

**`analytics_cache`** — `cache_key unique`, `payload jsonb`, `fetched_at`, `expires_at`.

**`org_notes`** — `org_id`, `author_staff_id`, `body_md`. **`org_tags`** — `org_id`, `tag`, unique pair. **`org_health`** — `org_id unique`, `score`, `band`, `reasons jsonb`, `computed_at`.

**`staff_emails`** — `org_id`, `to_email`, `template`, `subject`, `body_md`, `sent_by`, `resend_id`, `status`.

**`cancellation_reasons`** — `org_id`, `reason` (enum), `comment`, `created_at` (if not already stored in Phase 4).

---

## 7. API additions

All under `/v1/staff/*`, requiring a staff session with TOTP and the permission in section 1. Errors and pagination as in `DEVELOPER_SPEC.md` section 4.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/staff/dashboard` | view analytics | Stat cards, needs-attention list, recent activity |
| GET | `/staff/metrics?metric=&from=&to=&granularity=&dimension=&compare=` | view analytics (revenue metrics need revenue permission) | Time series from `metrics_daily` |
| GET | `/staff/analytics/traffic?report=&from=&to=` | view analytics | Umami-backed reports (cached) |
| GET | `/staff/analytics/funnel?from=&to=&by=source` | view analytics | Funnel counts and rates |
| GET | `/staff/analytics/cohorts?from=` | view revenue | Retention cohort matrix |
| GET | `/staff/metrics/export.csv?…` | as above | CSV of any series |
| GET / POST | `/staff/content/posts` | content | List / create post or guide |
| GET / PATCH / DELETE | `/staff/content/posts/:id` | content | Read / update draft / archive |
| POST | `/staff/content/posts/:id/publish` · `/unpublish` · `/schedule` | publish | Status changes (trigger rebuild) |
| GET | `/staff/content/posts/:id/revisions` · POST `/restore/:version` | content | Revisions |
| POST | `/staff/content/posts/:id/preview-link` | content | Create preview token |
| POST | `/staff/content/check` | content | Run content checks on a draft body |
| GET / PUT | `/staff/content/pages/:pageKey` | content (legal: owner) | Read / save draft section |
| POST | `/staff/content/pages/:pageKey/publish` | publish (legal: owner) | Publish (+ optional customer notice for legal) |
| GET / POST / PATCH | `/staff/content/changelog[/:id]` | content | Changelog |
| GET / POST / PATCH / DELETE | `/staff/media[/:id]` | content | Media library (multipart upload) |
| GET / POST / PATCH / DELETE | `/staff/banners[/:id]` | settings | Banners |
| GET / POST | `/staff/site/deploys` | publish | Deploy history / manual rebuild |
| GET / PATCH | `/staff/site/settings` | settings | Site settings |
| GET / POST / PATCH / DELETE | `/staff/members[/:id]` | owner | Staff and roles |
| GET / POST | `/staff/orgs/:orgId/notes` · `/tags` | support | Notes and tags |
| POST | `/staff/orgs/:orgId/email` | support | Send a templated email |
| GET / POST | `/staff/segments` | support | Saved filters and exports |
| GET | `/staff/tools/utm?url=&source=&medium=&campaign=` | any staff | Build a tagged link |

**Public (used by the site build and the app):**

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/public/content/posts?type=blog\|guide&page=` | Published posts (list) |
| GET | `/public/content/posts/:type/:slug` | One published post |
| GET | `/public/content/pages/:pageKey` | Published page section |
| GET | `/public/content/changelog` | Published entries |
| GET | `/public/content/redirects` | Redirect list for the build |
| GET | `/public/banners?surface=site\|app` | Active banner |

Public endpoints are cached at Cloudflare for 5 minutes and return only published content.

---

## 8. Background jobs

| Queue / cron | Schedule | What it does |
| --- | --- | --- |
| `site.rebuild` | On publish (debounced 2 min) | Calls the Cloudflare Pages deploy hook, records `site_deploys` |
| `site.deploy-status` | Every 30 s while a deploy is building | Polls Cloudflare, updates status, notifies staff in-app on failure |
| `content.publish-scheduled` | Every 5 min | Publishes due scheduled posts and pages |
| `metrics.compute-daily` | 01:00 UTC daily | Computes yesterday's `metrics_daily` rows (all metrics, all dimensions); backfill mode for history |
| `metrics.compute-today` | Hourly | Recomputes today's rows |
| `analytics.umami-sync` | Hourly | Refreshes cached Umami reports for the default ranges |
| `orgs.health` | 02:30 UTC daily | Computes health scores |
| `legal.notice` | On legal publish with notice | Emails customers about a terms or privacy change (batched, rate-limited) |

---

## 9. Phased build plan

Order chosen so the most useful pieces arrive first: numbers you can act on, then blog editing, then the rest.

### Phase 8A — Foundations and dashboard (about 1.5 weeks)

**P8-01 — Staff roles** · M
`staff_members`, permission middleware, migration from `is_staff`, S-102 staff list and invite (owner only).
- [ ] Every staff endpoint checks a permission from section 1 (test per role).
- [ ] Removing the last owner is blocked.

**P8-02 — Metrics definitions and daily snapshot** · L
`packages/shared/metrics.ts`, `metrics_daily`, `metrics.compute-daily` and `-today`, backfill script for all history.
- [ ] Unit tests for every definition in 4.2 with fixture data (including upgrades, downgrades, refunds, annual plans).
- [ ] Backfill of 12 months completes in under 5 minutes.
- [ ] MRR in the dashboard matches a manual sum of active Paddle subscriptions (test).

**P8-03 — Chart components** · M
In `packages/ui`: `LineChart`, `BarChart` (including positive/negative), `StackedBars`, `Funnel`, `CohortTable`, `StatCard` (value, change, sparkline), `DateRangeControl`, each with text summary and "View as table".
- [ ] All pass axe and keyboard checks; colours from tokens only.

**P8-04 — Dashboard home (S-90)** · M
Stat cards, three charts, needs-attention list, activity feed.
- [ ] Loads in under 1.5 s with 12 months of data.

### Phase 8B — Blog and content (about 2–3 weeks)

**P8-05 — Content data model and public API** · M
Tables in section 6 (content, revisions, redirects, media), public endpoints, Zod schemas per page key.

**P8-06 — Site reads content from the API** · M
`apps/site` fetches published content at build time; generated `_redirects`; RSS and sitemap from DB content; import script for existing MDX and fix guides.
- [ ] Every existing URL still works after migration (automated link check against the old sitemap).

**P8-07 — Publishing pipeline** · M
`site.rebuild` with debounce, deploy status polling, S-95 deploy status indicator, manual "Rebuild site" button.
- [ ] Publish → live on the site within 5 minutes, status shown accurately.

**P8-08 — Media library (S-99)** · M
Uploads, resizing, WebP/AVIF variants, required alt text, "Used in", deletion protection.

**P8-09 — Post list and editor (S-95, S-96)** · L
Everything in 3.2: Markdown editor with live preview, autosave, SEO panel, author from staff only, scheduling, revisions with diff and restore, preview links, slug redirects.
- [ ] A post can be drafted, previewed, scheduled and published without touching code.
- [ ] Changing a published slug creates a working 301 redirect.

**P8-10 — Content checks** · S
`/staff/content/check` and inline warnings (banned words, alt text, heading order, link text, unsourced statistics, past-dated titles).

**P8-11 — Fix guides in the editor** · M
Guide template, review status, coverage table (top 50 rules × platform).

**P8-12 — Changelog (S-97) and banners (S-100)** · S

### Phase 8C — Analytics dashboards (about 1.5–2 weeks)

**P8-13 — Business dashboard (S-91)** · M
**P8-14 — Umami integration and traffic dashboard (S-92)** · M — includes the UTM link builder.
**P8-15 — Product usage dashboard (S-93)** · S
**P8-16 — Funnel and retention (S-94)** · M — first-touch source stored on sign-up (`orgs.first_utm jsonb`). No cookies: when a visitor lands with UTM parameters, the site saves them in `sessionStorage`, and the sign-up form sends them as hidden fields.
- [ ] Every chart exports CSV; every chart has a table view.

### Phase 8D — Site pages, legal and customers (about 1.5 weeks)

**P8-17 — Site pages editor (S-98)** · L — homepage sections, FAQ, pricing copy (prices read-only from `plans.ts`), footer.
**P8-18 — Legal pages with versions and customer notice** · M — owner only.
**P8-19 — Customer health, tags, notes, timeline** · M
**P8-20 — Email customers and segments** · M
**P8-21 — Site settings (S-101)** · S — support email, banned words list, maintenance mode toggle.

**Phase 8 gate:** full e2e test (write a blog post with an image → schedule → it goes live → appears in RSS and sitemap; change homepage headline → live; dashboards match a manual check of the database for one month), accessibility pass on every new screen, security review of upload handling and staff permissions.

---

## 10. Out of scope

- A visual drag-and-drop page builder (structured sections only, so the design and accessibility can't break).
- Multi-language content (fields are ready for it; translation later).
- Comments on blog posts.
- Third-party ad or tracking pixels (we stay cookie-less).
- Real-time (live, second-by-second) analytics; hourly is enough.
- A full help-desk system (use the support inbox; revisit after 50 customers).

---

*End of Phase 8 specification.*