# Backend (API)

Express 5 + TypeScript + PostgreSQL (Supabase), using Drizzle ORM. Runs on **http://localhost:4000**.

## Setup

1. `cd backend && npm install`
2. `cp .env.example .env`
3. In `.env`, set `DATABASE_URL` to your Supabase **Session pooler** connection string
   (Supabase → **Connect** → Connection string → Session pooler, port 5432) and put in your
   database password. URL-encode special characters in the password (`@` → `%40`, `#` → `%23`).
4. `npm run db:migrate`: creates the tables
5. `npm run db:seed`: adds a demo user (`owner@example.com`) and organisation (`demo-agency`)
6. `npm run dev`: starts the API on port 4000 and reloads on change

## Scripts

| Command                                 | What it does                                                             |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                           | API with live reload                                                     |
| `npm run build` / `npm start`           | Compile to `dist/` / run the compiled build                              |
| `npm run typecheck` · `lint` · `format` | TypeScript, ESLint, Prettier                                             |
| `npm test`                              | Unit tests (no database needed)                                          |
| `npm run db:generate`                   | Create a migration after editing `src/db/schema/`                        |
| `npm run db:migrate`                    | Apply pending migrations                                                 |
| `npm run db:seed`                       | Insert demo data (safe to repeat)                                        |
| `npm run db:reset -- --yes`             | **Deletes all app data**, then migrates and seeds. Refuses in production |
| `npm run db:studio`                     | Browse the database in Drizzle Studio                                    |

### Integration tests

These drop and recreate every table, so **never** point them at your Supabase database. Use a
throwaway Postgres instead:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/app_test npm test
```

CI runs them against a Postgres service container (`.github/workflows/backend-ci.yml`).

## Endpoints so far

| Method | Path                  | Purpose                                                                               |
| ------ | --------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/health`             | API is up                                                                             |
| GET    | `/health/deep`        | Database, disk and queue checks (503 if the database is down)                         |
| POST   | `/v1/public/waitlist` | `{ email, consent, source?, turnstileToken? }` → `201 { data: { status: "joined" } }` |

Errors always use this shape: `{ "error": { "code", "message", "details" } }` (codes are in `src/shared/errors.ts`).

## Scanner (Phase 1)

`src/scanner/` is the scan engine. It is pure: it never imports the database or the API, and
it makes HTTP requests only through `net/guarded-fetch.ts`, which blocks private and internal
addresses (SSRF protection). ESLint enforces both rules.

Part 1a (finding pages) is built. Try it on any site:

```bash
npm run scan:discover -- allbirds.com --limit 20
npm run scan:discover -- https://example.com --limit 10 --exclude "/blog/**" --pin https://example.com/contact --out plan.json
```

It reads robots.txt and sitemaps (crawling the site if they list fewer than 20 URLs), detects the
platform, groups URLs into templates and prints the pages a scan would test. Requests are polite:
at most 1 per second per host (slower if robots.txt asks), so large sites take a minute or two.
At most 50 sitemap files are read per discovery.

Network tests against 20 real reference sites (`tests/fixtures/platforms.json`) are opt-in:

```bash
SCANNER_NETWORK_TESTS=1 npx vitest run tests/unit/scanner/platform.test.ts
```

## Layout

```
src/
  app.ts            Express app factory (dependencies injected, so it can be tested)
  server.ts         Entry point: listens on PORT, shuts down cleanly
  config/env.ts     Validated environment variables
  db/schema/        Drizzle tables
  db/repositories/  Data access. Tenant functions require an OrgId (type-checked)
  db/scripts/       migrate / seed / reset
  middleware/       Request logging and IDs, error handling
  routes/           HTTP routes
  shared/errors.ts  Error codes shared with the front end
  scanner/          Scan engine: url/, net/ (SSRF guard), discovery/, platform/, templates/, sampling/, cli/
drizzle/            SQL migrations (generated + hand-written triggers/RLS)
tests/              unit/ and integration/
```

## Supabase notes

- **Row-level security is on for every table, with no policies.** That blocks Supabase's
  auto-generated Data API (anon/authenticated keys) from reading these tables. The API connects
  as the table owner, so it is not affected. Keep RLS on for each new table.
- **`audit_log` is append-only**, enforced by a trigger, because the `postgres` role ignores
  revoked grants.
- **Use the Session pooler (5432), not the Transaction pooler (6543).** The job queue (pg-boss,
  Phase 2) needs session features such as LISTEN/NOTIFY.
