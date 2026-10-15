"use client";

import { useState } from "react";
import { Icon, I } from "@/components/icons";
import { StatusBadge, SeverityBadge, type IssueStatus } from "@/components/badges";
import { ThemeRadio, useTheme } from "@/components/theme";
import { useReveal } from "@/components/reveal";
import { SEV, SEVERITIES } from "@/lib/severity";

// v3 tokens. Ratios computed against color.bg for each theme (WCAG 2.2).
const COLORS: { name: string; v: string; light: [string, string]; dark: [string, string] }[] = [
  { name: "color.page", v: "--page", light: ["#F9F8F6", "Page background"], dark: ["#0B1120", "Page background"] },
  { name: "color.bg", v: "--bg", light: ["#FFFFFF", "Cards, surfaces"], dark: ["#111A2B", "Cards, surfaces"] },
  { name: "color.bg-subtle", v: "--bgs", light: ["#F4F1EC", "Sidebar, table head"], dark: ["#16223A", "Sidebar, table head"] },
  { name: "color.surface-sunken", v: "--sunk", light: ["#EEEAE3", "Code, disabled"], dark: ["#0E1626", "Code, disabled"] },
  { name: "color.text", v: "--text", light: ["#0C1754", "16.58 on bg"], dark: ["#E6EAF0", "14.42 on bg"] },
  { name: "color.text-muted", v: "--muted", light: ["#476788", "5.89 on bg"], dark: ["#A3AEC0", "7.77 on bg"] },
  { name: "color.border", v: "--border", light: ["#EDE5DB", "Decorative"], dark: ["#26354F", "Decorative"] },
  { name: "color.border-strong", v: "--bstrong", light: ["#6E87A3", "3.71 on bg"], dark: ["#6B7A90", "3.99 on bg"] },
  { name: "color.primary", v: "--primary", light: ["#2545FF", "6.22 on bg · white text 6.22"], dark: ["#6EA8FF", "7.22 on bg"] },
  { name: "color.primary-hover", v: "--phover", light: ["#1A33D1", "White text 8.61"], dark: ["#9CC3FF", "bg text 10.46"] },
  { name: "color.primary-soft", v: "--psoft", light: ["#EAEBF8", "Primary text 5.26"], dark: ["#1A2347", "Primary text 7.79"] },
  { name: "color.info", v: "--info", light: ["#1D4ED8", "6.70 on bg"], dark: ["#7DA2FF", "7.03 on bg"] },
  { name: "color.success", v: "--ok", light: ["#067647", "5.69 on bg"], dark: ["#4ADE80", "9.99 on bg"] },
];

const TYPES: { name: string; spec: string; cls: string; sample: string }[] = [
  { name: "type.display (Instrument Serif)", spec: "72/76 · 400", cls: "font-serif text-[44px] leading-[48px] sm:text-[72px] sm:leading-[76px] font-normal", sample: "Fix what stops people buying" },
  { name: "type.h1", spec: "30/38 · 700", cls: "text-[30px] leading-[38px] font-bold", sample: "Oakhaus Furniture" },
  { name: "type.h2", spec: "24/32 · 600", cls: "text-2xl leading-8 font-semibold", sample: "Fix these first" },
  { name: "type.h3", spec: "20/28 · 600", cls: "text-xl leading-7 font-semibold", sample: "Recently fixed" },
  { name: "type.h4", spec: "16/24 · 600", cls: "text-base leading-6 font-semibold", sample: "Who this affects" },
  { name: "type.body-lg", spec: "18/28 · 400", cls: "text-lg leading-7", sample: "People who use screen readers can’t tell what this button does." },
  { name: "type.body", spec: "16/24 · 400", cls: "text-base leading-6", sample: "We found 12 problems that automated tests can detect." },
  { name: "type.body-sm", spec: "14/20 · 400", cls: "text-sm leading-5", sample: "Product pages · 214 occurrences" },
  { name: "type.caption", spec: "12/16 · 500", cls: "text-xs leading-4 font-medium", sample: "Last scan 14 Oct, 09:12" },
  { name: "type.mono", spec: "14/20 · 400", cls: "font-mono text-sm leading-5", sample: ".product__media-item img" },
  { name: "type.score", spec: "40/44 · 700 tnum", cls: "text-[40px] leading-[44px] font-bold", sample: "78" },
];

const STATUSES: IssueStatus[] = ["open", "fixed", "regressed", "ignored", "needsReview"];
const CARD = "rounded-2xl border border-line bg-surface shadow-card";
const BTN = "h-10 rounded-full text-sm font-semibold";

