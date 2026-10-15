"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BandBadge } from "@/components/badges";
import { useEntrance } from "@/components/reveal";
import { band } from "@/lib/severity";
import { COMMON_PROBLEMS, SITES, type SiteRow } from "@/lib/site-data";

const LAYOUTS = [
  { id: "1a", label: "Worst-first table", hint: "Dense, scannable; closest to the spec." },
  { id: "1b", label: "Triage lanes", hint: "Sites sorted into what to do this week." },
  { id: "1c", label: "Grouped by client", hint: "Mirrors how agencies bill." },
] as const;
type LayoutId = (typeof LAYOUTS)[number]["id"];

const CARD = "rounded-2xl border border-line bg-surface shadow-card";
const H1 = "m-0 font-serif text-[36px] leading-10 font-normal sm:text-[42px] sm:leading-[46px]";
const PRIMARY = "ease-ui inline-flex h-10 items-center rounded-full border-0 bg-primary px-4 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary";

const deltaCls = (r: SiteRow) => (r.dir > 0 ? "text-ok" : r.dir < 0 ? "text-crit" : "text-muted");
const siteHref = (r: SiteRow) => (r.url === "oakhaus.com" ? "/sites/oakhaus" : "#");

function Score({ r, size = "text-base" }: { r: SiteRow; size?: string }) {
  return (
    <span className="flex items-center gap-2">
      <strong className={`tnum min-w-6 ${size}`}>{r.score ?? "—"}</strong>
      <BandBadge score={r.score} className="px-1.5 text-[13px]" />
    </span>
  );
}

