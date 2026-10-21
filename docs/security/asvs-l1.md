# Security review: OWASP ASVS 4.0.3 Level 1 (P6-10)

**Scope:** backend API (`backend/`), worker, web app (`web/`), as of Phase 6.
**Method:** code review against ASVS L1, automated tests added in this phase, dependency and
secret scanning in CI. Acceptance: every finding fixed, or recorded below with an accepted-risk note.

Legend: **Pass** = verified (test or code reference) · **Fixed** = gap found and fixed in Phase 6 ·
**Open** = needs work before launch · **Accepted** = known gap with a recorded reason · **N/A**.

## Automated checks

| Check | Where | Status |
| --- | --- | --- |
| Authorization matrix: every org-scoped endpoint × anonymous / other org / client viewer / member / admin / owner / impersonating staff | `backend/tests/unit/authorization-matrix.test.ts`, result in `tests/unit/__snapshots__/authorization-matrix.md` | Pass (122 endpoints) |
| Every staff endpoint hidden from non-staff (404) and anonymous (401) | same file | Pass |
| Cross-org 404 (never 403) | matrix + `tests/helpers/cross-org.ts` users | Pass |
| SSRF guard suite rerun | `tests/unit/scanner/guard.test.ts`, `webhooks.test.ts` | Pass |
| Dependency audit (high/critical fails) | `.github/workflows/security.yml` (`npm audit --omit=dev --audit-level=high`) | **Open: not run locally (no network in the review sandbox). First CI run decides.** |
| Secret scanning (history + PRs) | `.github/workflows/security.yml` (gitleaks, `.gitleaks.toml` adds the `psk_` key format) | Pass locally by pattern search over tree and history; CI run pending |
| Dependabot | `.github/dependabot.yml` | Pass |

## ASVS L1 checklist

### V1 Architecture (L1 items are mostly documentation)
| Item | Status | Notes |
| --- | --- | --- |
| Tenant isolation design | Pass | `OrgId` branded type; repositories require it (`org-scope.ts`) |

### V2 Authentication
| Item | Status | Notes |
| --- | --- | --- |
| 2.1.1 Passwords ≥ 12 chars | **Accepted (R-3)** | Spec 7.1 sets 10; checked against a common-password list (`lib/passwords.ts`). ASVS asks 12. Decision for product owner |
| 2.1.7 Breached / common password check | Pass | Common-password list |
| 2.2.1 Anti-automation on sign-in | Pass | 5 attempts / 15 min per email+IP (`routes/auth.ts`) |
| 2.2.3 Notify on auth detail changes | Fixed / **Open (F-4)** | E-23 now sent after a password change (`routes/me.ts`, `hardening.test.ts`). The "new sign-in" variant is not sent yet: it needs new-device detection |
| 2.5 Recovery | Pass | Reset tokens 1 h, single use (Better Auth) |
| 2.7/2.8 Second factor for privileged users | Fixed | Staff TOTP, required per session, 12 h window, 5 tries / 15 min (`routes/staff.ts`, `lib/totp.ts`, RFC 6238 vectors in `totp.test.ts`) |

### V3 Session management
| Item | Status | Notes |
| --- | --- | --- |
| 3.2 New token on sign-in, random | Pass | Better Auth |
| 3.3 Logout invalidates; revoke sessions | Pass | `/v1/auth/sign-out`, `/v1/me/sessions/:id` |
| 3.4.1–3.4.3 Cookie `Secure`, `HttpOnly`, `SameSite` | Fixed | `lib/auth.ts`: `useSecureCookies` on https, `httpOnly`, `sameSite: lax`; `COOKIE_DOMAIN` for `.domain` sharing |
| 3.5 CSRF for cookie-authenticated writes | Fixed | `middleware/csrf.ts` Origin check (tests in `hardening.test.ts`) + SameSite=Lax |

### V4 Access control
| Item | Status | Notes |
| --- | --- | --- |
| 4.1.1 Enforced server-side | Pass | `requireOrgRole`, matrix test |
| 4.1.3 Least privilege | Pass | Client viewers read-only and site-filtered; API keys allow-listed operations + scopes |
| 4.2.1 IDOR protection | Pass | All tenant queries take `OrgId`; other-org ids return 404 |
| Staff bypass | **Fixed (F-1)** | Before Phase 6, `resolveOrgContext` gave owner access to any org when `user.isStaff` was set. Now only a TOTP-verified staff session that is impersonating that org, read-only (`IMPERSONATION_READ_ONLY` on writes), audited |
| 4.3.1 Admin interfaces need MFA | Fixed | `/staff/*` requires TOTP |

### V5 Validation, sanitisation, encoding
| Item | Status | Notes |
| --- | --- | --- |
| 5.1 Input validation | Pass | Zod on every new endpoint; errors → 400 |
| 5.2.1 Sanitise HTML from users | Pass | Statements and email templates escape (`statements/render.ts`, `escapeHtml`) |
| 5.2.x SVG uploads | **Fixed (F-2)** | Logo upload trusted the declared type and accepted any SVG, 2 MB. Now: type sniffed from bytes, SVG with script/handlers/foreignObject/external refs refused, 1 MB and ≤ 1000 px (`lib/image-check.ts`, tests) |
| 5.3 Output encoding | Pass | React escapes; CSV export now neutralises formulas (`lib/csv.ts`, used by audit log, leads and issues exports) — **Fixed (F-3)** for issues CSV |
| 5.3.x SSRF | Pass | Scanner guard + webhook delivery guard; custom-domain checks only resolve DNS |

