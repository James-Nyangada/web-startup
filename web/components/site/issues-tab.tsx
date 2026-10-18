"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { Collapse } from "@/components/disclosure";
import { SEV, SEVERITIES, type Severity } from "@/lib/severity";
import { NAMES, type Issue, type IssueStatus } from "@/lib/site-data";
import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";

const PILL =
  "ease-ui inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary";
const SECONDARY_SM =
  "ease-ui h-8 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle focus-visible:ring-2 focus-visible:ring-primary";

export type GroupBy = "rule" | "template" | "flat";
export type SortBy = "impact" | "occurrences" | "firstSeen" | "lastSeen";

export interface IssuesTabProps {
  active: Issue[];
  selected: string[];
  setSelected: (fn: (s: string[]) => string[]) => void;
  onOpen: (id: string) => void;
  onRecheckSelected: () => void;
  serverTotal?: number;
}

const STORAGE_VIEW_KEY = "plainsight_issues_default_view";

interface SavedView {
  groupBy: GroupBy;
  sortBy: SortBy;
  status: string;
  pageSize: number;
}

export function IssuesTab({
  active,
  selected,
  setSelected,
  onOpen,
  onRecheckSelected,
}: IssuesTabProps) {
  // Filter states
  const [search, setSearch] = useState("");
  const [sevF, setSevF] = useState<Severity[]>([]);
  const [statusF, setStatusF] = useState<string>("active");
  const [templateF, setTemplateF] = useState<string>("all");
  const [wcagF, setWcagF] = useState<string>("all");
  const [assigneeF, setAssigneeF] = useState<string>("all");
  const [regressionOnly, setRegressionOnly] = useState<boolean>(false);
  const [needsReviewOnly, setNeedsReviewOnly] = useState<boolean>(false);

  // Grouping & Sorting
  const [groupBy, setGroupBy] = useState<GroupBy>("rule");
  const [sortBy, setSortBy] = useState<SortBy>("impact");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Collapsed groups state
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [viewSavedToast, setViewSavedToast] = useState<string | null>(null);

  const scope = useRef<HTMLDivElement>(null);
  const initialMount = useRef<boolean>(true);

  // Extract unique filter options from the dataset
  const allTemplates = useMemo(
    () => Array.from(new Set(active.map((i) => i.template).filter(Boolean))).sort(),
    [active],
  );
  const allWcag = useMemo(
    () => Array.from(new Set(active.map((i) => i.wcag).filter(Boolean))).sort(),
    [active],
  );

  // 1. Sync filters with URL query parameters on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const qParam = params.get("q");
    if (qParam) setSearch(qParam);

    const sevParam = params.get("sev");
    if (sevParam) {
      const sevs = sevParam.split(",").filter((s): s is Severity => SEVERITIES.includes(s as Severity));
      if (sevs.length > 0) setSevF(sevs);
    }

    const statusParam = params.get("status");
    if (statusParam) setStatusF(statusParam);

    const tmplParam = params.get("template");
    if (tmplParam) setTemplateF(tmplParam);

    const wcagParam = params.get("wcag");
    if (wcagParam) setWcagF(wcagParam);

    const groupParam = params.get("group");
    if (groupParam === "rule" || groupParam === "template" || groupParam === "flat") {
      setGroupBy(groupParam);
    }

    const sortParam = params.get("sort");
    if (sortParam === "impact" || sortParam === "occurrences" || sortParam === "firstSeen" || sortParam === "lastSeen") {
      setSortBy(sortParam);
    }

    const pageParam = params.get("page");
    if (pageParam) setPage(Math.max(1, parseInt(pageParam, 10) || 1));

    // Also check for saved default view if no URL params were specified
    if (!window.location.search) {
      try {
        const savedRaw = localStorage.getItem(STORAGE_VIEW_KEY);
        if (savedRaw) {
          const saved: SavedView = JSON.parse(savedRaw);
          if (saved.groupBy) setGroupBy(saved.groupBy);
          if (saved.sortBy) setSortBy(saved.sortBy);
          if (saved.status) setStatusF(saved.status);
          if (saved.pageSize) setPageSize(saved.pageSize);
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  // 2. Sync filter state to URL query parameters on changes
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    if (search.trim()) params.set("q", search.trim());
    else params.delete("q");

    if (sevF.length > 0) params.set("sev", sevF.join(","));
    else params.delete("sev");

    if (statusF !== "active") params.set("status", statusF);
    else params.delete("status");

    if (templateF !== "all") params.set("template", templateF);
    else params.delete("template");

    if (wcagF !== "all") params.set("wcag", wcagF);
    else params.delete("wcag");

    if (groupBy !== "rule") params.set("group", groupBy);
    else params.delete("group");

    if (sortBy !== "impact") params.set("sort", sortBy);
    else params.delete("sort");

    if (page > 1) params.set("page", String(page));
    else params.delete("page");

    const queryStr = params.toString();
    const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [search, sevF, statusF, templateF, wcagF, groupBy, sortBy, page]);

  // Filtering logic
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return active.filter((i) => {
      // Search
      if (q && !`${i.title} ${i.rule} ${i.template} ${i.wcag}`.toLowerCase().includes(q)) {
        return false;
      }
      // Severity
      if (sevF.length > 0 && !sevF.includes(i.sev)) {
        return false;
      }
      // Status
      if (statusF === "active") {
        if (i.status === "fixed" || i.status === "ignored") return false;
      } else if (statusF !== "all" && i.status !== statusF) {
        return false;
      }
      // Template
      if (templateF !== "all" && i.template !== templateF) {
        return false;
      }
      // WCAG
      if (wcagF !== "all" && i.wcag !== wcagF) {
        return false;
      }
      // Assignee
      if (assigneeF === "unassigned") {
        if (i.assignee) return false;
      } else if (assigneeF !== "all" && i.assignee !== assigneeF) {
        return false;
      }
      // Flags
      if (regressionOnly && i.status !== "regressed") {
        return false;
      }
      if (needsReviewOnly && i.status !== "needsReview") {
        return false;
      }
      return true;
    });
  }, [active, q, sevF, statusF, templateF, wcagF, assigneeF, regressionOnly, needsReviewOnly]);

  // Sorting logic
  const sorted = useMemo(() => {
    const list = [...filtered];
    return list.sort((a, b) => {
      let diff = 0;
      if (sortBy === "impact") {
        diff = SEV[b.sev].weight - SEV[a.sev].weight;
        if (diff === 0) diff = b.occ - a.occ;
      } else if (sortBy === "occurrences") {
        diff = b.occ - a.occ;
      } else if (sortBy === "firstSeen") {
        diff = a.first.localeCompare(b.first);
      } else if (sortBy === "lastSeen") {
        diff = b.last.localeCompare(a.last);
      }
      return sortOrder === "asc" ? -diff : diff;
    });
  }, [filtered, sortBy, sortOrder]);

  // Pagination calculations (Handles up to 2,000+ issues with server/client pagination smoothly)
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  // Grouping structure
  const groupedData = useMemo(() => {
    if (groupBy === "flat") return [];

    const map = new Map<string, Issue[]>();
    for (const item of paginatedItems) {
      const key = groupBy === "rule" ? item.rule : item.template;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }

    return Array.from(map.entries()).map(([key, items]) => {
      const first = items[0];
      return {
        key,
        title: groupBy === "rule" ? first.title : key,
        subtitle: groupBy === "rule" ? key : `${items.length} ${items.length === 1 ? "rule" : "rules"}`,
        sev: first.sev,
        occ: items.reduce((acc, curr) => acc + curr.occ, 0),
        items,
      };
    });
  }, [paginatedItems, groupBy]);

  // GSAP animations for group items
  const filterKey = `${sevF.join(",")}|${statusF}|${templateF}|${q}|${groupBy}|${currentPage}`;
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          "[data-issue-row]",
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.25, ease: "power2.out", stagger: 0.02, clearProps: "transform" },
        );
      });
      return () => mm.revert();
    },
    { scope, dependencies: [filterKey] },
  );

  // Bulk bar animation
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

  const clearAll = useCallback(() => {
    setSearch("");
    setSevF([]);
    setStatusF("active");
    setTemplateF("all");
    setWcagF("all");
    setAssigneeF("all");
    setRegressionOnly(false);
    setNeedsReviewOnly(false);
    setPage(1);
  }, []);

  const saveDefaultView = useCallback(() => {
    const view: SavedView = {
      groupBy,
      sortBy,
      status: statusF,
      pageSize,
    };
    try {
      localStorage.setItem(STORAGE_VIEW_KEY, JSON.stringify(view));
      setViewSavedToast("Default view saved. This layout will be loaded on your visits.");
      setTimeout(() => setViewSavedToast(null), 4000);
    } catch {
      // Ignore
    }
  }, [groupBy, sortBy, statusF, pageSize]);

  // Toggle selection for all visible items on this page
  const selectAllVisible = useCallback(() => {
    const visibleIds = paginatedItems.map((i) => i.id);
    const allSelected = visibleIds.every((id) => selected.includes(id));
    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }, [paginatedItems, selected, setSelected]);

  // Toggle selection for a group
  const selectGroup = useCallback(
    (groupItems: Issue[]) => {
      const groupIds = groupItems.map((i) => i.id);
      const allSelected = groupIds.every((id) => selected.includes(id));
      if (allSelected) {
        setSelected((prev) => prev.filter((id) => !groupIds.includes(id)));
      } else {
        setSelected((prev) => Array.from(new Set([...prev, ...groupIds])));
      }
    },
    [selected, setSelected],
  );

  return (
    <div ref={scope} className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-2xl leading-8 font-semibold">
          Issues{" "}
          <span className="tnum text-base font-normal text-muted">
            {totalItems} open · {filtered.reduce((a, b) => a + b.occ, 0)} occurrences
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveDefaultView}
            title="Save current layout, grouping, and sort as default view"
            className="ease-ui h-9 rounded-full border border-line-strong bg-surface px-3.5 text-xs font-semibold text-muted hover:text-ink hover:bg-subtle"
          >
            Save default view
          </button>
          <button
            type="button"
            className="ease-ui h-9 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle"
          >
            Export CSV
          </button>
        </div>
      </div>

      {viewSavedToast && (
        <div role="status" className="rounded-lg border border-ok/40 bg-ok-soft p-3 text-sm text-ok">
          {viewSavedToast}
        </div>
      )}

      {/* Screen reader live announcement for filter changes (Spec P2-12 acceptance criterion) */}
      <div role="status" aria-live="polite" className="sr-only">
        {totalItems === 0
          ? "No issues match these filters."
          : `Showing ${paginatedItems.length} of ${totalItems} issues matching current filters.`}
      </div>

      {/* Primary filter toolbar */}
      <div role="search" className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-subtle p-3.5">
        <label className="flex h-9 max-w-[320px] flex-[1_1_220px] items-center gap-2 rounded border border-line-strong bg-surface px-3">
          <Icon d={I.search} stroke="var(--muted)" />
          <span className="sr-only">Search issues</span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by problem, rule, or template"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="text-muted hover:text-ink"
            >
              <Icon d={I.close} size={14} />
            </button>
          )}
        </label>

        {/* Severity filter pills */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by severity">
          <span className="mr-0.5 ml-2 text-xs font-medium text-muted">Severity:</span>
          {SEVERITIES.map((k) => {
            const on = sevF.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setSevF((s) => (on ? s.filter((x) => x !== k) : [...s, k]));
                  setPage(1);
                }}
                className={`${PILL} ${
                  on
                    ? "border-primary bg-primary-soft text-ptext font-semibold"
                    : "border-line-strong bg-surface text-ink hover:bg-subtle"
                }`}
              >
                {on && <Icon d={I.check} size={14} strokeWidth={2.5} />}
                {SEV[k].label}
              </button>
            );
          })}
        </div>

        {/* Status filter dropdown */}
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusF}
            onChange={(e) => {
              setStatusF(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="h-8 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink outline-none hover:bg-subtle"
          >
            <option value="active">Status: Open & Regressed</option>
            <option value="open">Status: Open only</option>
            <option value="regressed">Status: Regressed only</option>
            <option value="needsReview">Status: Needs review</option>
            <option value="fixed">Status: Fixed</option>
            <option value="ignored">Status: Ignored</option>
            <option value="all">Status: All issues</option>
          </select>
        </label>

        {/* Template filter */}
        {allTemplates.length > 0 && (
          <label className="flex items-center gap-1 text-sm">
            <span className="sr-only">Filter by template</span>
            <select
              value={templateF}
              onChange={(e) => {
                setTemplateF(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by template"
              className="h-8 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink outline-none hover:bg-subtle"
            >
              <option value="all">Template: All</option>
              {allTemplates.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* WCAG criterion filter */}
        {allWcag.length > 0 && (
          <label className="flex items-center gap-1 text-sm">
            <span className="sr-only">Filter by WCAG criterion</span>
            <select
              value={wcagF}
              onChange={(e) => {
                setWcagF(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by WCAG criterion"
              className="h-8 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink outline-none hover:bg-subtle"
            >
              <option value="all">WCAG: All criteria</option>
              {allWcag.map((w) => (
                <option key={w} value={w}>
                  WCAG {w}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Assignee filter */}
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">Filter by assignee</span>
          <select
            value={assigneeF}
            onChange={(e) => {
              setAssigneeF(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by assignee"
            className="h-8 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink outline-none hover:bg-subtle"
          >
            <option value="all">Assignee: All</option>
            <option value="unassigned">Unassigned</option>
            {Object.entries(NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>

        {/* Clear all filters */}
        <button
          type="button"
          onClick={clearAll}
          className="h-8 border-0 bg-transparent px-2 text-sm font-semibold text-ptext underline underline-offset-2 hover:text-ink"
        >
          Clear all
        </button>

        <span className="tnum ml-auto text-sm text-muted">
          Showing {paginatedItems.length} of {totalItems} issues
        </span>
      </div>

      {/* Secondary layout toolbar (Grouping & Sorting) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
        {/* Grouping toggles */}
        <div className="flex items-center gap-2" role="group" aria-label="Group issues">
          <span className="text-xs font-medium text-muted">Group:</span>
          {[
            { id: "rule" as const, label: "By rule" },
            { id: "template" as const, label: "By template" },
            { id: "flat" as const, label: "Flat" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={groupBy === opt.id}
              onClick={() => setGroupBy(opt.id)}
              className={`ease-ui h-7.5 rounded-full px-3 text-xs font-semibold ${
                groupBy === opt.id
                  ? "bg-primary text-on-primary shadow-sm"
                  : "border border-line-strong bg-surface text-ink hover:bg-subtle"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sorting controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="Sort issues by"
            className="h-7.5 rounded border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink outline-none"
          >
            <option value="impact">Severity (Critical first)</option>
            <option value="occurrences">Occurrences (Most first)</option>
            <option value="firstSeen">First seen</option>
            <option value="lastSeen">Last seen</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
            title={sortOrder === "asc" ? "Ascending order" : "Descending order"}
            aria-label={`Sort order: currently ${sortOrder === "asc" ? "ascending" : "descending"}. Click to toggle.`}
            className="ease-ui grid size-7.5 place-items-center rounded border border-line-strong bg-surface text-ink hover:bg-subtle"
          >
            <Icon d={sortOrder === "asc" ? I.arrowUpRight : I.arrowDownRight} size={14} />
          </button>
        </div>
      </div>

      {/* Bulk selection action bar */}
      {hasSel && (
        <div
          data-bulk
          className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-primary-soft py-2.5 pr-4 pl-4 shadow-lg md:static"
        >
          <input
            type="checkbox"
            checked={paginatedItems.length > 0 && paginatedItems.every((i) => selected.includes(i.id))}
            onChange={selectAllVisible}
            aria-label="Select all visible issues"
            className="size-[18px] accent-ptext"
          />
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
          <button
            type="button"
            onClick={() => setSelected(() => [])}
            className="h-8 border-0 bg-transparent px-2 text-sm font-semibold text-ptext hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Empty State */}
      {totalItems === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <h3 className="m-0 text-xl leading-7 font-semibold">No issues match these filters</h3>
          <p className="m-0 text-sm text-muted">Try removing a filter or changing your search terms.</p>
          <button
            type="button"
            onClick={clearAll}
            className="ease-ui mt-3 h-10 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-subtle"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Grouped View (By Rule or By Template) */}
      {groupBy !== "flat" && groupedData.length > 0 && (
        <div className="flex flex-col gap-4">
          {groupedData.map((g) => {
            const exp = !collapsed.includes(g.key);
            const allGroupSelected = g.items.every((i) => selected.includes(i.id));

            return (
              <section
                key={g.key}
                data-group
                className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
              >
                <div className="flex items-center gap-3 border-0 bg-subtle px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    onChange={() => selectGroup(g.items)}
                    aria-label={`Select all issues in ${g.title}`}
                    className="size-[18px] accent-ptext"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((c) => (exp ? [...c, g.key] : c.filter((x) => x !== g.key)))
                    }
                    aria-expanded={exp}
                    className="flex flex-1 flex-wrap items-center gap-3 border-0 bg-transparent p-0 text-left text-base leading-6 font-semibold text-ink"
                  >
                    <Icon
                      d={I.chevronRight}
                      strokeWidth={2}
                      className={`transition-transform duration-200 ease-out ${exp ? "rotate-90" : ""}`}
                    />
                    <SeverityBadge sev={g.sev} />
                    <span className="min-w-[160px] flex-1">{g.title}</span>
                    <span className="font-mono text-[13px] font-normal text-muted">{g.subtitle}</span>
                    <span className="tnum text-sm font-normal text-muted md:min-w-[170px] md:text-right">
                      {g.items.length} {g.items.length === 1 ? "issue" : "issues"} · {g.occ} occurrences
                    </span>
                  </button>
                </div>

                <Collapse open={exp}>
                  <ul className="m-0 list-none p-0">
                    {g.items.map((i) => {
                      const sel = selected.includes(i.id);
                      return (
                        <li
                          key={i.id}
                          data-issue-row
                          className={`ease-ui grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 md:grid-cols-[24px_minmax(0,1fr)_auto_auto_auto] ${
                            sel ? "bg-primary-soft" : "hover:bg-subtle/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() =>
                              setSelected((s) => (sel ? s.filter((x) => x !== i.id) : [...s, i.id]))
                            }
                            aria-label={`Select issue: ${i.title}, ${i.template}`}
                            className="m-0 size-[18px] accent-ptext"
                          />
                          <button
                            type="button"
                            onClick={() => onOpen(i.id)}
                            className="flex min-w-0 flex-col items-start gap-0.5 border-0 bg-transparent px-0 py-1 text-left text-ink"
                          >
                            <span className="text-base leading-6 font-medium underline decoration-line underline-offset-4 hover:decoration-ink">
                              {groupBy === "rule" ? i.template : i.title}
                            </span>
                            <span className="text-sm leading-5 text-muted">
                              {groupBy === "rule"
                                ? `${i.pages} ${i.pages === 1 ? "page" : "pages"}`
                                : `Template: ${i.template} · ${i.rule}`}
                            </span>
                          </button>
                          <span className="col-start-2 flex gap-2 md:col-start-auto">
                            {i.status === "regressed" && <StatusBadge status="regressed" />}
                            {i.status === "needsReview" && <StatusBadge status="needsReview" />}
                            {i.status === "fixed" && <StatusBadge status="fixed" />}
                            {i.status === "ignored" && <StatusBadge status="ignored" />}
                          </span>
                          <span className="tnum col-start-2 text-sm whitespace-nowrap text-muted md:col-start-auto">
                            {i.occ} {i.occ === 1 ? "occurrence" : "occurrences"}
                          </span>
                          <span className="col-start-2 flex items-center gap-2 text-sm text-muted md:col-start-auto md:min-w-24 md:justify-end">
                            {i.assignee ? (
                              <>
                                <span>{i.due}</span>
                                <span
                                  title={NAMES[i.assignee as keyof typeof NAMES] ?? i.assignee}
                                  className="grid size-7 place-items-center rounded-full border border-line bg-sunk text-[11px] font-semibold text-ink"
                                >
                                  <span aria-hidden="true">{i.assignee}</span>
                                  <span className="sr-only">
                                    Assigned to {NAMES[i.assignee as keyof typeof NAMES] ?? i.assignee}
                                  </span>
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
      )}

      {/* Flat View */}
      {groupBy === "flat" && paginatedItems.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <ul className="m-0 list-none p-0">
            {paginatedItems.map((i) => {
              const sel = selected.includes(i.id);
              return (
                <li
                  key={i.id}
                  data-issue-row
                  className={`ease-ui grid grid-cols-[24px_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 last:border-b-0 md:grid-cols-[24px_110px_minmax(0,1fr)_auto_auto_auto] ${
                    sel ? "bg-primary-soft" : "hover:bg-subtle/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() =>
                      setSelected((s) => (sel ? s.filter((x) => x !== i.id) : [...s, i.id]))
                    }
                    aria-label={`Select issue: ${i.title}, ${i.template}`}
                    className="m-0 size-[18px] accent-ptext"
                  />
                  <SeverityBadge sev={i.sev} />
                  <button
                    type="button"
                    onClick={() => onOpen(i.id)}
                    className="flex min-w-0 flex-col items-start gap-0.5 border-0 bg-transparent px-0 py-1 text-left text-ink"
                  >
                    <span className="text-base leading-6 font-medium underline decoration-line underline-offset-4 hover:decoration-ink">
                      {i.title}
                    </span>
                    <span className="text-sm leading-5 text-muted">
                      {i.template} · <span className="font-mono text-[13px]">{i.rule}</span>
                    </span>
                  </button>
                  <span className="col-start-3 flex gap-2 md:col-start-auto">
                    {i.status === "regressed" && <StatusBadge status="regressed" />}
                    {i.status === "needsReview" && <StatusBadge status="needsReview" />}
                    {i.status === "fixed" && <StatusBadge status="fixed" />}
                    {i.status === "ignored" && <StatusBadge status="ignored" />}
                  </span>
                  <span className="tnum col-start-3 text-sm whitespace-nowrap text-muted md:col-start-auto">
                    {i.occ} {i.occ === 1 ? "occurrence" : "occurrences"}
                  </span>
                  <span className="col-start-3 flex items-center gap-2 text-sm text-muted md:col-start-auto md:min-w-24 md:justify-end">
                    {i.assignee ? (
                      <>
                        <span>{i.due}</span>
                        <span
                          title={NAMES[i.assignee as keyof typeof NAMES] ?? i.assignee}
                          className="grid size-7 place-items-center rounded-full border border-line bg-sunk text-[11px] font-semibold text-ink"
                        >
                          <span aria-hidden="true">{i.assignee}</span>
                          <span className="sr-only">
                            Assigned to {NAMES[i.assignee as keyof typeof NAMES] ?? i.assignee}
                          </span>
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
        </div>
      )}

      {/* Pagination controls (Server & Client support up to 2,000+ items) */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <span className="tnum text-sm text-muted">
            Page {currentPage} of {totalPages} ({totalItems} total issues)
          </span>
          <div className="flex items-center gap-1.5" role="navigation" aria-label="Pagination">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              className="ease-ui flex h-8 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-40 disabled:hover:bg-surface"
            >
              <Icon d={I.chevronLeft} size={14} />
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
              let pageNum: number;
              if (totalPages <= 5) pageNum = idx + 1;
              else if (currentPage <= 3) pageNum = idx + 1;
              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + idx;
              else pageNum = currentPage - 2 + idx;

              return (
                <button
                  key={pageNum}
                  type="button"
                  aria-current={currentPage === pageNum ? "page" : undefined}
                  onClick={() => setPage(pageNum)}
                  className={`ease-ui size-8 rounded-full text-xs font-semibold ${
                    currentPage === pageNum
                      ? "bg-primary text-on-primary"
                      : "border border-line-strong bg-surface text-ink hover:bg-subtle"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
              className="ease-ui flex h-8 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-40 disabled:hover:bg-surface"
            >
              Next
              <Icon d={I.chevronRight} size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