export function Foundations() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [sw, setSw] = useState(true);
  const scope = useReveal<HTMLDivElement>();

  return (
    <div ref={scope} className="min-h-screen bg-page text-ink">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-4 sm:px-10">
        <div className="min-w-[240px] flex-1">
          <div className="text-xs leading-4 font-medium text-muted">D1 · Foundations</div>
          <h1 className="m-0 font-serif text-[34px] leading-[38px] font-normal">
            Tokens, type <em>and</em> components
          </h1>
        </div>
        <nav aria-label="Sections" className="flex flex-wrap gap-4 text-sm">
          <a href="#brand">Name &amp; mark</a>
          <a href="#color">Colour</a>
          <a href="#type">Type</a>
          <a href="#space">Space &amp; shape</a>
          <a href="#comp">Components</a>
        </nav>
        <ThemeRadio />
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-col gap-16 px-4 py-10 sm:px-10">
        <section id="brand" aria-labelledby="h-brand" className="flex flex-col gap-5">
          <div data-reveal>
            <h2 id="h-brand" className="m-0 text-2xl leading-8 font-semibold">
              Name and mark — three directions
            </h2>
            <p className="mt-1 mb-0 max-w-[720px] text-pretty text-muted">
              Working names for discussion; each needs a trademark and domain check. Marks are built from simple geometry so they hold at 16 px and in one colour.
            </p>
          </div>
          <div data-reveal="stagger" className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            {[
              {
                id: "A",
                name: "Plainsight",
                note: "“Problems in plain sight, in plain language.” Lowercase, calm, closest to the voice rules.",
                mark: (
                  <>
                    <span className="grid size-9 place-items-center rounded-full bg-primary">
                      <span className="size-3.5 rounded-full bg-on-primary" />
                    </span>
                    <span className="text-[30px] font-bold tracking-[-0.03em]">plainsight</span>
                  </>
                ),
              },
              {
                id: "B",
                name: "Kerbside",
                note: "Named after the kerb cut — access built in for everyone. Rising steps read as progress.",
                mark: (
                  <>
                    <span className="flex h-8 items-end gap-[3px]">
                      <span className="h-3 w-2.5 rounded-sm bg-primary" />
                      <span className="h-[22px] w-2.5 rounded-sm bg-primary" />
                      <span className="h-8 w-2.5 rounded-sm bg-primary" />
                    </span>
                    <span className="text-[30px] font-bold tracking-[-0.02em]">Kerbside</span>
                  </>
                ),
              },
              {
                id: "C",
                name: "Sightline",
                note: "A clear line of sight across every client site. Most “product-like”; works well in agency contexts.",
                mark: (
                  <>
                    <span className="grid size-[34px] place-items-center rounded-full border-4 border-primary">
                      <span className="h-1 w-[26px] bg-primary" />
                    </span>
                    <span className="text-[30px] font-semibold tracking-[-0.01em]">Sightline</span>
                  </>
                ),
              },
            ].map((l) => (
              <article key={l.id} className={`${CARD} flex flex-col overflow-hidden`}>
                <div className="flex items-center justify-center gap-3 bg-subtle px-6 py-12" aria-hidden="true">
                  {l.mark}
                </div>
                <div className="flex flex-col gap-1 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary-soft px-2 text-[13px] font-semibold text-ptext">{l.id}</span>
                    <h3 className="m-0 text-base font-semibold">{l.name}</h3>
                  </div>
                  <p className="m-0 text-sm leading-5 text-muted">{l.note}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="color" aria-labelledby="h-color" className="flex flex-col gap-5">
          <div data-reveal>
            <h2 id="h-color" className="m-0 text-2xl leading-8 font-semibold">
              Colour tokens · {dark ? "Dark theme" : "Light theme"}
            </h2>
            <p className="mt-1 mb-0 text-muted">Contrast ratios are measured against color.bg. Use the toggle above to see the other theme.</p>
          </div>
          <div data-reveal="stagger" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {COLORS.map((c) => {
              const [hex, note] = dark ? c.dark : c.light;
              return (
                <div key={c.name} className={`${CARD} overflow-hidden`}>
                  <div className="h-16 border-b border-line" style={{ background: `var(${c.v})` }} />
                  <div className="flex flex-col px-3 py-2.5">
                    <code className="font-mono text-[13px] font-medium">{c.name}</code>
                    <span className="tnum text-[13px] text-muted">
                      {hex} · {note}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <h3 className="mt-2 mb-0 text-base font-semibold">Severity — always icon + word</h3>
          <div data-reveal="stagger" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {SEVERITIES.map((k) => (
              <div key={k} className={`flex flex-col gap-1.5 rounded-lg p-4 ${SEV[k].bg} ${SEV[k].text}`}>
                <span className="flex items-center gap-1.5 font-semibold">
                  <Icon d={SEV[k].icon} size={20} />
                  {SEV[k].label}
                </span>
                <span className="text-sm leading-5">{SEV[k].tip}</span>
                <code className="font-mono text-xs">{SEV[k].lucide}</code>
              </div>
            ))}
          </div>
        </section>

        <section id="type" aria-labelledby="h-type" className="flex flex-col gap-5">
          <h2 id="h-type" data-reveal className="m-0 text-2xl leading-8 font-semibold">
            Type scale — Instrument Serif, Manrope and JetBrains Mono
          </h2>
          <div data-reveal className={CARD}>
            {TYPES.map((t, i) => (
              <div
                key={t.name}
                className={`grid items-baseline gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] ${i < TYPES.length - 1 ? "border-b border-line" : ""}`}
              >
                <span className="flex flex-col">
                  <code className="font-mono text-[13px] font-medium">{t.name}</code>
                  <span className="text-xs leading-4 text-muted">{t.spec}</span>
                </span>
                <span className={`tnum [overflow-wrap:anywhere] ${t.cls}`}>{t.sample}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="space" aria-labelledby="h-space" className="flex flex-col gap-5">
          <h2 id="h-space" data-reveal className="m-0 text-2xl leading-8 font-semibold">
            Space, radius, focus
          </h2>
          <div data-reveal="stagger" className="flex flex-wrap items-end gap-3">
            {[2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <span className="rounded-sm bg-primary" style={{ width: n, height: n }} />
                <span className="tnum text-xs text-muted">{n}</span>
              </div>
            ))}
          </div>
          <div data-reveal="stagger" className="flex flex-wrap gap-6">
            {[
              ["rounded", "radius.sm 4"],
              ["rounded-lg", "radius.md 8"],
              ["rounded-xl", "radius.lg 12"],
              ["rounded-full", "radius.full"],
            ].map(([cls, label]) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <span className={`size-[72px] border-2 border-line-strong ${cls}`} />
                <code className="font-mono text-xs">{label}</code>
              </div>
            ))}
            <div className="flex flex-col items-center gap-1.5">
              <span className="grid h-10 w-[120px] place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary outline-2 outline-offset-2 outline-primary">
                Focused
              </span>
              <code className="mt-1.5 font-mono text-xs">focus 2px + 2px offset</code>
            </div>
          </div>
        </section>

        <section id="comp" aria-labelledby="h-comp" className="flex flex-col gap-8">
          <h2 id="h-comp" data-reveal className="m-0 text-2xl leading-8 font-semibold">
            Components
          </h2>

          <div data-reveal className="flex flex-col gap-3">
            <h3 className="m-0 text-base font-semibold">Button — variants × states (md 40)</h3>
            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-[120px_repeat(5,minmax(0,1fr))] items-center gap-3 text-xs text-muted">
                <span />
                <span>Default</span>
                <span>Hover</span>
                <span>Focus</span>
                <span>Disabled</span>
                <span>Loading</span>

                <span>Primary</span>
                <button type="button" className={`${BTN} ease-ui bg-primary text-on-primary hover:bg-primary-hover`}>Scan now</button>
                <button type="button" className={`${BTN} bg-primary-hover text-on-primary`}>Scan now</button>
                <button type="button" className={`${BTN} bg-primary text-on-primary outline-2 outline-offset-2 outline-primary`}>Scan now</button>
                <button type="button" disabled className={`${BTN} bg-sunk text-muted`}>Scan now</button>
                <button type="button" className={`${BTN} flex items-center justify-center gap-2 bg-primary text-on-primary`}>
                  <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-on-primary border-r-transparent" />
                  Saving…
                </button>

                <span>Secondary</span>
                <button type="button" className={`${BTN} ease-ui border border-line-strong bg-surface text-ink hover:bg-subtle`}>Download report</button>
                <button type="button" className={`${BTN} border border-line-strong bg-subtle text-ink`}>Download report</button>
                <button type="button" className={`${BTN} border border-line-strong bg-surface text-ink outline-2 outline-offset-2 outline-primary`}>Download report</button>
                <button type="button" disabled className={`${BTN} border border-line bg-surface text-muted`}>Download report</button>
                <span />

                <span>Tertiary</span>
                <button type="button" className={`${BTN} ease-ui bg-transparent text-ptext hover:bg-primary-soft`}>See all issues</button>
                <button type="button" className={`${BTN} bg-primary-soft text-ptext`}>See all issues</button>
                <span />
                <span />
                <span />

                <span>Destructive</span>
                <button type="button" className={`${BTN} bg-crit text-surface`}>Remove site</button>
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>

          <div data-reveal className="grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f1" className="text-sm font-semibold">Website URL (required)</label>
              <div className="flex h-10 overflow-hidden rounded border border-line-strong">
                <span className="grid place-items-center border-r border-line bg-subtle px-2.5 text-sm text-muted">https://</span>
                <input id="f1" defaultValue="oakhaus.com" aria-describedby="f1-help" className="min-w-0 flex-1 border-0 bg-surface px-2.5 text-sm text-ink" />
              </div>
              <span id="f1-help" className="text-sm leading-5 text-muted">The home page of the site you want to monitor.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f2" className="text-sm font-semibold">Website URL (required)</label>
              <div className="flex h-10 overflow-hidden rounded border-2 border-crit">
                <span className="grid place-items-center bg-subtle px-2.5 text-sm text-muted">https://</span>
                <input id="f2" defaultValue="oakhaus" aria-invalid="true" aria-describedby="f2-err" className="min-w-0 flex-1 border-0 bg-surface px-2.5 text-sm text-ink" />
              </div>
              <span id="f2-err" className="flex items-center gap-1.5 text-sm leading-5 text-crit">
                <Icon d={I.critical} />
                Enter a full web address, like oakhaus.com
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" defaultChecked className="m-0 size-[18px] accent-ptext" />
                Visible to client
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <input type="radio" name="freq" defaultChecked className="m-0 size-[18px] accent-ptext" />
                Weekly
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={sw}
                onClick={() => setSw((v) => !v)}
                className="flex items-center gap-2.5 border-0 bg-transparent p-0 text-sm text-ink"
              >
                <span className={`relative block h-6 w-10 rounded-xl border border-line-strong transition-colors duration-150 ${sw ? "bg-primary" : "bg-sunk"}`}>
                  <span
                    className={`absolute top-[3px] size-4 rounded-full transition-[left] duration-150 ease-out ${sw ? "left-[19px] bg-on-primary" : "left-[3px] bg-line-strong"}`}
                  />
                </span>
                Regression alerts · {sw ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div data-reveal className="flex flex-col gap-3">
            <h3 className="m-0 text-base font-semibold">Badges</h3>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((k) => (
                <SeverityBadge key={k} sev={k} />
              ))}
              {STATUSES.map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
          </div>

          <div data-reveal className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            <div role="note" className="flex gap-3 rounded-lg border border-ser bg-ser-soft px-4 py-3.5 text-ink">
              <Icon d={I.serious} size={20} stroke="var(--ser)" className="flex-none" />
              <span className="flex-1 text-sm leading-5">
                <strong>Your trial has ended.</strong> Your data is safe for 30 days. Choose a plan to resume monitoring. <a href="#">Choose a plan</a>
              </span>
            </div>
            <div className="flex gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 shadow-pop">
              <Icon d={I.fixed} size={20} stroke="var(--ok)" className="flex-none" />
              <span className="flex-1 text-sm leading-5">Fixed — the problem no longer appears on 3 checked pages.</span>
              <span aria-hidden="true" className="text-muted">✕</span>
            </div>
          </div>

          <div data-reveal="stagger" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
            <div className={`${CARD} flex flex-col gap-1.5 p-5`}>
              <span className="text-xs font-medium text-muted">ScoreDisplay · large</span>
              <span className="text-sm font-semibold text-muted">Automated check score ⓘ</span>
              <span className="flex items-baseline gap-2.5">
                <span className="tnum text-[40px] leading-[44px] font-bold">92</span>
                <span className="rounded bg-ok-soft px-2 py-0.5 text-sm font-semibold text-ok">Good</span>
              </span>
              <span className="text-sm text-muted">No change since last scan</span>
            </div>
            <div className={`${CARD} flex flex-col gap-1.5 p-5`}>
              <span className="text-xs font-medium text-muted">ScoreDisplay · medium, Poor</span>
              <span className="flex items-baseline gap-2.5">
                <span className="tnum text-[30px] leading-[38px] font-bold">54</span>
                <span className="rounded bg-crit-soft px-2 py-0.5 text-sm font-semibold text-crit">Poor</span>
              </span>
              <span className="text-sm text-crit">Down 9 since last scan</span>
            </div>
            <div className={`${CARD} flex flex-col gap-2 p-5`}>
              <span className="text-xs font-medium text-muted">UsageMeter</span>
              <span className="flex justify-between text-sm">
                <span className="font-semibold">Sites</span>
                <span className="tnum">18 of 25 sites</span>
              </span>
              <span className="block h-2 overflow-hidden rounded border border-line-strong bg-sunk">
                <span className="block h-full w-[72%] bg-primary" />
              </span>
            </div>
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong p-6">
              <span className="text-xs font-medium text-muted">EmptyState</span>
              <h4 className="m-0 text-base font-semibold">Add your first website</h4>
              <p className="m-0 text-sm leading-5 text-muted">We&apos;ll run a quick 10-page check and show results in about a minute.</p>
              <button type="button" className="ease-ui h-10 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">
                Add site
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
