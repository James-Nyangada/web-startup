# Design system recommendations

_Started 2026-10-15 10:08 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "# Design Specification (UX/UI) — Accessibility Monitoring SaaS??**Version:** 1.0"
The project currently has no files except possibly dotfiles — a `list_files` on the project root would return nothing else.
Current date is now October 15, 2026
</system-info>

<default aesthetic_system_instructions>
The user has not attached a design system. If they have ALSO not attached references or art direction, and the project is empty (the auto-managed _ds/ folder doesn't count), ask your opening questions with the ask_user tool. Whenever you ask opening questions in this project, include a design-system question in the form: the user's pick there sets the visual direction, so do NOT also ask about the visual aesthetic (no questions about vibe, colors or palette directions (including color-swatch svg-options questions), typography, mood, or art direction). Spend your other questions on everything else: audience, purpose, content, structure, scope, interactions, tone of copy. Exception: if the request already states the visual direction as a brand or concrete art direction, leave the design-system question out of your own questions (the app may still add one — it's skippable, and a skip doesn't change the stated direction) — but if they name a design system that isn't attached, keep the question: their pick there is what attaches it.

If the design-system question comes back unanswered — skipped without a pick (a "Not sure" / decide-for-me answer counts as a pick: it applies the effective default) — and no references or other art direction arrived either, THEN ask the visual-aesthetic questions before designing: a follow-up round (or one focused question) about vibe, colors, type, and mood is the right move once the design-system ask went unanswered. Do NOT just pick your own. Once you have a direction, use this guidance when creating designs:
- Choose a type pairing from web-safe set or Google Fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are user-authored files in the project already (the auto-managed _ds/ folder is not user-authored).
</default aesthetic_system_instructions>

<pasted_text name="Pasted text (668 lines)">
# Design Specification (UX/UI) — Accessibility Monitoring SaaS

**Version:** 1.0 · **Date:** 15 October 2026 · **Owner:** Godfrey Evans Ochieng Nyangada
**Companion document:** `DEVELOPER_SPEC.md` — screen IDs (`S-xx`), report IDs (`R-xx`), email IDs (`E-xx`) and phases match it exactly.

&gt; **Working name.** The product name is not final; this document says `PRODUCT_NAME`. The logo, wordmark and final brand colour are part of deliverable D1.

---

## Contents

- [0. How to use this document](#0-how-to-use-this-document)
- [1. Who we design for](#1-who-we-design-for)
- [2. UX principles](#2-ux-principles)
- [3. Brand, voice and words](#3-brand-voice-and-words)
- [4. Design tokens](#4-design-tokens)
- [5. Accessibility requirements for every design](#5-accessibility-requirements-for-every-design)
- [6. Component inventory](#6-component-inventory)
- [7. Information architecture](#7-information-architecture)
- [8. Key user flows](#8-key-user-flows)
- [9. Screen specifications](#9-screen-specifications)
- [10. Reports (PDF) — R-01 to R-06](#10-reports-pdf--r-01-to-r-06)
- [11. Emails — E-01 to E-23](#11-emails--e-01-to-e-23)
- [12. Data visualisation guidelines](#12-data-visualisation-guidelines)
- [13. Responsive and mobile patterns](#13-responsive-and-mobile-patterns)
- [14. Usability testing plan (no budget)](#14-usability-testing-plan-no-budget)
- [15. Phased design deliverables](#15-phased-design-deliverables)
- [16. Handoff standards](#16-handoff-standards)

---

## 0. How to use this document

- Work **one phase ahead of development.** Design phase D2 must be ready (reviewed and handed off) before developer Phase 2 starts, and so on (section 15).
- Each screen spec lists its **purpose, primary action, content, layout, states and responsive behaviour.** Design every listed state; missing states are the most common cause of rework.
- Tool: **Figma** (free starter plan) or **Penpot** (open source, free). Use variables/tokens, components with variants and auto-layout so the developer can map them 1:1 to code.
- The developer builds components in `packages/ui` from your tokens. Token names in section 4 are the contract; keep them.

### 0.1 Design Definition of Done (every screen)

- [ ] Desktop (1440), laptop (1280), tablet (768) and mobile (375) frames, or a note explaining responsive behaviour.
- [ ] States: default, loading (skeleton), empty, error, partial/limited (plan limit, read-only), success feedback.
- [ ] Light and dark theme.
- [ ] Focus order annotated; landmarks and heading levels annotated; accessible names for icon-only controls written.
- [ ] All text uses real copy (no lorem ipsum), following the voice rules in section 3.
- [ ] Contrast checked with tokens only (no ad-hoc colours).
- [ ] Interactive prototype for any flow with more than 2 steps.

---

## 1. Who we design for

### 1.1 Personas

**Daniel — freelance Shopify and WordPress developer (primary)**
Runs a two-person agency, 18 client sites, mostly US and UK clients. Two clients have asked "are we ADA compliant?" this year and he didn't know how to answer. Wants: one place to see every client site, problems ranked so he fixes the important ones first, branded reports he can send to justify a monthly care-plan fee. Comfortable with code; short on time. Uses a large monitor at work, phone between meetings.

**Grace — owner of a small online skincare store (secondary)**
Shopify store, sells to the US and EU, 4 staff. Read about accessibility lawsuits and is worried. Not technical. Wants: to know if she has a problem, what to do first, and something to give her developer. Needs plain language and reassurance without false promises.

**Mark — Daniel's client, a client viewer**
Owns a furniture store. Receives a monthly report and occasionally logs into the client portal. Wants: "Are we OK? Is it getting better? What is my agency doing?" Reads on a phone.

**Amina — accessibility-aware developer at a mid-size agency**
Knows WCAG. Wants precise rule information, selectors, snippets, CSV export and an API. Will judge us harshly if the product itself is not accessible.

### 1.2 Jobs to be done

1. "Tell me quickly whether my site has serious problems." (Grace, free checker, onboarding)
2. "Show me what to fix first and exactly how." (Daniel, Grace's developer)
3. "Alert me when something breaks again." (Daniel)
4. "Help me prove we are working on it." (Grace, Daniel → evidence pack)
5. "Give me something professional to send my client." (Daniel → white-label reports, portal)
6. "Let me see all my clients' sites at a glance." (Daniel → agency overview)

---

## 2. UX principles

1. **Honest, never alarming.** We describe risk truthfully, never claim "compliant", never use fear tactics. Every score and report states what automated testing cannot check.
2. **Next action always obvious.** Every screen answers "what should I do now?" with one primary action.
3. **Plain language first, detail on demand.** Lead with "Images are missing descriptions" and reveal `image-alt · WCAG 1.1.1 · selector` for those who want it.
4. **Group the noise.** 400 identical errors on product pages is one problem in one template. Design around issues and templates, not raw error counts.
5. **Progress is the reward.** Show what got fixed, celebrate it quietly, and make the trend visible.
6. **Agency-first, client-safe.** Agencies see everything; their clients see a calm, branded, simplified view.
7. **We are the reference implementation.** The product meets WCAG 2.2 AA. If a pattern can't be made accessible, we don't use it.

---

## 3. Brand, voice and words

### 3.1 Personality

Calm expert · precise · supportive · trustworthy. Think "a senior developer who explains things kindly", not "a security alarm".

Visual direction: clean, generous white space, confident typography, one cool primary colour, severity colours used sparingly and always with text and icons. Avoid illustrations of people with disabilities as decoration; if people appear, show real use (keyboard, screen reader, magnifier) respectfully.

### 3.2 Voice rules

| Do | Don't |
| --- | --- |
| "We found 12 problems that automated tests can detect." | "Your site is non-compliant!" |
| "Fix these first — they block people from buying." | "Critical violations detected!!!" |
| "Automated check score" | "Compliance score", "ADA score" |
| "Reduces risk", "shows your progress" | "Protects you from lawsuits", "ADA-proof", "100% accessible" |
| "People who use screen readers can't tell what this button does." | "Missing aria-label." (as a headline) |
| "Fixed — nice work." | Emoji or confetti in the product UI |

Banned words in UI and marketing: *compliant / compliance guaranteed, ADA-proof, lawsuit-proof, certified, 100% accessible, instant fix, one line of code.*

### 3.3 Severity vocabulary (fixed, used everywhere)

| Level | Label | One-line meaning shown in tooltips |
| --- | --- | --- |
| critical | **Critical** | Blocks some people from completing a task. |
| serious | **Serious** | Makes a task very difficult for some people. |
| moderate | **Moderate** | Causes frustration or confusion. |
| minor | **Minor** | Small annoyance; fix when convenient. |

Issue status labels: **Open**, **Fixed**, **Regressed** (shown as a badge on open issues that came back), **Ignored** (with reason), **Needs review** (automated test couldn't decide).

Score bands: **Good** (90–100), **Needs work** (70–89), **Poor** (0–69). Always labelled "Automated check score" with an info button explaining the limits.

### 3.4 Microcopy examples

- Empty issues (after scan): "No problems found by automated tests on the pages we checked. Automated tests catch only part of accessibility — try the manual checks next."
- Scan failed: "We couldn't reach www.example.com. The site returned 'Service unavailable' 3 times. We'll try again at the next scheduled scan, or you can scan now."
- Plan limit: "Your Store plan includes 1 site. Upgrade to Growth to monitor 3 sites."
- Ignore dialog: "Ignored issues stay in your evidence log with your reason, so the history stays honest."

---

## 4. Design tokens

All colours below are verified by script against WCAG 2.2: **text pairs ≥ 4.5:1, UI boundaries ≥ 3:1**, in both themes. Do not introduce colours outside this set without re-checking.

### 4.1 Colour — light theme

| Token | Hex | Use | Contrast (verified) |
| --- | --- | --- | --- |
| `color.bg` | `#FFFFFF` | Page background | — |
| `color.bg-subtle` | `#F6F7F9` | Sidebar, table header, cards on bg | — |
| `color.surface-sunken` | `#EEF1F5` | Code blocks, inputs (disabled) | — |
| `color.text` | `#0F172A` | Primary text | 17.85 on bg |
| `color.text-muted` | `#475569` | Secondary text, help text | 7.58 on bg · 7.07 on bg-subtle |
| `color.border` | `#D5DAE1` | Decorative dividers, card outlines (not the only boundary for controls) | — |
| `color.border-strong` | `#7B8698` | Input, checkbox, select borders | 3.68 on bg |
| `color.primary` | `#2D45C8` | Primary buttons, links, focus ring, selected states | 7.51 on bg · white text on it 7.51 |
| `color.primary-hover` | `#2338A8` | Hover/pressed | white text 9.53 |
| `color.primary-soft` | `#EEF1FD` | Selected row, active nav item background | primary text on it 6.66 |
| `color.info` | `#1D4ED8` | Info banners text/icon | 6.70 on bg |
| `color.critical` / `-soft` | `#B42318` / `#FEF3F2` | Critical severity, destructive actions, errors | 6.57 on bg · 6.05 on soft |
| `color.serious` / `-soft` | `#B54708` / `#FFF6ED` | Serious severity, warnings | 5.43 · 5.08 |
| `color.moderate` / `-soft` | `#8A6100` / `#FEF9E7` | Moderate severity | 5.54 · 5.25 |
| `color.minor` / `-soft` | `#475569` / `#F1F4F8` | Minor severity, neutral badges | 7.58 · 6.87 |
| `color.success` / `-soft` | `#067647` / `#ECFDF3` | Fixed, success, "Good" band | 5.69 · 5.40 |

### 4.2 Colour — dark theme

| Token | Hex | Contrast (verified) |
| --- | --- | --- |
| `color.bg` | `#0B1120` | — |
| `color.bg-subtle` | `#111827` | — |
| `color.surface-sunken` | `#0E1626` | — |
| `color.text` | `#E6EAF0` | 15.59 on bg |
| `color.text-muted` | `#A3AEC0` | 8.40 on bg · 7.92 on bg-subtle |
| `color.border` | `#273246` | decorative |
| `color.border-strong` | `#6B7A90` | 4.31 on bg |
| `color.primary` | `#8EA3FF` | 7.92 on bg; button text uses `color.bg` on primary: 7.92 |
| `color.primary-hover` | `#AAB9FF` | `color.bg` text on it 9.95 |
| `color.primary-soft` | `#1A2347` | primary on it 6.42 |
| `color.info` | `#7DA2FF` | 7.61 |
| `color.critical` / `-soft` | `#FF8A80` / `#2A1416` | 8.25 · 7.60 |
| `color.serious` / `-soft` | `#FDB022` / `#2A1E0D` | 10.23 · 8.84 |
| `color.moderate` / `-soft` | `#F5D565` / `#262110` | 13.08 · 11.16 |
| `color.minor` / `-soft` | `#A3AEC0` / `#1A2232` | 8.40 · 7.11 |
| `color.success` / `-soft` | `#4ADE80` / `#0F2419` | 10.81 · 9.37 |

Rules:
- **Colour never carries meaning alone.** Severity badges always show an icon *and* the word. Charts use labels, patterns or direct annotation.
- Critical and serious are close in hue (red/orange); they are told apart by icon shape and label, not colour.
- Theme follows the operating system by default; users can choose Light / Dark / System in S-48.
- **White-label colour** (agency brand) applies only to the client portal, reports and client emails. It is validated for 4.5:1 against white; if it fails, the UI suggests the nearest passing shade.

### 4.3 Typography

| Token | Font | Size / line height | Weight | Use |
| --- | --- | --- | --- | --- |
| `type.display` | Inter | 48 / 56 | 700 | Marketing hero only |
| `type.h1` | Inter | 30 / 38 | 700 | Page titles (marketing 36/44) |
| `type.h2` | Inter | 24 / 32 | 600 | Section titles |
| `type.h3` | Inter | 20 / 28 | 600 | Card titles |
| `type.h4` | Inter | 16 / 24 | 600 | Sub-sections, table group headers |
| `type.body-lg` | Inter | 18 / 28 | 400 | Marketing paragraphs, fix-guide articles |
| `type.body` | Inter | 16 / 24 | 400 | Default text, forms |
| `type.body-sm` | Inter | 14 / 20 | 400 | Tables, secondary text, badges |
| `type.caption` | Inter | 12 / 16 | 500 | Metadata only (timestamps, counts); never for essential content |
| `type.mono` | JetBrains Mono | 14 / 20 | 400 | Selectors, HTML snippets, API keys |
| `type.score` | Inter (tabular numerals) | 40 / 44 | 700 | Score numbers |

Both fonts are free (SIL Open Font License); self-host them. Use tabular numerals for all numbers in tables and counters. Text must reflow at 200% zoom and 400% (320 px) without loss.

### 4.4 Space, size, shape

- **Spacing scale (px):** 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96. Layout uses multiples of 8.
- **Radius:** `radius.sm` 4 (badges, inputs), `radius.md` 8 (buttons, cards), `radius.lg` 12 (dialogs, drawers), `radius.full` (avatars, pills).
- **Elevation:** `shadow.1` cards on hover; `shadow.2` dropdowns and popovers; `shadow.3` dialogs and drawers. In dark theme, use a lighter surface plus border instead of heavy shadows.
- **Target size:** interactive targets at least **44×44 px** on touch layouts, at least **24×24 px** with spacing on desktop (WCAG 2.5.8). Table row actions use 32 px buttons with 8 px gaps.
- **Focus ring:** 2 px `color.primary` outline + 2 px offset in `color.bg`; never removed; visible on every interactive element, including table rows that open drawers.

### 4.5 Layout and breakpoints

| Name | Width | Layout |
| --- | --- | --- |
| `sm` | 360–767 | Single column; sidebar becomes a drawer; tables become stacked cards |
| `md` | 768–1023 | Collapsed sidebar (icons + tooltips), 8-column grid |
| `lg` | 1024–1439 | Expanded sidebar 248 px, 12-column grid, 24 px gutters |
| `xl` | ≥ 1440 | Content max width 1280 px centred; issue drawer 560 px |

App page anatomy: sidebar · top bar (64 px) · page header (title, breadcrumbs, primary action) · tabs (site pages) · content.

### 4.6 Icons, illustration, motion

- **Icons:** Lucide, 20 px in UI, 16 px in dense tables, 1.5 px stroke. Fixed mapping: critical `octagon-alert`, serious `triangle-alert`, moderate `circle-alert`, minor `info`, fixed `circle-check`, regressed `rotate-ccw`, ignored `eye-off`, needs review `help-circle`.
- **Illustration:** simple line illustrations for empty states only, in `color.text-muted` + one primary accent; decorative images get empty alt text.
- **Motion:** 150 ms for hover/focus, 200 ms for drawers and dialogs, ease-out. No motion that conveys information alone. Respect `prefers-reduced-motion`: replace slides with fades, stop skeleton shimmer, stop progress animations. No parallax, no auto-playing carousels.

---

## 5. Accessibility requirements for every design

The designer owns these; the developer implements them.

1. Annotate **heading levels** (one `h1` per page), **landmarks** (header, nav, main, aside, footer) and **reading/focus order**.
2. Every icon-only button has a written accessible name (e.g. "Ignore issue: Images are missing descriptions").
3. Forms: visible labels (never placeholder-only), help text below fields, errors next to the field **and** in an error summary at the top after submit, required fields marked with text "(required)".
4. Status messages that appear without focus change (toasts, scan progress, filter result counts) are annotated as **live announcements** with the exact text.
5. Data tables have real column headers; sortable columns show the sort direction with an icon **and** text for screen readers.
6. Charts always have a text summary and a "View as table" toggle.
7. Drawers and dialogs: annotate focus start (first heading or first field), focus trap, Escape to close, focus return target.
8. Time limits: none, except session expiry — warn 2 minutes before with an option to extend.
9. Do not rely on hover: everything in a tooltip is reachable by focus and by tap (use a toggletip "info" button for explanations).
10. Content works at 320 px width and 200% text spacing; long URLs and selectors wrap or truncate with full text available.
11. Never use colour, position or shape alone to convey meaning.
12. Motion follows section 4.6.

---

## 6. Component inventory

For each component deliver: anatomy, variants, sizes, states (default, hover, focus, active, disabled, loading, error where relevant), light/dark, and usage notes. The developer builds these first (P0-08), so components marked **D1** are needed in phase D1.

### 6.1 Foundations (D1)

| Component | Variants / notes |
| --- | --- |
| Button | Primary, Secondary (outline), Tertiary (text), Destructive; sizes sm 32 / md 40 / lg 48; with leading icon; loading (spinner + "Saving…" text) |
| IconButton | Ghost and outline; always with tooltip + accessible name |
| Link | Inline (underlined always), standalone, external (icon + "opens in new tab" text for screen readers) |
| Input, Textarea | With label, help, error, prefix (e.g. `https://`), suffix, character count |
| Select, Combobox | Searchable combobox for long lists (sites, members, rules) |
| Checkbox, Radio, Switch | Switch only for instant-effect settings |
| Field group | Label, help, error, required marker layout |
| Badge | Neutral, primary, success; small pill |
| SeverityBadge | Critical / Serious / Moderate / Minor — icon + label; compact (icon + count) for tables |
| StatusBadge | Open, Fixed, Regressed, Ignored, Needs review; site statuses Active, Paused, Not verified, Error; billing Trial, Active, Past due, Read-only |
| Card | Default, interactive (whole-card link with visible focus), stat card |
| Tabs | Underline style; overflow scroll on mobile with arrows |
| Dialog | Small (confirm), medium (forms), with destructive confirm pattern (type name to confirm) |
| Drawer | Right side 560 px (issue detail); full screen on mobile |
| Toast | Success, error, info; 6 s default, pause on hover/focus, close button; errors persist |
| Banner | Info, warning, critical, success; page-level (trial, past due, read-only, maintenance) and inline |
| Tooltip / Toggletip | Tooltip for labels only; toggletip ("ⓘ" button) for explanations |
| DropdownMenu | Row actions, user menu |
| Table | Sortable headers, row selection with bulk-action bar, sticky header, row-as-link pattern, responsive card fallback, empty and loading rows |
| Pagination | Prev/next + page size; "Showing 1–50 of 312" |
| Skeleton, Spinner | Skeleton for page loads; spinner only inside buttons and small areas |
| EmptyState | Illustration (optional), title, one sentence, primary action, secondary link |
| Breadcrumbs | Truncate middle items on mobile |
| Avatar | Image or initials; org avatar (square) vs user avatar (round) |
| Kbd | Keyboard shortcut hint |
| CodeBlock | Mono, wrap toggle, copy button with "Copied" live announcement, language label |

### 6.2 Product components (D2 unless noted)

| Component | Description |
| --- | --- |
| ScoreDisplay | Large score number + band label + small trend arrow with text ("up 6 since last scan") + info toggletip about limits. Variants: large (site overview), medium (cards), small (table cell). **Not** a coloured ring only; if a ring is used it is decorative and the number + label carry meaning |
| SeverityCounts | Row of four SeverityBadges with counts; zero counts shown muted |
| ChangeSummary | "+3 new · 8 fixed · 1 regressed since 12 Oct" with links to filtered lists |
| TrendChart | Line chart of score over last 12 scans with stacked bar option for open issues by severity; hover/focus points show values; text summary + table toggle |
| SiteRow / SiteCard | Name, URL, client, platform icon, score, critical+serious counts, regression flag, last scan, next scan, status; card variant for mobile and portal |
| IssueRow | Severity, plain title, rule ID (mono, muted), template, occurrences count, status badges, assignee avatar, due date; selection checkbox |
| IssueGroupHeader | Group by rule/template: title, count, expand/collapse |
| FilterBar | Search + filter chips (Status, Severity, WCAG, Template, Assignee, More) + "Clear all" + result count; filters open as popovers on desktop, as a full-screen sheet on mobile |
| OccurrenceList | Page URL (truncated, full on focus), selector (mono), "Open page" external link |
| FixGuidePanel | Platform tabs (Shopify / WordPress / Generic), sections from guide, code blocks, "How to check your fix", link to full article |
| AISuggestionCard | Clear "AI suggestion — check before applying" label, generated content, copy, "Report a bad suggestion"; states: not generated, generating, ready, failed, monthly cap reached |
| Timeline | Vertical list of events with icon, text, actor, timestamp; used for issue history and evidence |
| ProgressSteps | Scan phases (Discovering → Scanning → Processing → Done) with "x of y pages" and current URL |
| VerificationMethodCard | Method name, difficulty hint ("2 minutes"), steps, copyable code, "Check now" button, result message |
| PlanLimitPrompt | Inline card or dialog: what limit, current usage, which plan unlocks it, price, upgrade button, "Not now" |
| UsageMeter | Label + "18 of 25 sites" + bar (with text, not bar alone) |
| ColourPickerWithContrast | Hex input + swatch + live contrast ratio against white + pass/fail text + "Use suggested accessible shade" button (D4) |
| LogoUploader | Drag-and-drop + button, preview on light and dark backgrounds, requirements text (D4) |
| DateRangePicker | Presets (Last 30 days, Last 3 months, Last 12 months, Custom) with accessible calendar (D5) |
| FileAttachment | Upload, progress, remove; for manual checks (D5) |
| NotificationItem | Icon, title, body, time, unread dot + "Unread" text, link (D5) |
| CommandPalette | Search input, grouped results (Sites, Pages, Settings, Actions), keyboard hints (D2) |
| OrgSwitcher | Current org with avatar, list of orgs, "Create organisation" (D2) |
| Stepper (wizard) | Numbered steps with labels, current step announced ("Step 2 of 4: Add your site") (D2) |

---

## 7. Information architecture

### 7.1 App navigation (sidebar)

```
[Org switcher]
Overview                    S-20
Sites                       S-21
My tasks                    S-49
Reports (all sites)         S-30 (org-level filter)
—
Settings                    S-40 … S-47, S-51
Help &amp; docs                 (external)
[User menu: Account S-48 · Theme · Sign out]
```

Inside a site, a secondary tab bar:
`Overview (S-24) · Issues (S-25) · Scans (S-27) · Pages (S-29) · Reports (S-30) · Evidence (S-31) · Manual checks (S-32) · Statement (S-33) · Settings (S-34)`. On mobile the tab bar becomes a "Site menu" select.

Top bar: page breadcrumbs (mobile: back link), command palette trigger ("Search or jump to… Ctrl K"), notifications bell (S-50), "Scan now" appears in site context as the page header's primary action.

### 7.2 Client portal navigation

Agency logo · "Your websites" (S-60) · site view (S-61) · "Contact your agency" link · account menu. No settings, no upsells, no PRODUCT_NAME marketing (small "Powered by PRODUCT_NAME" footer only if the agency hasn't hidden it).

### 7.3 Marketing site navigation

Header: logo · Product (anchor sections) · For agencies (S-06) · Pricing (S-02) · Fix guides (S-04) · Free check (S-03, highlighted) · Sign in · Start free trial (primary).
Footer: product links, guides by platform, company (About, Blog, Changelog), legal (Terms, Privacy, DPA, Subprocessors, Bot), accessibility statement for our own site.

---

## 8. Key user flows

Prototype each flow end to end (clickable). Flow IDs are referenced in usability testing (section 14).

**F-01 Free check → trial** (Grace)
Home → enter URL in hero → S-03 progress (≈ 30–60 s, with what we're doing) → result: score, counts, top issues in plain English, "what this can't check" → "Email me the full report" (email + consent) → "Monitor this site free for 14 days" → S-10 sign-up with URL kept → S-14 onboarding skips the add-site step.

**F-02 Sign-up and first results** (Daniel)
S-10 → verify email (can continue meanwhile) → S-14 step 1: "Are you an agency/freelancer or a business owner?" + org name → step 2: add first site (URL, platform auto-detected, client name for agencies) → step 3: quick scan (10 pages) with live progress and a short "while you wait" explainer of severity levels → step 4: results summary + "Verify ownership to turn on weekly monitoring" → S-24.
Target: first results within 3 minutes of sign-up.

**F-03 Verify ownership**
S-24 prompt or S-21 badge → S-23: choose method (recommended first by platform: Shopify → meta tag in `theme.liquid`; WordPress → meta tag via header plugin or file; others → DNS) → copy code → "Check now" → success (monitoring scheduled, next scan date shown) or specific failure with fix hint.

**F-04 Triage and fix** (Daniel)
S-24 "Fix these first" → S-25 grouped by rule → open issue drawer S-26 → read plain explanation → Fix guide tab for Shopify → copy code → apply in theme → "Recheck this issue" → toast: "Fixed — the problem no longer appears on 3 checked pages." → issue moves to Fixed; evidence logged.
Alternative: assign to teammate with due date; or Ignore with reason.

**F-05 Regression alert**
Email E-08 / Slack → "View what changed" → S-28 scan detail diff with regressed issues on top → issue drawer showing timeline "Fixed 2 Oct → Came back 14 Oct (theme update?)".

**F-06 Agency adds a client and shares the portal**
S-21 Add site with client name → verify → S-42 "Invite client" → choose sites → client receives branded E-04 → S-13 accept (simple password set-up) → S-60 portal.

**F-07 Monthly client report**
S-30 → "Schedule monthly report" (agency plans) → recipients, day of month, preview R-04 → save. Each month E-12 delivers the PDF with the agency's branding.

**F-08 Evidence pack after a demand letter** (Grace)
S-31 Evidence → date range (last 12 months) → "Download evidence pack" → R-03 generated (progress + email when ready). Copy explains what the pack is and is not ("a record of your efforts, not a legal certificate").

**F-09 Upgrade at a limit**
Agency on 25 sites clicks "Add site" → PlanLimitPrompt dialog → "Upgrade to Agency Pro" → Paddle checkout overlay → success → dialog closes, Add site dialog opens automatically.

**F-10 Trial ends**
Day 10 banner + E-14 → day 14: read-only banner across app ("Your trial has ended. Your data is safe for 30 days. Choose a plan to resume monitoring.") → S-44 plan picker → checkout → banner disappears, scans resume.

**F-11 Publish an accessibility statement**
S-33 wizard: about you → scope → standard → measures → known limitations (pick open issues to list) → feedback contact → review with live preview → publish → copy link / embed snippet.

**F-12 Log a manual check**
S-32 → "Log a check" → choose type (each shows a 3–5 step how-to) → date, tester, tools, result, notes, attachment → saved → appears on evidence timeline.

---

## 9. Screen specifications

Format: **Purpose** · **Primary action** · **Content and layout** · **States** · **Responsive / notes**.

### 9.1 Marketing site (phase D3, except S-01 waitlist version in D1)

**S-01 Home**
- Purpose: explain the product in 5 seconds and drive free checks and trials.
- Primary action: "Check your site free" (URL field in hero). Secondary: "Start 14-day trial".
- Sections: (1) Hero: headline about finding and fixing accessibility problems before they cost you customers or legal trouble; sub-headline mentions ADA and European Accessibility Act factually; URL input; trust line "No overlay. No script on your site. Honest results." (2) Problem: 3 facts with sources (lawsuit trend, EAA in force since June 2025), calm tone. (3) How it works: Scan → Understand → Fix → Prove (4 steps with small product screenshots). (4) Built for agencies: white-label reports, client portal, all sites at a glance. (5) Why not an overlay: short, factual comparison. (6) Product tour: issue drawer with fix guide screenshot. (7) Pricing teaser. (8) FAQ (including "Will this make my site compliant?" — honest answer). (9) Final CTA.
- States: hero URL validation error; free-check rate-limited message.
- Notes: every screenshot has meaningful alt text; no autoplay video; lightweight (target Lighthouse 95+).

**S-02 Pricing**
- Primary action: "Start free trial" per plan (signed-in users: "Choose plan" → Paddle checkout).
- Content: monthly/annual toggle (radio group, "2 months free" label); 4 plan cards (Store, Growth, Agency — "Most popular for agencies", Agency Pro) with price, who it's for, top 5 features; full comparison table (real table) below; FAQ (tax handled, cancel anytime, what happens after trial, refunds); "Prices in USD; local taxes calculated at checkout."
- States: currently subscribed plan marked "Your plan" when signed in.
- Responsive: cards stack; comparison table becomes per-plan accordions on mobile.

**S-03 Free checker** (input · progress · result)
- Input: URL field, "Check page" button, Turnstile, small note "We check one page. We don't store personal data."
- Progress: step list (Loading page → Running 90+ automated checks → Preparing results) with time estimate; cancel link.
- Result: page URL + date; ScoreDisplay; SeverityCounts; top 10 issues as expandable rows (plain title, severity, who it affects, count, link to fix guide); "What this check can't tell you" panel; email capture card (email, consent checkbox unticked, "Send full report"); CTA card "Monitor your whole site — 14 days free".
- States: invalid URL, unreachable site (with reasons), blocked by robots, rate limited, timeout, zero issues (honest empty message), expired result.
- Notes: progress announced politely at each step; result heading receives focus when ready.

**S-04 Fix guide index**
- Search, platform filter (All, Shopify, WordPress, Generic), list grouped by category (Images, Forms, Colour and contrast, Keyboard, Structure, Media, Links and buttons) with guide cards (title, platform badge, severity typically, read time).
- Empty search state with suggestions.

**S-05 Fix guide article**
- Layout: breadcrumbs; title ("How to add alt text to product images in Shopify"); meta (platform, WCAG criterion, last reviewed date); summary box; table of contents (sticky on desktop); sections: What's wrong · Who it affects · How to fix on &lt;platform&gt; (numbered steps with screenshots) · Code example (CodeBlock) · How to check your fix · Related guides; CTA "Find every place this happens on your site".
- Typography: `type.body-lg`, max 72 characters per line.

**S-06 For agencies**
- Outcome-focused: "Turn accessibility into a monthly care plan." White-label report preview, client portal preview, multi-site overview, pricing for agencies, example maths (25 sites, what agencies typically charge — written as an illustration, clearly labelled as an example), FAQ, CTA.

**S-07 Legal and bot pages**
- Readable long-form layout with table of contents and last-updated date. `/bot` page explains our crawler, user agent, rate limits, how to block it, contact.

**S-08 Blog and changelog**
- Blog list (title, date, summary), post layout same as S-05. Changelog: dated entries, newest first, tags (New, Improved, Fixed).

### 9.2 Authentication and onboarding (D2)

**S-10 Sign up** — Name, email, password (show/hide toggle, requirements listed and checked live in text), Turnstile, terms consent text, "Continue with Google" (if enabled), link to sign in. Side panel on desktop with 3 product benefits. Errors: email taken (offer sign-in), weak password.

**S-11 Sign in** — Email, password, "Email me a sign-in link" alternative, forgot password link. Error copy never reveals whether an email exists beyond what's necessary ("Email or password is incorrect"). Lockout message after rate limit with time remaining.

**S-12 Forgot / reset / verify / magic link** — Four small single-purpose screens with clear success confirmation and next step; expired-link state with "Send a new link".

**S-13 Accept invitation** — "Daniel invited you to join Brightline Studio as a Member" (or branded for client viewers: agency logo, "View your website's accessibility progress"). Existing account: sign in to accept. New: name + password. Expired/revoked state.

**S-14 Onboarding wizard** — Stepper (4 steps), one question per step, back button, progress saved. Step 1 type + org name; Step 2 site URL (+ client name for agencies) with live platform detection ("Looks like a Shopify store"); Step 3 quick scan progress with educational content; Step 4 summary (score, counts, top 3 issues) + "Verify to turn on monitoring" (primary) + "Explore results" (secondary). Agencies see "Add another site" after.

### 9.3 Core app (D2)

**S-20 Overview (organisation)**
- Agency layout: page title "Overview"; summary stat cards (Sites monitored, Average score with trend, Open critical + serious across sites, Regressions this week); "Needs attention" list (sites with regressions, failing verification, failed scans); sites table worst-first (SiteRow) with group-by-client toggle; "Most common problems across your sites" card (rule, affected sites count, link) — D4.
- Store layout with one site: redirect to S-24. With 2–3 sites: compact site cards.
- Empty: no sites → EmptyState "Add your first website" + free-check-like URL field.
- Loading: skeleton cards and rows.

**S-21 Sites list**
- Table: Site (name + URL), Client, Platform, Score, Critical/Serious open, Last scan, Next scan, Status. Search, filters (status, platform, client), sort. Row click → S-24. Row menu: Scan now, Settings, Pause, Remove.
- Header actions: "Add site" (primary), usage meter "18 of 25 sites".
- States: empty; limit reached (Add site opens PlanLimitPrompt); paused rows muted with "Paused" badge; error rows with reason.

**S-22 Add site dialog**
- Fields: Website URL (with `https://` prefix), Site name (auto-filled from page title), Platform (auto-detected, editable), Client name (agencies). Submit starts the quick scan and navigates to S-28 live progress.
- Errors: invalid URL, unreachable, duplicate (link to existing), plan limit.

**S-23 Verify ownership**
- Explanation: why we verify (we only monitor sites you control). Method cards, recommended one first and expanded: Meta tag / DNS record / File upload (later: WordPress plugin, Shopify app). Each card: steps tailored to platform (e.g. "Online Store → Themes → Edit code → layout/theme.liquid → paste inside `&lt;head&gt;`"), CodeBlock with token, "Check now".
- Result states: checking (button loading), success (green banner, next scan date, "Go to site"), failure with exact reason and hint, DNS propagation note ("DNS changes can take up to an hour").

**S-24 Site overview**
- Header: site name, URL (external link), platform, client, verification badge, last scan time; primary action "Scan now" (with remaining manual scans in tooltip/toggletip); secondary "Download report".
- Row 1: ScoreDisplay (large) · SeverityCounts · ChangeSummary since last scan.
- Row 2: TrendChart (score over last 12 scans; toggle to "Open issues by severity").
- Row 3: "Fix these first" — top 5 issues (impact × occurrences) as IssueRows with "View" → drawer; link "See all issues".
- Row 4 (two cards): "Recently fixed" (last 5 with dates) · "Coverage" (pages checked, templates found, next scan, "What automated tests can't check" link to S-32).
- States: never scanned (scan in progress card linking to S-28); not verified (warning banner with "Verify" CTA; scheduled scans off); last scan partial/failed (banner with reason); paused (banner + resume).

**S-25 Issues**
- Page header: "Issues" + counts; actions: Export CSV, "Recheck selected" (bulk).
- FilterBar; default view "Open issues grouped by rule, sorted by severity".
- Grouped list: IssueGroupHeader (rule title, severity, number of issues, total occurrences) → IssueRows (one per template or element pattern).
- Bulk selection bar (sticky bottom on mobile): Assign, Set due date, Ignore, Clear selection; announces "3 issues selected".
- States: loading, empty for filter ("No issues match these filters" + Clear filters), empty overall (positive but honest message + link to manual checks), only ignored issues, read-only mode (actions disabled with explanation).

**S-26 Issue detail (drawer and full page)**
- Header: severity badge, plain-English title, status badges (Open/Regressed/Needs review), actions: Recheck, Assign, Due date, Ignore (menu), Copy link, Open in full page.
- Tabs: **Overview** (Who this affects; Why it matters; WCAG criterion with level and link; where it happens: template + number of pages; first seen / last seen) · **Where it occurs** (OccurrenceList, paginated; HTML snippet CodeBlock; axe failure summary in plain wording) · **How to fix** (FixGuidePanel for site platform; AISuggestionCard below if no written guide or on request) · **History** (Timeline + Notes: composer with markdown preview and "Visible to client" checkbox for agencies).
- Ignore dialog: reason (radio: False positive / Not applicable / Won't fix / Accepted risk), note (required for last two), explanation that it stays in evidence.
- States: loading skeleton; recheck in progress (inline progress and announcement); fixed issue (green banner "Fixed on 14 Oct in scan #23"); ignored (banner with reason, "Reopen").

**S-27 Scans (history)**
- Table: Date, Trigger, Pages scanned (of planned), Score, New / Fixed / Regressed, Duration, Status. Row → S-28.
- States: running scan pinned at top with live progress; partial/failed rows with reason.

**S-28 Scan detail / live progress**
- Running: ProgressSteps, pages counter, current URL, elapsed time, cancel; "You can leave this page; we'll email you when it's done."
- Completed: summary (score, counts), comparison with previous (New, Fixed, Regressed lists — regressed first), pages table (URL, template, status, issues, load time), downloads (report PDF, raw JSON for admins).
- States: queued (position in queue), failed (reason + retry), partial (which pages failed and why), canceled.

**S-29 Pages and templates**
- Template list (accordion): template name ("Product pages"), pages discovered, pages checked last scan, open issues; inside: page rows with pin toggle and last result.
- Actions: "Add page to always check" (pin URL), link to exclusions in settings.

**S-30 Reports**
- Tabs: Generated reports (table: type, scope, date, branded yes/no, download, send) · Schedules (agency plans: list + "New schedule").
- "Create report" dialog: type (Scan summary, Full report, Evidence pack, Agency overview), scan or date range, branded toggle (agency), preview thumbnail.
- Send dialog: recipients (chips, max 10), message, preview of email.
- States: rendering (row with spinner + "We'll email you"), failed (retry), plan-gated schedule (PlanLimitPrompt).

**S-34 Site settings**
- Sections: General (name, client, platform) · Monitoring (frequency, day, hour with org time zone shown, page limit slider with plan max, standard WCAG 2.1 AA / 2.2 AA with explanation) · Pages (pinned URLs list; excluded paths with pattern help and live "matches 42 discovered pages") · Danger zone (pause, remove site with typed confirmation).
- Save pattern: section-level "Save changes" buttons; unsaved-changes warning on leave.

### 9.4 Organisation settings and account (D2 basics, D4/D5/D6 additions)

**S-40 General settings** (D2) — Org name, URL slug, time zone, org type, delete organisation (owner; typed confirmation; explains 30-day recovery and subscription cancellation), transfer ownership.

**S-41 Members** (D2) — Table: name, email, role (select for admins/owners), last active, actions. Pending invitations section (resend, revoke). Invite dialog (emails as chips, role with role descriptions). Member limit meter.

**S-42 Clients** (D4) — Client viewers list: name, email, sites they can see (chips), last visited portal, actions (edit sites, remove). Invite client dialog: email, sites (multi-select combobox), personal message, branded email preview. Empty state explains the portal with an image.

**S-43 Branding** (D4) — Left: form (display name, logos light/dark with LogoUploader, ColourPickerWithContrast, email sender name, report footer text, hide PRODUCT_NAME branding toggle, custom domain — Agency Pro). Right: live previews switchable between Report cover, Email header, Portal header. Custom domain block: status steps (Add CNAME → Add TXT → Verified → Certificate active).

**S-44 Billing** (D4) — Current plan card (plan, price, interval, renewal date, status badge), usage meters (sites, members, daily scans, AI suggestions), "Change plan" (plan picker with comparison and price preview, proration explained in plain words), "Manage payment method and invoices" (Paddle portal), invoices table, cancel subscription (reason survey, what happens next, retention offer = none; keep it honest), resume. Downgrade flow: step to choose which sites to pause if over limit.

**S-45 Notifications** (D5) — Per user: Scan completed (All / Only when issues change / Off), Regression alerts (on/off), Weekly digest, Assigned to me, Billing (owners, always on for critical). Explain each in one line.

**S-46 Integrations** (D5) — Slack card (connect via incoming webhook URL with step-by-step help), Generic webhook card (URL, events, sites, signing secret shown once), delivery log table, test button, disabled-after-failures state.

**S-47 API keys** (D6) — Keys table (name, prefix, scopes, created, last used, revoke); create dialog → one-time secret display with copy and warning "You won't see this again"; link to API docs.

**S-48 Account** (D2) — Profile (name, avatar, email), time zone, theme (Light/Dark/System), password, active sessions (device, location approximation, last active, revoke), personal data export, delete account.

**S-49 My tasks** (D5) — Issues assigned to me across sites, grouped: Overdue · Due this week · Later · No due date; each row shows site name.

**S-50 Notification centre** (D5) — Bell with unread count (text for screen readers "3 unread notifications"); panel listing NotificationItems; "Mark all as read"; link to preferences; empty state.

**S-51 Audit log** (D6) — Filterable table: time, actor, action (plain words, e.g. "Removed member Jane Doe"), target, IP; export CSV.

### 9.5 Evidence and compliance support (D5)

**S-31 Evidence**
- Header: date range picker, "Download evidence pack" (primary), explanation card: "This record shows your ongoing work on accessibility. It is not a certificate of compliance."
- Summary row: scans run, issues fixed, manual checks logged, statement status.
- Timeline grouped by month, filter by event type (chips), each event linking to its source.
- Empty: new site — explains what will appear here.

**S-32 Manual checks**
- Intro: "Automated tests find only part of accessibility problems. These quick checks cover important things they miss."
- Check-type cards (Keyboard only, Screen reader, Zoom to 200% and reflow, Captions and transcripts, Forms and errors, Colour use) each with: why it matters, how long it takes, 3–5 steps, "Log result".
- Logged checks table: date, type, tester, result badge (Pass / Issues found / Partial), notes, attachment.
- Log dialog: type, date, tester name, tools, result, notes, attachment.

**S-33 Accessibility statement**
- Wizard (Stepper) with live preview on the right (desktop) or a "Preview" tab (mobile). Steps per F-11. Known limitations step lists open issues with checkboxes and lets the user rewrite them in plain language. Clear notice: "This is a template to help you write your statement. It is not legal advice."
- Published state: public URL, copy button, embed snippet, version history, "Edit and republish".

### 9.6 Client portal (D4)

**S-60 Portal home** — Agency logo and name; greeting; list of SiteCards: site name, status in plain language ("Improving", "Needs attention", "Stable") derived from trend and open critical issues, score with band, last checked date. Empty state if no sites assigned.

**S-61 Portal site view** — Simple single page: score + band + "What this means" toggletip; trend chart (last 6 months) with text summary; "Open problems" summary by severity in plain words (no selectors, no rule IDs); "Recently fixed by your team" list; notes from agency marked visible; Reports (download); Evidence pack (download); "Contact your agency" button (mailto from agency settings). Mobile-first: designed primarily at 375 px.

### 9.7 Staff admin (D6) — functional, consistent, low design effort

**S-70 Organisations** — Searchable table: org, owner email, plan, status, sites, MRR, created, last active.
**S-71 Organisation detail** — Tabs: Summary, Members, Sites, Scans (with errors), Billing events, Audit; actions: extend trial, plan override with expiry, impersonate (read-only, confirmation, reason required). Impersonation banner across app: "Viewing as Brightline Studio (read-only) — Stop".
**S-72 Queue monitor** — Cards for each queue (waiting, running, failed), dead-letter table with retry/delete, scan failure rate chart (7 days), server memory/disk.
**S-73 Leads** — Free checks and waitlist tables with consent status and conversion; export consented only.
**S-74 Content review** — Flagged AI suggestions with context; approve, delete, "Convert to guide draft".
**S-75 Feature flags** — Flags table with toggle and org allow-list.

### 9.8 System states (D2 basics, D6 complete)

**S-80 Error pages** — 404 ("We can't find that page" + search + links), 500 ("Something went wrong on our side" + retry + status page link + error ID), maintenance page, offline toast, session-expired dialog (sign in again without losing form input).
**S-81 Command palette** — Opens with Ctrl/⌘ K or the top-bar button; search across sites, issues by title, settings pages, actions ("Scan now: example.com", "Invite member"); recent items when empty; full keyboard support; announced result counts.
**S-82 Global banners** — Specs for: email not verified, trial days left (from day 10), trial ended/read-only, past due, site verification failing, maintenance scheduled, impersonation. Priority order when several apply: impersonation &gt; read-only &gt; past due &gt; trial &gt; verification &gt; email.

---

## 10. Reports (PDF) — R-01 to R-06

Design in A4 and US Letter; print-safe colours; tagged headings; minimum 10 pt body text; page numbers "Page 3 of 12"; header with agency or PRODUCT_NAME logo; footer with site, report date and footer text. Every report ends with **"About this report"**: methodology (pages sampled by template, WCAG version, axe-core version, date), and **"What automated testing cannot check"**.

| ID | Report | Pages (typical) | Contents |
| --- | --- | --- | --- |
| R-01 | Scan summary | 2–3 | Cover strip, score + band, severity counts, change since previous scan, top 10 issues, next steps |
| R-02 | Full report | 6–30 | R-01 + every open issue grouped by severity then rule: plain explanation, who is affected, where (templates, example URLs), fix summary, WCAG reference |
| R-03 | Evidence pack | 8–40 | Cover, summary of period, scan history table + trend chart, issues fixed with dates, open issues with assignee and due dates, ignored issues with reasons, manual-check log, statement status and link, methodology and limitations |
| R-04 | Client monthly report | 3–5 | Agency-branded; "This month at a glance" in plain language, trend, fixed this month, still open by severity (simple words), what the agency plans next (from notes visible to client), contact |
| R-05 | Agency overview | 3–10 | All sites table (score, change, critical/serious open), most common problems across sites, sites needing attention |
| R-06 | Free check report | 2–3 | One page's results, top issues with guide links, limitations, CTA to monitor the whole site |

Deliverables: cover, interior page with table, issue detail block, chart block, methodology page — as components, so the developer can compose all six.

---

## 11. Emails — E-01 to E-23

- One responsive layout: 600 px max width, logo header (agency logo for white-labelled ones), single column, 16 px body, buttons as large links (min 44 px tall), dark-mode-friendly (no images with baked-in white backgrounds), plain-text version written.
- Content pattern: one headline that says what happened, one or two sentences, one primary button, optional details list, footer (why you got this, preferences/unsubscribe link for non-essential mail, company address).
- Design in detail: **E-04** invitation (normal and branded client version), **E-06** first scan ready, **E-07** scan completed (with counts), **E-08** regression alert, **E-10** weekly digest (multi-site table that stays readable on mobile), **E-12** monthly client report (branded), **E-13** free check report, **E-14/E-15** trial emails, **E-17** payment failed. The rest — E-02, E-03, E-05, E-09, E-11, E-18, E-19, E-20, E-21, E-22, E-23 — reuse the generic transactional template with copy from the developer spec section 10. E-16 needs no design: Paddle sends payment receipts.

---

## 12. Data visualisation guidelines

- Default chart: line for score over time (y-axis 0–100 fixed so changes aren't exaggerated); stacked bars for open issues by severity over time (stack order critical at bottom).
- Annotate the latest value directly on the chart ("78 · Needs work"); mark scans that were partial with a hollow point and a legend entry.
- Gridlines in `color.border`; series in `color.primary`; severity series use severity tokens **plus** direct labels.
- Every chart: title, one-sentence takeaway above it, accessible text summary, "View as table".
- Hover and keyboard focus on points show a tooltip with date, score and counts.
- No pie charts, no 3D, no gauges as the only score display.

---

## 13. Responsive and mobile patterns

| Pattern | Desktop | Mobile (≤ 767 px) |
| --- | --- | --- |
| Navigation | Sidebar | Top bar + menu drawer; site tabs become a select |
| Tables | Full table | Stacked cards showing the 3–4 most important fields + "More" |
| Issue detail | Right drawer (560 px) | Full-screen sheet with back button |
| Filters | Inline chips + popovers | "Filters (3)" button → full-screen sheet with Apply |
| Bulk actions | Bar above table | Sticky bottom bar |
| Charts | Full width | Simplified (fewer ticks), table toggle prominent |
| Dialogs | Centred | Full-screen sheets for forms; small confirms stay centred |

Priority mobile journeys: portal (Mark), alerts → issue detail (Daniel), free checker (Grace). The full app must work on mobile, but dense work (triage of many issues) is optimised for desktop.

---

## 14. Usability testing plan (no budget)

- Recruit 5 people per round from design partners and the agency network (Daniel-type ×3, Grace-type ×2); include at least one screen-reader user per round (ask accessibility communities; offer a free plan as thanks).
- Remote, 30 minutes, think-aloud, on prototypes before build (rounds after D2 and D4) and on the live app after Phase 2 and Phase 5.
- Tasks: F-01, F-02 + F-03, F-04, F-06, F-08. Success measures: task completion, time, number of wrong turns, confidence rating (1–5), and whether participants can explain what the score does **not** mean.
- Record findings in a simple table (issue, severity, screen, recommendation); fix severity-high items before the phase ships.

---

## 15. Phased design deliverables

Design runs one phase ahead of development. Each phase ends with a review with the developer and a handoff (section 16).

| Design phase | Needed before dev phase | Deliverables |
| --- | --- | --- |
| **D1 — Foundations** (weeks 1–2) | 0 and 1 | Name/logo direction (2–3 options) and final wordmark; tokens (section 4) as Figma variables in light and dark; type scale; icon set mapping; all foundation components (6.1) with states; app shell skeleton; waitlist landing page (S-01 lite); report components for R-01 and R-02 |
| **D2 — Core app** (weeks 2–5) | 2 | Product components (6.2 marked D2); S-10 – S-14, S-20 – S-29, S-30 (on-demand), S-34, S-40, S-41, S-48, S-80 basics, S-81, S-82 basics; emails E-01 – E-07; prototypes F-02, F-03, F-04; usability round 1 |
| **D3 — Marketing and free checker** (weeks 5–7) | 3 | S-01 full, S-02, S-03 (all states), S-04, S-05, S-06, S-07, S-08; Open Graph image template; R-06; E-13; prototype F-01 |
| **D4 — Billing and agency** (weeks 7–9) | 4 | S-42, S-43 (with previews), S-44 (all flows incl. downgrade), PlanLimitPrompt and UsageMeter in context, S-60, S-61, cross-site features on S-20, R-04, R-05, branded E-04 and E-12, E-14 – E-19; prototypes F-06, F-09, F-10; usability round 2 |
| **D5 — Evidence and notifications** (weeks 9–11) | 5 | S-31, S-32, S-33 (wizard + published), S-45, S-46, S-49, S-50, R-03, E-08, E-10, E-21; prototypes F-05, F-07, F-08, F-11, F-12 |
| **D6 — Admin and edge states** (weeks 11–13) | 6 | S-47, S-51, S-70 – S-75, S-80 complete, S-82 complete, impersonation banner, API docs page styling |
| **D7 — Plugin and app surfaces** (week 14+) | 7 | WordPress plugin settings page and dashboard widget (WordPress admin styles); Shopify embedded app screens (Polaris components); store listing images and copy |

---

## 16. Handoff standards

- **File structure:** `00 Cover &amp; changelog` · `01 Foundations (tokens, type, icons)` · `02 Components` · `03 Flows` · `04 Screens by phase (D2 … D7)` · `05 Reports` · `06 Emails` · `07 Archive`.
- **Naming:** frames named with screen ID and state, e.g. `S-25 Issues / Filtered empty / Dark / 375`.
- **Tokens:** exported as JSON (W3C design tokens format) so the developer can generate Tailwind theme variables; token names exactly as in section 4.
- **Annotations:** on each screen — headings, landmarks, focus order, live-region text, accessible names, keyboard behaviour, responsive notes, links to the related developer chunk (e.g. "P2-12").
- **Copy:** final copy in the design; a copy deck (spreadsheet or doc) for all microcopy, errors and emails, keyed by screen ID.
- **Assets:** SVG icons (from Lucide, no edits unless documented), logos in SVG + PNG, illustrations in SVG with `color.text-muted` stroke so they theme correctly.
- **Change process:** after handoff, changes go into the cover page changelog with date, screen ID and reason; notify the developer.
- **Review:** the developer reviews every phase's designs before handoff for feasibility; the designer reviews built screens against designs before each phase release (visual QA list per screen).

---

*End of design specification.*
</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Design Components">
This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.
</attached-skill>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant



## User

Answered — scope: D1 foundations: tokens, type, components sheet, D2 core app: Site overview (S-24) + Issues (S-25) + Issue drawer (S-26), Interactive prototype of flow F-04 (triage and fix), S-01 Home + S-03 Free che…; fidelity: Hi-fi clickable; theme: Light + dark toggle; viewports: 1440 desktop, 1280 laptop, 768 tablet, 375 mobile; states: Default + key states; annotations: Separate notes; logo: Include 2–3 options; font: Keep Inter; variations: 2–3 layout options

## Assistant

_[tool: ask_user]_

_[tool: dc_write]_

_[tool: update_todos]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

I've built six files. All use your spec's tokens and Inter, and have a light/dark toggle. A background check of the main file is still running; I haven't checked the other five yet.

- **Site Workspace** (S-24, S-25, S-26 and flow F-04): clickable site overview, grouped issues list and issue drawer. You can filter, select issues, recheck one (shows a "Fixed" message), ignore one with a reason, generate an AI suggestion, and switch the chart to a table.
- **Foundations** (D1): three name-and-logo ideas (Plainsight, Kerbside, Sightline), colour swatches, type scale, spacing, and the main components with their states.
- **Agency Overview** (S-20): three layouts side by side, labelled 1a (table, worst first), 1b (sites sorted into "needs attention", "improving", "stable") and 1c (grouped by client).
- **Home and Free Check** (S-01, S-03): the free check runs on the page. It covers an invalid web address, the progress steps and the results.
- **Client Portal** (S-60, S-61): phone-width screens in an example agency colour. That colour isn't in your spec, so it needs checking.
- **Accessibility Notes**: headings, landmarks, focus order, screen-reader announcements and button names for each screen.

Things to know:
- I used "Plainsight" as a stand-in name on the marketing site and portal. It still needs a trademark check.
- Two of the three facts on the home page are marked "[to confirm before launch]" because I didn't add real sources.
- The app screens resize to fit the window, but I didn't draw separate 1280, 768 and 375 versions. The portal is the only screen designed at 375.
- In the site workspace, only the Overview and Issues tabs work.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

I've fixed the three problems the check found in the site workspace; a fresh check is running now.

- **Messages:** the pop-up messages after a recheck, a bulk recheck or ignoring an issue now appear.
- **Drawer focus:** opening an issue puts keyboard focus on its title, and closing it sends focus back to the row you opened it from.
- **Breadcrumb:** it now stays on one line and cuts off with "…" when the window is narrow.

## User

Go through styles.refero.design and find me the three design systems closest to my business. Give me the three links and one line on why each fits.

## Assistant

_[tool: web_fetch]_

_[tool: web_fetch]_

_[tool: web_fetch]_

_[tool: web_fetch]_

I didn't go through all ~2,000 styles: the site's search didn't work when I tried it. These three come from its "Clean SaaS" collection, picked against your spec's direction (calm, white, one cool primary colour, product UI first).

1. **Calendly** — https://styles.refero.design/style/9946887b-ffa9-4276-af81-ae6352795afb
   Navy text and one blue on white, the closest match to your palette; the collection notes its cool, spacious product cards.

2. **Officevibe** — https://styles.refero.design/style/ced1c98f-d489-48f7-a01f-1fa59a07b706
   Its accent, Electric Cobalt #2545ff, is almost your primary blue (#2D45C8), and its editorial tone suits your "calm expert" voice.

3. **Attio** — https://styles.refero.design/style/08c8700c-f278-42bc-812e-f60dc6ce996e
   It makes a complex CRM feel orderly on white, the same problem as your dense issue tables and multi-site agency views.

If you want a darker, more technical feel, the site's devtools collection is the next place to look.

## User

Now I want to change the design just a bit. Use the design.md file to redesign the entire site

## User

Found issues — fixing…

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I've fixed the header on the v3 home page. The menu links now stay on one line, and if the window is too narrow they scroll sideways instead of wrapping to a second row. It loads without errors; I skipped a second background check because the change is small.

