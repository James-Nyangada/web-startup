"use client";

import { useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { useEntrance } from "@/components/reveal";
import { TrendChart } from "./trend-chart";
import { SEV, SEVERITIES } from "@/lib/severity";
import { TREND, type Issue } from "@/lib/site-data";
import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";

const CARD = "rounded-2xl border border-line bg-surface shadow-card";

export function OverviewTab({
  active,
  fixed,
  fixedCount,
  onOpen,
  goIssues,
}: {
  active: Issue[];
  fixed: [string, string][];
  fixedCount: number;
  onOpen: (id: string) => void;
  goIssues: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [chartTable, setChartTable] = useState(false);
  const scope = useEntrance<HTMLDivElement>();
  const scoreRef = useRef<HTMLSpanElement>(null);

  // Count the score up on first view.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(scoreRef.current, { textContent: 0 }, { textContent: 78, duration: 1, ease: "power2.out", snap: { textContent: 1 }, delay: 0.15 });
    });
    return () => mm.revert();
  });

  const sevCounts = SEVERITIES.map((k) => ({ k, n: active.filter((i) => i.sev === k).length }));
  const ranked = active.slice().sort((a, b) => SEV[b.sev].weight * 1000 + b.occ - (SEV[a.sev].weight * 1000 + a.occ));
  const regressed = active.filter((i) => i.status === "regressed").length;
  const link = (e: React.MouseEvent) => {
    e.preventDefault();
    goIssues();
  };

  return (
    <div ref={scope} className="flex flex-col gap-6">
      <section aria-labelledby="h-score" className={`${CARD} grid items-start gap-x-10 gap-y-6 p-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]`}>
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <h2 id="h-score" className="m-0 text-sm leading-5 font-semibold text-muted">
              Automated check score
            </h2>
            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              aria-expanded={infoOpen}
              aria-label="About the automated check score"
              className="ease-ui grid size-6 place-items-center rounded-full border-0 bg-transparent text-muted hover:text-ink"
            >
              <Icon d={I.minor} />
            </button>
          </div>
          {infoOpen && (
            <div role="status" className="absolute top-8 left-0 z-10 w-[min(320px,80vw)] rounded-lg border border-line bg-surface p-4 text-sm leading-5 shadow-pop">
              This score reflects only what automated tests can detect on the 142 pages we checked — usually around a third of accessibility problems. It is not a
              compliance rating. <a href="#">What automated tests can&apos;t check</a>
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <span ref={scoreRef} className="tnum text-[40px] leading-[44px] font-bold tracking-[-0.02em]">
              78
            </span>
            <span className="text-base text-muted">/ 100</span>
            <span className="rounded bg-mod-soft px-2 py-0.5 text-sm leading-5 font-semibold text-mod">Needs work</span>
          </div>
          <span className="inline-flex items-center gap-1 text-sm leading-5 font-medium text-ok">
            <Icon d={I.arrowUpRight} strokeWidth={2} />
            Up 6 since last scan
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="m-0 text-sm leading-5 font-semibold text-muted">Open problems by severity</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {sevCounts.map(({ k, n }) => (
              <li
                key={k}
                title={SEV[k].tip}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 ${n ? `${SEV[k].bg} ${SEV[k].text}` : "bg-subtle text-muted"}`}
              >
                <Icon d={SEV[k].icon} size={18} />
                <span className="flex-1 text-sm font-semibold">{SEV[k].label}</span>
                <span className="tnum text-lg font-bold">{n}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="m-0 text-sm leading-5 font-semibold text-muted">Since 12 Oct</h2>
          <div className="flex flex-col gap-2 text-base">
            <a href="#" onClick={link} className="flex justify-between border-b border-line py-1.5 text-ink no-underline hover:text-ptext">
              <span>New problems</span>
              <strong className="tnum">+3</strong>
            </a>
            <a href="#" onClick={link} className="flex justify-between border-b border-line py-1.5 text-ink no-underline hover:text-ptext">
              <span>Fixed</span>
              <strong className="tnum text-ok">{fixedCount}</strong>
            </a>
            <a href="#" onClick={link} className="flex justify-between py-1.5 text-ink no-underline hover:text-ptext">
              <span className="inline-flex items-center gap-1.5">
                <Icon d={I.regressed} />
                Came back (regressed)
              </span>
              <strong className="tnum">{regressed}</strong>
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="h-trend" className={`${CARD} flex flex-col gap-4 p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="h-trend" className="m-0 text-xl leading-7 font-semibold">
              Score over the last 12 scans
            </h2>
            <p className="m-0 text-sm leading-5 text-pretty text-muted">Up from 61 to 78 since 5 Aug. Open problems fell from 24 to 11. The 2 Sep scan was partial.</p>
          </div>
          <button
            type="button"
            onClick={() => setChartTable((v) => !v)}
            aria-pressed={chartTable}
            className="ease-ui h-8 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-subtle"
          >
            {chartTable ? "View as chart" : "View as table"}
          </button>
        </div>
        {!chartTable ? (
          <>
            <div className="min-h-[120px] w-full sm:min-h-[200px]">
              <TrendChart />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs leading-4 text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-primary" />
                Full scan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2 border-primary" />
                Partial scan (some pages failed)
              </span>
              <span>Use Tab to move between points</span>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="tnum w-full border-collapse text-sm leading-5">
              <thead>
                <tr className="bg-subtle text-left">
                  {["Scan date", "Score", "Open problems", "Note"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TREND.map((r) => (
                  <tr key={r[0]} className="border-b border-line">
                    <td className="px-3 py-2">{r[0]}</td>
                    <td className="px-3 py-2">{r[1]}</td>
                    <td className="px-3 py-2">{r[2]}</td>
                    <td className="px-3 py-2 text-muted">{r[3] ? "Partial — 9 pages timed out" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="h-first" className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-6 py-5">
          <div className="flex flex-col gap-1">
            <h2 id="h-first" className="m-0 text-xl leading-7 font-semibold">
              Fix these first
            </h2>
            <p className="m-0 text-sm leading-5 text-muted">Ranked by how badly they block people, times how often they happen.</p>
          </div>
          <a href="#" onClick={link} className="text-sm font-semibold whitespace-nowrap">
            See all issues
          </a>
        </div>
        <ul className="m-0 list-none p-0">
          {ranked.slice(0, 5).map((i) => (
            <li key={i.id} className="border-t border-line">
              <button
                type="button"
                onClick={() => onOpen(i.id)}
                aria-label={`${SEV[i.sev].label}: ${i.title}, ${i.template}. Open details`}
                className="ease-ui grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-0 bg-transparent px-4 py-3.5 text-left text-ink hover:bg-subtle sm:px-6 md:grid-cols-[120px_minmax(0,1fr)_auto_auto]"
              >
                <SeverityBadge sev={i.sev} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-base leading-6 font-medium">{i.title}</span>
                  <span className="text-sm leading-5 text-muted">
                    {i.template} · <span className="font-mono text-[13px]">{i.rule}</span>
                  </span>
                </span>
                <span className="col-start-2 flex items-center gap-2 md:col-start-auto">{i.status === "regressed" && <StatusBadge status="regressed" />}</span>
                <span className="tnum col-start-2 text-sm whitespace-nowrap text-muted md:col-start-auto md:min-w-[110px] md:text-right">
                  {i.occ} {i.occ === 1 ? "occurrence" : "occurrences"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
        <section aria-labelledby="h-fixed" className={`${CARD} flex flex-col gap-3 p-6`}>
          <h2 id="h-fixed" className="m-0 text-xl leading-7 font-semibold">
            Recently fixed
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {fixed.slice(0, 5).map(([title, date]) => (
              <li key={title + date} className="flex items-start gap-2.5 border-b border-line py-2.5 text-sm leading-5">
                <Icon d={I.fixed} size={18} stroke="var(--ok)" className="mt-px flex-none" />
                <span className="flex-1">{title}</span>
                <span className="whitespace-nowrap text-muted">{date}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="h-cov" className={`${CARD} flex flex-col gap-3 p-6`}>
          <h2 id="h-cov" className="m-0 text-xl leading-7 font-semibold">
            Coverage
          </h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] text-sm leading-5">
            {[
              ["Pages checked", "142 of 150"],
              ["Templates found", "7"],
              ["Standard", "WCAG 2.2 AA"],
              ["Next scan", "Mon 19 Oct, 03:00 EAT"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="border-b border-line py-2.5 text-muted">{k}</dt>
                <dd className="tnum m-0 border-b border-line py-2.5 text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 mb-0 text-sm leading-5 text-pretty text-muted">
            Automated tests can&apos;t judge keyboard flow, screen reader experience or whether alt text makes sense. <a href="#">Log a manual check</a>
          </p>
        </section>
      </div>
    </div>
  );
}