/* ---------- 1a — Worst-first table ---------- */
function TableLayout() {
  const sorted = SITES.slice().sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const stats = [
    { label: "Sites monitored", value: "18", sub: "of 25 on Agency", c: "text-muted" },
    { label: "Average score", value: "81", sub: "Up 3 since last week", c: "text-ok" },
    { label: "Open critical + serious", value: "64", sub: "Down 12 since last week", c: "text-ok" },
    { label: "Regressions this week", value: "2", sub: "Oakhaus, Kito Coffee", c: "text-muted" },
  ];
  const attention = [
    { name: "Mwanga Solar", why: "scan failed (503)" },
    { name: "Sora Skincare", why: "down 9" },
    { name: "Oakhaus Furniture", why: "1 regression" },
  ];
  return (
    <div data-layout className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={H1}>Overview</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">18 of 25 sites</span>
          <button type="button" className={PRIMARY}>
            Add site
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`${CARD} flex flex-col gap-1 px-5 py-4`}>
            <span className="text-sm font-medium text-muted">{s.label}</span>
            <span className="tnum font-serif text-[42px] leading-[46px] font-normal">{s.value}</span>
            <span className={`text-sm ${s.c}`}>{s.sub}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-ser bg-ser-soft px-4 py-3">
        <strong className="text-sm">Needs attention</strong>
        {attention.map((a) => (
          <a key={a.name} href="#" className="text-sm text-ink">
            <strong>{a.name}</strong> — {a.why}
          </a>
        ))}
      </div>

      {/* Desktop: real table. Mobile: stacked SiteCards. */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm leading-5">
          <thead>
            <tr className="bg-subtle text-left text-muted">
              <th scope="col" className="px-3 py-2.5 font-semibold">Site</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Client</th>
              <th scope="col" className="px-3 py-2.5 font-semibold" aria-sort="ascending">
                Score <span aria-hidden="true">↑</span>
                <span className="sr-only">, sorted lowest first</span>
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Critical · Serious</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Change</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Last scan</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody data-rows>
            {sorted.map((r) => (
              <tr key={r.url} className="ease-ui border-b border-line hover:bg-surface">
                <td className="p-3">
                  <Link href={siteHref(r)} className="block font-semibold text-ink no-underline hover:text-ptext">
                    {r.name}
                  </Link>
                  <span className="text-muted">
                    {r.url} · {r.platform}
                  </span>
                </td>
                <td className="p-3">{r.client}</td>
                <td className="p-3">
                  <Score r={r} />
                </td>
                <td className="tnum p-3">
                  <span className="font-semibold text-crit">{r.crit} critical</span> · <span className="font-semibold text-ser">{r.ser} serious</span>
                </td>
                <td className={`p-3 ${deltaCls(r)}`}>{r.delta}</td>
                <td className="p-3 text-muted">{r.last}</td>
                <td className="p-3">
                  <span className="rounded border border-line-strong px-2 py-px text-[13px] font-medium">{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {sorted.map((r) => (
          <li key={r.url}>
            <Link href={siteHref(r)} className={`${CARD} flex flex-col gap-2 p-4 text-ink no-underline hover:text-ink`}>
              <span className="flex items-start justify-between gap-3">
                <span>
                  <strong className="block">{r.name}</strong>
                  <span className="text-sm text-muted">{r.client}</span>
                </span>
                <Score r={r} size="text-lg" />
              </span>
              <span className="tnum text-sm">
                <span className="font-semibold text-crit">{r.crit} critical</span> · <span className="font-semibold text-ser">{r.ser} serious</span>
              </span>
              <span className="flex justify-between text-sm">
                <span className={deltaCls(r)}>{r.delta}</span>
                <span className="rounded border border-line-strong px-2 py-px text-[13px] font-medium">{r.status}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 1b — Triage lanes ---------- */
function LanesLayout() {
  const lanes = [
    { title: "Needs attention", hint: "Regressions, failed scans, sharp drops.", items: SITES.filter((r) => r.reason).map((r) => ({ r, reason: r.reason })) },
    {
      title: "Improving",
      hint: "Score rising; keep going.",
      items: SITES.filter((r) => !r.reason && r.dir > 0).map((r) => ({ r, reason: `${r.delta} since last scan · ${r.crit} critical open` })),
    },
    {
      title: "Stable",
      hint: "Nothing changed. Check monthly.",
      items: SITES.filter((r) => !r.reason && r.dir === 0).map((r) => ({ r, reason: r.status === "Paused" ? "Paused" : `No change · last scan ${r.last}` })),
    },
  ];
  return (
    <div data-layout className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={H1}>Good morning, Daniel</h1>
          <p className="mt-1 mb-0 text-muted">3 sites need you this week. Average score 81, up 3 since last week.</p>
        </div>
        <button type="button" className={PRIMARY}>
          Add site
        </button>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-3">
        {lanes.map((l) => (
          <section key={l.title} aria-labelledby={`lane-${l.title}`} className="flex flex-col gap-3 rounded-xl bg-subtle p-4">
            <h2 id={`lane-${l.title}`} className="m-0 flex justify-between text-base font-semibold">
              <span>{l.title}</span>
              <span className="font-medium text-muted">{l.items.length}</span>
            </h2>
            <p className="m-0 text-sm leading-5 text-muted">{l.hint}</p>
            {l.items.map(({ r, reason }) => {
              const b = band(r.score);
              return (
                <Link
                  key={r.url}
                  href={siteHref(r)}
                  className="ease-ui flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3.5 text-ink no-underline hover:-translate-y-0.5 hover:text-ink hover:shadow-pop"
                >
                  <span className="flex justify-between gap-2">
                    <span>
                      <strong className="block">{r.name}</strong>
                      <span className="text-[13px] text-muted">{r.client}</span>
                    </span>
                    <span className="text-right">
                      <strong className="tnum text-xl">{r.score ?? "—"}</strong>
                      <span className={`block text-xs font-semibold ${b.text}`}>{b.label}</span>
                    </span>
                  </span>
                  <span className="text-[13px] text-muted">{reason}</span>
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ---------- 1c — Grouped by client + common problems ---------- */
function ClientsLayout() {
  const [byClient, setByClient] = useState(true);
  const groups = byClient
    ? [...new Set(SITES.map((s) => s.client))].map((c) => ({ name: c, items: SITES.filter((s) => s.client === c) }))
    : [{ name: "All sites", items: SITES }];
  return (
    <div data-layout className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className={H1}>Overview</h1>
          <div role="radiogroup" aria-label="Group by" className="inline-flex overflow-hidden rounded-full border border-line-strong text-sm font-semibold">
            {[
              ["By client", true],
              ["All sites", false],
            ].map(([l, v]) => (
              <button
                key={String(l)}
                type="button"
                role="radio"
                aria-checked={byClient === v}
                onClick={() => setByClient(v as boolean)}
                className={`ease-ui border-0 px-3 py-1.5 ${byClient === v ? "bg-primary text-on-primary" : "bg-surface text-ink hover:bg-subtle"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {groups.slice(0, 6).map((g) => (
          <section key={g.name} aria-labelledby={`cl-${g.name}`} className={`${CARD} overflow-hidden`}>
            <h2 id={`cl-${g.name}`} className="m-0 flex justify-between bg-subtle px-4 py-3 text-base font-semibold">
              <span>{g.name}</span>
              <span className="text-sm font-normal text-muted">
                {g.items.length} {g.items.length === 1 ? "site" : "sites"}
              </span>
            </h2>
            {g.items.map((r) => (
              <div
                key={r.url}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_120px_180px_110px]"
              >
                <span>
                  <Link href={siteHref(r)} className="font-semibold text-ink no-underline hover:text-ptext">
                    {r.name}
                  </Link>
                  <span className="block text-muted">{r.url}</span>
                </span>
                <Score r={r} />
                <span className="tnum">
                  {r.crit} critical · {r.ser} serious
                </span>
                <span className={deltaCls(r)}>{r.delta}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <aside className="flex flex-col gap-4">
        <section className={`${CARD} flex flex-col gap-3 p-5`}>
          <h2 className="m-0 text-xl leading-7 font-semibold">Most common problems</h2>
          <p className="m-0 text-sm leading-5 text-muted">Fix once in a shared theme, help many clients.</p>
          {COMMON_PROBLEMS.map((p) => (
            <a key={p.t} href="#" className="flex justify-between gap-3 border-t border-line py-2 text-sm text-ink no-underline hover:text-ptext">
              <span>{p.t}</span>
              <span className="whitespace-nowrap text-muted">{p.n} sites</span>
            </a>
          ))}
        </section>
        <section className={`${CARD} flex flex-col gap-2 p-5`}>
          <h2 className="m-0 text-base font-semibold">This week</h2>
          <span className="text-sm">2 regressions · 31 problems fixed · 1 failed scan</span>
          <a href="#" className="text-sm font-semibold">
            Send monthly reports (5 due)
          </a>
        </section>
      </aside>
    </div>
  );
}

/** S-20 Agency overview — three layout options from the design pass, switchable for review. */
export function AgencyOverview() {
  const [layout, setLayout] = useState<LayoutId>("1a");
  const scope = useEntrance<HTMLDivElement>([layout], "[data-layout] > *, [data-rows] > tr");
  const current = LAYOUTS.find((l) => l.id === layout)!;

  return (
    <AppShell active="overview" crumbs={[{ label: "Overview" }]}>
      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-full border border-dashed border-line-strong py-2 pr-4 pl-2 text-sm">
        <div role="radiogroup" aria-label="Design option" className="inline-flex gap-1">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={layout === l.id}
              onClick={() => setLayout(l.id)}
              className={`ease-ui rounded-full border-0 px-3 py-1 font-bold ${layout === l.id ? "bg-primary text-on-primary" : "bg-transparent text-ink hover:bg-subtle"}`}
            >
              {l.id}
              <span className="sr-only">: {l.label}</span>
            </button>
          ))}
        </div>
        <span className="font-semibold">{current.label}</span>
        <span className="text-muted">{current.hint}</span>
      </div>
      <div ref={scope}>
        {layout === "1a" && <TableLayout />}
        {layout === "1b" && <LanesLayout />}
        {layout === "1c" && <ClientsLayout />}
      </div>
    </AppShell>
  );
}
