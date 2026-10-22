import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accessibility notes" };

const SCREENS: [string, [string, string][]][] = [
  ["Site overview", [
    ["Landmarks", "header (top bar) · nav “Main” (sidebar) · nav “Breadcrumb” · main. Site tabs are a tablist inside main."],
    ["Headings", "h1 “Oakhaus Furniture” → h2 per card: Automated check score, Open problems by severity, Since 12 Oct, Score over the last 12 scans, Fix these first, Recently fixed, Coverage."],
    ["Focus order", "Skip link → org switcher → sidebar nav → breadcrumbs → command palette → theme → notifications → site URL → Download report → Scan now → tabs → score info → change links → chart toggle → chart points (each focusable, labelled “7 Oct: score 74, 13 open problems”) → Fix these first rows → links."],
    ["Accessible names", "Score info button: “About the automated check score”. Bell: “Notifications, 3 unread”. Fix-first rows: “Critical: Images are missing descriptions, Product pages. Open details”."],
    ["Live text", "None on load. Score toggletip uses role=status when opened."],
  ]],
  ["Issues", [
    ["Headings", "h2 “Issues” (page h1 stays the site name) → h3 per rule group, containing the expand button."],
    ["Focus order", "Search → severity chips (aria-pressed) → Status / Template / More → Clear all → bulk bar (when shown) → per group: header button → row checkbox → row title button."],
    ["Live text", "Result count: “Showing 7 of 11 issues” (polite, on every filter change). Selection: “3 issues selected” (polite)."],
    ["Accessible names", "Row checkbox: “Select issue: Text doesn’t have enough contrast, Collection pages”. Group header announces expanded/collapsed."],
    ["Keyboard", "Space toggles checkbox; Enter on title opens drawer."],
  ]],
  ["Issue drawer", [
    ["Role", "role=dialog, aria-modal, labelled by the issue title."],
    ["Focus", "On open: focus moves to the h2 title (tabindex −1). Trap inside drawer. Escape closes. Focus returns to the row that opened it."],
    ["Headings", "h2 issue title → h3 per section (Who this affects, Why it matters, HTML on the first page, How to check your fix)."],
    ["Live text", "Recheck: button label “Rechecking 3 pages…”, then toast “Fixed — the problem no longer appears on 3 checked pages.” (polite). Copy: button text changes to “Copied”. AI: “Writing a suggestion…” then result in role=status."],
    ["Accessible names", "Copy link, Open in full page, Close issue details. External “Open page” links add “(opens in new tab)” for screen readers."],
    ["Ignore dialog", "Focus starts on first radio. Note becomes “(required)” for Won’t fix / Accepted risk; error is shown next to the field with aria-invalid. Escape cancels."],
  ]],
  ["Agency overview", [
    ["Headings", "h1 “Overview” (1b: greeting) → h2 per lane / client group / side card."],
    ["Tables", "1a: real table, th scope=col; Score column has aria-sort=ascending plus visible arrow."],
    ["Cards", "1b/1c: whole-card link with visible focus; card text reads name, client, score, band, reason in that order."],
    ["Mobile", "Table becomes stacked SiteCards showing name, score + band, critical/serious, status."],
  ]],
  ["Home and free check", [
    ["Landmarks", "header with nav “Main” · main · footer."],
    ["Form", "Visible label “Check one page free”; help text linked with aria-describedby. Invalid URL: error with role=alert next to field, aria-invalid on input."],
    ["Progress", "Step list is role=status (polite); each step reads “Running 92 automated checks, in progress”."],
    ["Result", "h1 “Results for soraskin.co” receives focus when ready. Problem rows are h3 buttons with aria-expanded. Email consent checkbox unticked by default."],
    ["Comparison table", "Row headers th scope=row; empty corner header has hidden text “Question”."],
  ]],
  ["Client portal", [
    ["Targets", "All controls ≥ 44 px tall at 375 px."],
    ["Brand colour", "Agency colour validated ≥ 4.5:1 on white before use; focus ring uses brand colour."],
    ["Chart", "Text summary above chart; “View as table” toggle reveals a real table."],
    ["Plain language", "No rule IDs, selectors or WCAG numbers. Severity always shown as count + word."],
  ]],
  ["Motion (all screens)", [
    ["Durations", "150 ms for hover and focus, 200 ms for drawers, dialogs and toasts, ease-out. Page entrances and scroll reveals use GSAP."],
    ["Reduced motion", "With prefers-reduced-motion, slides become short fades, the chart line draws instantly and number count-ups are skipped. No motion carries information on its own."],
  ]],
];

const FILES = [
  ["/foundations", "Foundations"],
  ["/sites/oakhaus", "Site workspace"],
  ["/overview", "Agency overview"],
  ["/", "Home + free check"],
  ["/portal", "Client portal"],
];

export default function Page() {
  return (
    <main className="mx-auto flex max-w-[880px] flex-col gap-10 px-4 pt-12 pb-20 text-base leading-6 sm:px-8">
      <header className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted">Handoff · accessibility annotations</span>
        <h1 className="m-0 font-serif text-[42px] leading-[46px] font-normal">Accessibility notes for this design pass</h1>
        <p className="m-0 text-pretty text-muted">
          Headings, landmarks, focus order, live announcements and accessible names for each screen. Developer implements; designer reviews against these before
          release.
        </p>
        <nav aria-label="Screens" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          {FILES.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {SCREENS.map(([title, rows]) => (
        <section key={title} className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="m-0 text-2xl leading-8 font-semibold">{title}</h2>
          <dl className="m-0 grid gap-x-6 gap-y-3 text-[15px] leading-[22px] sm:grid-cols-[180px_minmax(0,1fr)]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold">{k}</dt>
                <dd className="m-0 text-pretty text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  );
}
