"use client";

import { useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { Collapse } from "@/components/disclosure";
import { SEV, SEVERITIES, type Severity } from "@/lib/severity";
import { NAMES, type Issue } from "@/lib/site-data";
import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";

const PILL = "ease-ui inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium";
const SECONDARY_SM = "ease-ui h-8 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle";

export function IssuesTab({
  active,
  selected,
  setSelected,
  onOpen,
  onRecheckSelected,
}: {
  active: Issue[];
  selected: string[];
  setSelected: (fn: (s: string[]) => string[]) => void;
  onOpen: (id: string) => void;
  onRecheckSelected: () => void;
}) {
  const [sevF, setSevF] = useState<Severity[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const scope = useRef<HTMLDivElement>(null);

  const q = search.trim().toLowerCase();
  const filt = active.filter(
    (i) => (!sevF.length || sevF.includes(i.sev)) && (!q || `${i.title} ${i.rule} ${i.template}`.toLowerCase().includes(q)),
  );
  const byRule = new Map<string, Issue[]>();
  filt.forEach((i) => byRule.set(i.rule, [...(byRule.get(i.rule) ?? []), i]));
  const groups = [...byRule.entries()]
    .map(([rule, items]) => ({ rule, items, sev: items[0].sev, occ: items.reduce((a, b) => a + b.occ, 0) }))
    .sort((a, b) => SEV[b.sev].weight - SEV[a.sev].weight);

  const filterKey = `${sevF.join(",")}|${q}`;
  // Re-flow the group list with a quick stagger whenever filters change.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo("[data-group]", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out", stagger: 0.04, clearProps: "transform" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [filterKey] },
  );

  // Bulk bar slides in when the first issue is selected.
  const hasSel = selected.length > 0;
  useGSAP(
    () => {
      if (!hasSel) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo("[data-bulk]", { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [hasSel] },
  );

  const clearAll = () => {
    setSevF([]);
    setSearch("");
  };

  return (
    <div ref={scope} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-2xl leading-8 font-semibold">
          Issues{" "}
          <span className="tnum text-base font-normal text-muted">
            {active.length} open · {active.reduce((a, b) => a + b.occ, 0)} occurrences
          </span>
        </h2>
        <button type="button" className="ease-ui h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle">
          Export CSV
        </button>
      </div>

      <div role="search" className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-subtle p-3">
        <label className="flex h-9 max-w-[340px] flex-[1_1_240px] items-center gap-2 rounded border border-line-strong bg-surface px-3">
          <Icon d={I.search} stroke="var(--muted)" />
          <span className="sr-only">Search issues</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by problem or rule"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        <span className="mr-1 ml-2 text-sm text-muted">Severity</span>
        {SEVERITIES.map((k) => {
          const on = sevF.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setSevF((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}
              className={`${PILL} ${on ? "border-primary bg-primary-soft text-ptext" : "border-line-strong bg-surface text-ink hover:bg-subtle"}`}
            >
              {on && <Icon d={I.check} size={14} strokeWidth={2.5} />}
              {SEV[k].label}
            </button>
          );
        })}
        {["Status: Open", "Template", "More"].map((l) => (
          <button key={l} type="button" className={`${PILL} border-line-strong bg-surface text-ink hover:bg-subtle`}>
            {l}
          </button>
        ))}
        <button type="button" onClick={clearAll} className="h-8 border-0 bg-transparent px-2 text-sm font-semibold text-ptext underline underline-offset-2">
          Clear all
        </button>
        <span role="status" aria-live="polite" className="tnum ml-auto text-sm text-muted">
          Showing {filt.length} of {active.length} issues
        </span>
      </div>

      {hasSel && (
        <div data-bulk className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-primary bg-primary-soft py-2 pr-3 pl-4 md:static">
          <span role="status" aria-live="polite" className="flex-1 text-sm font-semibold text-ptext">
            {selected.length} {selected.length === 1 ? "issue" : "issues"} selected
          </span>
          <button type="button" className={SECONDARY_SM}>
            Assign
          </button>
          <button type="button" className={SECONDARY_SM}>
            Set due date
          </button>
          <button type="button" onClick={onRecheckSelected} className={SECONDARY_SM}>
            Recheck selected
          </button>
          <button type="button" onClick={() => setSelected(() => [])} className="h-8 border-0 bg-transparent px-2 text-sm font-semibold text-ptext">
            Clear selection
          </button>
        </div>
      )}

      {filt.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
          <h3 className="m-0 text-xl leading-7 font-semibold">No issues match these filters</h3>
          <p className="m-0 text-sm text-muted">Try another search or remove a filter.</p>
          <button type="button" onClick={clearAll} className="ease-ui mt-2 h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle">
            Clear filters
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const exp = !collapsed.includes(g.rule);
          return (
            <section key={g.rule} data-group className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <h3 className="m-0">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => (exp ? [...c, g.rule] : c.filter((x) => x !== g.rule)))}
                  aria-expanded={exp}
                  className="flex w-full flex-wrap items-center gap-3 border-0 bg-subtle px-4 py-3 text-left text-base leading-6 font-semibold text-ink"
                >
                  <Icon d={I.chevronRight} strokeWidth={2} className={`transition-transform duration-200 ease-out ${exp ? "rotate-90" : ""}`} />
                  <SeverityBadge sev={g.sev} />
                  <span className="min-w-[160px] flex-1">{g.items[0].title}</span>
                  <span className="font-mono text-[13px] font-normal text-muted">{g.rule}</span>
                  <span className="tnum text-sm font-normal text-muted md:min-w-[170px] md:text-right">
                    {g.items.length} {g.items.length === 1 ? "issue" : "issues"} · {g.occ} occurrences
                  </span>
                </button>
              </h3>
              <Collapse open={exp}>
                <ul className="m-0 list-none p-0">
                  {g.items.map((i) => {
                    const sel = selected.includes(i.id);
                    return (
                      <li
                        key={i.id}
                        className={`ease-ui grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 md:grid-cols-[24px_minmax(0,1fr)_auto_auto_auto] ${
                          sel ? "bg-primary-soft" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => setSelected((s) => (sel ? s.filter((x) => x !== i.id) : [...s, i.id]))}
                          aria-label={`Select issue: ${i.title}, ${i.template}`}
                          className="m-0 size-[18px] accent-ptext"
                        />
                        <button
                          type="button"
                          onClick={() => onOpen(i.id)}
                          className="flex min-w-0 flex-col items-start gap-0.5 border-0 bg-transparent px-0 py-1 text-left text-ink"
                        >
                          <span className="text-base leading-6 font-medium underline decoration-line underline-offset-4 hover:decoration-ink">{i.template}</span>
                          <span className="text-sm leading-5 text-muted">
                            {i.pages} {i.pages === 1 ? "page" : "pages"}
                          </span>
                        </button>
                        <span className="col-start-2 flex gap-2 md:col-start-auto">
                          {i.status === "regressed" && <StatusBadge status="regressed" />}
                          {i.status === "needsReview" && <StatusBadge status="needsReview" />}
                        </span>
                        <span className="tnum col-start-2 text-sm whitespace-nowrap text-muted md:col-start-auto">
                          {i.occ} {i.occ === 1 ? "occurrence" : "occurrences"}
                        </span>
                        <span className="col-start-2 flex items-center gap-2 text-sm text-muted md:col-start-auto md:min-w-24 md:justify-end">
                          {i.assignee ? (
                            <>
                              <span>{i.due}</span>
                              <span
                                title={NAMES[i.assignee]}
                                className="grid size-7 place-items-center rounded-full border border-line bg-sunk text-[11px] font-semibold text-ink"
                              >
                                <span aria-hidden="true">{i.assignee}</span>
                                <span className="sr-only">Assigned to {NAMES[i.assignee]}</span>
                              </span>
                            </>
                          ) : (
                            <span>Unassigned</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Collapse>
            </section>
          );
        })}
      </div>
    </div>
  );
}