### V7 Errors and logging
| Item | Status | Notes |
| --- | --- | --- |
| 7.1 No secrets in logs | Pass | pino redacts `authorization`, `cookie`, `set-cookie` |
| 7.2 Security events logged | Pass | `audit_log` (append-only trigger): staff sign-in/TOTP failures, impersonation, key create/revoke, exports, deletions |
| 7.4 Generic error messages | Pass | 500 → "Something went wrong on our side"; Next error pages show a digest only |

### V8 Data protection
| Item | Status | Notes |
| --- | --- | --- |
| 8.2.1 No caching of sensitive responses | Pass | `Cache-Control: no-store` on API key creation, exports, CSVs |
| 8.3 Personal data: export, deletion | Fixed | P6-09: `/v1/me/export` (zip + E-22), account deletion with anonymised tombstone, org purge after 30 days (integration test) |
| 8.3.x Secrets at rest | Pass | AES-256-GCM for webhook URLs/secrets, TOTP secrets; API keys as SHA-256 hashes only |

### V9 Communications
| Item | Status | Notes |
| --- | --- | --- |
| 9.1 TLS everywhere, HSTS | Pass | Caddy (`docs/infra/Caddyfile.example`); API and web send HSTS (preload) on https |

### V10 Malicious code
| Item | Status | Notes |
| --- | --- | --- |
| 10.3 Dependency integrity | Pass | Lockfiles, `npm ci`, Dependabot, audit in CI |

### V12 Files
| Item | Status | Notes |
| --- | --- | --- |
| 12.1 Size limits | Pass | JSON 100 kB, logos 1 MB, manual-check attachments (P5-02) |
| 12.4 Stored with random keys, outside web root | Pass | Object storage keys include ids/timestamps; served through API with authz |
| 12.5 Served with correct type, nosniff | Pass | Helmet `X-Content-Type-Options`; API CSP `default-src 'none'` stops script in served SVG |

### V13 API
| Item | Status | Notes |
| --- | --- | --- |
| 13.1 Rate limiting | Fixed | API keys 60/min, general 300/min per user (`middleware/auth.ts`), staff TOTP 5/15 min |
| 13.2 Auth on every API route | Pass | Matrix test |

### V14 Configuration
| Item | Status | Notes |
| --- | --- | --- |
| 14.4 Security headers (API) | Fixed | Helmet: CSP `default-src 'none'`, HSTS preload, Referrer-Policy, CORP same-site, Permissions-Policy (`hardening.test.ts`) |
| 14.4 Security headers (web) | Fixed | `web/next.config.ts`: CSP enforced (with `CSP_REPORT_ONLY=true` switch), XFO DENY, nosniff, Referrer-Policy, HSTS on https |
| Debug endpoints off in production | Fixed | Email preview router only mounted outside production |

## Findings

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| F-1 | High | Staff flag gave silent owner access to every org, no MFA, no audit | Fixed (P6-01) |
| F-2 | Medium | Logo upload: no content sniffing, SVG script possible, limits above spec | Fixed |
| F-3 | Low | Issues CSV export open to spreadsheet formula injection | Fixed |
| F-4 | Low | E-23 security notice emails were not implemented | Password change: fixed. **New sign-in: open**, needs device/IP history to avoid emailing on every sign-in |
| F-5 | Low | `db:reset` did not drop Phase 4–5 tables, so reset + migrate failed | Fixed (`scripts/reset.ts`) |
| F-6 | Info | Dependency audit not yet run | **Open: first CI run of `security.yml`** |

## Accepted risks

| ID | Risk | Why accepted | Revisit |
| --- | --- | --- | --- |
| R-1 | Web CSP allows `'unsafe-inline'` scripts | Most pages are statically rendered, so they cannot carry a per-request nonce (Next.js renders nonces only dynamically). All other directives are strict; React escapes output; no user HTML is rendered unsanitised. | When marketing moves to the static `apps/site` (spec 8.1), switch the app to nonce + `strict-dynamic` via `proxy.ts` |
| R-2 | Rate limits are per process (memory) | Single API instance (spec 13.4). Spec asks for Postgres-backed buckets | Before running a second API instance (`docs/runbooks/moving-to-a-second-server.md`) |
| R-3 | Minimum password length 10 (ASVS L1 asks 12) | Spec 7.1 decision; mitigated by common-password list and rate limits | Product owner decision before launch |
| R-4 | `/internal/tls-allowed` has no authentication | It only reveals whether a domain is verified; Caddy config returns 404 for `/internal/*` from the internet | — |

## Sign-off

| Role | Name | Date |
| --- | --- | --- |
| Engineering | | |
| Product owner (accepts R-1 – R-4) | | |
