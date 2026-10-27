"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BandBadge } from "@/components/badges";
import { Icon, I } from "@/components/icons";
import { useEntrance } from "@/components/reveal";
import type { SiteRow } from "@/lib/site-data";
import { apiClient, ApiException } from "@/lib/api";
import { appApi, toSiteRow, type ApiCrossSiteIssue } from "@/lib/app-api";

interface OverviewData {
  orgSlug: string;
  sites: SiteRow[];
  commonIssues: ApiCrossSiteIssue[];
}

const OverviewContext = createContext<OverviewData>({ orgSlug: "", sites: [], commonIssues: [] });

function useOverview() {
  const data = useContext(OverviewContext);
  const siteHref = (r: SiteRow) => `/${data.orgSlug}/sites/${r.id}`;
  return { ...data, siteHref };
}

const LAYOUTS = [
  { id: "1a", label: "Worst-first table", hint: "Dense, scannable table with client grouping and persistent filters." },
  { id: "1b", label: "Triage lanes", hint: "Sites sorted into what to do this week." },
  { id: "1c", label: "Grouped by client", hint: "Mirrors how agencies bill." },
] as const;
type LayoutId = (typeof LAYOUTS)[number]["id"];

export type SortKey = "score" | "crit_ser" | "regressions" | "name" | "lastScan";

interface OverviewUserPrefs {
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  clientFilter: string;
  groupByClient: boolean;
  layout: LayoutId;
}

const STORAGE_KEY = "everyvisitor_overview_prefs";

const DEFAULT_PREFS: OverviewUserPrefs = {
  sortKey: "score",
  sortDir: "asc", // worst-first (lowest score first)
  clientFilter: "all",
  groupByClient: false,
  layout: "1a",
};

const CARD = "rounded-2xl border border-line bg-surface shadow-card";
const H1 = "m-0 font-serif text-[36px] leading-10 font-normal sm:text-[42px] sm:leading-[46px]";
const PRIMARY = "ease-ui inline-flex h-10 items-center rounded-full border-0 bg-primary px-4 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary";

const deltaCls = (r: SiteRow) => (r.dir > 0 ? "text-ok" : r.dir < 0 ? "text-crit" : "text-muted");

function Score({ r, size = "text-base" }: { r: SiteRow; size?: string }) {
  return (
    <span className="flex items-center gap-2">
      <strong className={`tnum min-w-6 ${size}`}>{r.score ?? "-"}</strong>
      <BandBadge score={r.score} className="px-1.5 text-[13px]" />
    </span>
  );
}

/* ---------- 1a - Worst-first table with Client Grouping and Persistent Filters ---------- */
function TableLayout({
  prefs,
  onUpdatePrefs,
}: {
  prefs: OverviewUserPrefs;
  onUpdatePrefs: (updater: Partial<OverviewUserPrefs>) => void;
}) {
  const [search, setSearch] = useState("");
  const { orgSlug, sites: SITES, siteHref, commonIssues } = useOverview();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    text: string;
    isError?: boolean;
    downloadUrl?: string;
  } | null>(null);

  const handleExportReport = async () => {
    try {
      setIsExporting(true);
      setExportMessage({ text: "Generating Agency Portfolio Report..." });
      const report = await appApi.generateAgencyOverviewReport(orgSlug, true);
      setExportMessage({ text: "Report ready! Fetching download link..." });
      const dl = await apiClient<{ data: { downloadUrl: string } }>(
        `/v1/orgs/${orgSlug}/reports/${report.id}/download`,
      );
      if (dl.data?.downloadUrl) {
        window.open(dl.data.downloadUrl, "_blank");
        setExportMessage({
          text: "Agency Overview Report downloaded successfully.",
          downloadUrl: dl.data.downloadUrl,
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiException && err.status === 422) {
        setExportMessage({ text: "Agency Overview Reports require an Agency plan.", isError: true });
      } else {
        setExportMessage({ text: "Could not generate report. Please try again later.", isError: true });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const clientsList = useMemo(() => {
    return Array.from(new Set(SITES.map((s) => s.client).filter(Boolean))).sort();
  }, [SITES]);

  const scored = SITES.filter((s) => s.score !== null);
  const withRegressions = SITES.filter((s) => (s.regressions ?? 0) > 0);
  const stats = [
    { label: "Sites monitored", value: String(SITES.length), sub: `${SITES.filter((s) => s.status === "Active").length} active`, c: "text-muted" },
    {
      label: "Average score",
      value: scored.length ? String(Math.round(scored.reduce((a, s) => a + s.score!, 0) / scored.length)) : "-",
      sub: `across ${scored.length} scanned ${scored.length === 1 ? "site" : "sites"}`,
      c: "text-muted",
    },
    { label: "Open critical + serious", value: String(SITES.reduce((a, s) => a + s.crit + s.ser, 0)), sub: "across all sites", c: "text-muted" },
    {
      label: "Sites with regressions",
      value: String(withRegressions.length),
      sub: withRegressions.slice(0, 2).map((s) => s.name).join(", ") || "None",
      c: "text-muted",
    },
  ];

  // Failed scans first, then regressions, then the biggest score drops.
  const attention = [
    ...SITES.filter((s) => s.status === "Error").map((s) => ({ s, why: s.reason || "scan failed" })),
    ...withRegressions.map((s) => ({ s, why: s.reason })),
    ...SITES.filter((s) => s.dir < 0).map((s) => ({ s, why: s.delta.toLowerCase() })),
  ]
    .filter((a, i, all) => all.findIndex((b) => b.s.id === a.s.id) === i)
    .slice(0, 3)
    .map(({ s, why }) => ({ name: s.name, why, href: siteHref(s) }));

  // Filter sites by search and clientFilter
  const filtered = useMemo(() => {
    return SITES.filter((s) => {
      if (prefs.clientFilter !== "all" && s.client !== prefs.clientFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q) ||
          s.client.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [SITES, prefs.clientFilter, search]);

  // Sort sites
  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      let cmp = 0;
      switch (prefs.sortKey) {
        case "score": {
          // Worst-first: lowest score first. Unscored (null) placed at the top as needing attention.
          const aScore = a.score ?? -1;
          const bScore = b.score ?? -1;
          cmp = aScore - bScore;
          break;
        }
        case "crit_ser": {
          const aCount = a.crit + a.ser;
          const bCount = b.crit + b.ser;
          cmp = bCount - aCount; // most problems first
          break;
        }
        case "regressions": {
          cmp = (b.regressions ?? 0) - (a.regressions ?? 0); // most regressions first
          break;
        }
        case "name": {
          cmp = a.name.localeCompare(b.name);
          break;
        }
        case "lastScan": {
          cmp = (b.lastScanAt ?? 0) - (a.lastScanAt ?? 0);
          break;
        }
      }
      return prefs.sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, prefs.sortKey, prefs.sortDir]);

  // Grouped sites by client
  const clientGroups = useMemo(() => {
    if (!prefs.groupByClient) return null;
    const map = new Map<string, SiteRow[]>();
    for (const site of sorted) {
      const list = map.get(site.client) ?? [];
      list.push(site);
      map.set(site.client, list);
    }
    return Array.from(map.entries()).map(([client, sites]) => ({
      client,
      sites,
    }));
  }, [prefs.groupByClient, sorted]);

  const handleHeaderSort = (key: SortKey) => {
    if (prefs.sortKey === key) {
      onUpdatePrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" });
    } else {
      onUpdatePrefs({ sortKey: key, sortDir: key === "score" ? "asc" : "desc" });
    }
  };

  const renderSortIndicator = (key: SortKey) => {
    if (prefs.sortKey !== key) return null;
    return <span aria-hidden="true" className="ml-1 text-primary">{prefs.sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div data-layout className="flex flex-col gap-6">
      {/* Overview Header & Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={H1}>Organisation Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Monitored storefronts sorted worst-first. Track scores, open violations, regressions, and scheduled scans.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportReport}
            disabled={isExporting}
            className="ease-ui inline-flex h-10 items-center rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            <Icon d={I.download} size={15} className="mr-1.5 text-primary" />
            <span>{isExporting ? "Generating report..." : "Export Agency Report"}</span>
          </button>
          <Link href={`/${orgSlug}/sites`} className={PRIMARY}>
            <Icon d={I.plus} size={16} className="mr-1.5" />
            <span>Add site</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`${CARD} flex flex-col gap-1 px-5 py-4`}>
            <span className="text-sm font-medium text-muted">{s.label}</span>
            <span className="tnum font-serif text-[42px] leading-[46px] font-normal text-ink">{s.value}</span>
            <span className={`text-sm ${s.c}`}>{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Needs Attention Alert Banner */}
      {attention.length > 0 && (
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ser bg-ser-soft px-4 py-3 text-ink">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon d={I.serious} size={18} className="text-amber-600 dark:text-amber-400" />
          <span>Needs attention:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {attention.map((a) => (
            <Link key={a.name} href={a.href} className="text-ink font-medium hover:text-primary hover:underline">
              <strong>{a.name}</strong>: <span className="text-muted">{a.why}</span>
            </Link>
          ))}
        </div>
      </div>
      )}

      {/* Report Export Status Toast */}
      {exportMessage && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-semibold ${
            exportMessage.isError
              ? "border-crit/30 bg-crit-soft text-crit"
              : "border-primary/30 bg-primary-soft text-ptext"
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon d={exportMessage.isError ? I.alert : I.check} size={15} />
            <span>{exportMessage.text}</span>
          </div>
          <div className="flex items-center gap-3">
            {exportMessage.downloadUrl && (
              <a
                href={exportMessage.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary font-bold"
              >
                Download PDF
              </a>
            )}
            <button
              type="button"
              onClick={() => setExportMessage(null)}
              className="text-muted hover:text-ink text-sm font-bold"
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Cross-Site View: Most Common Problems Across Sites */}
      {commonIssues.length > 0 && (
        <section aria-labelledby="common-issues-heading" className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 id="common-issues-heading" className="m-0 text-base font-semibold text-ink flex items-center gap-2">
                <Icon d={I.audit} size={18} className="text-primary" />
                <span>Most common problems across sites</span>
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Fix once in a shared theme to resolve across multiple client storefronts.
              </p>
            </div>
            <span className="text-xs font-semibold text-muted bg-subtle px-2.5 py-1 rounded-full">
              {commonIssues.length} shared {commonIssues.length === 1 ? "pattern" : "patterns"}
            </span>
          </div>

          <div className="mt-4 divide-y divide-line">
            {commonIssues.slice(0, 5).map((issue) => (
              <div key={issue.ruleId} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-bold capitalize ${
                        issue.impact === "critical"
                          ? "bg-crit-soft text-crit"
                          : issue.impact === "serious"
                            ? "bg-ser-soft text-ser"
                            : issue.impact === "moderate"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              : "bg-subtle text-muted"
                      }`}
                    >
                      {issue.impact}
                    </span>
                    <span className="text-sm font-semibold text-ink">{issue.title}</span>
                    <code className="text-xs text-muted font-mono">{issue.ruleId}</code>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted">
                    <strong className="text-ink">{issue.affectedSitesCount} stores affected</strong>
                    <span>·</span>
                    <span>{issue.totalOccurrences} total occurrences</span>
                  </div>
                </div>

                {/* Affected sites links */}
                <div className="flex flex-wrap items-center gap-1.5 pl-2 text-xs">
                  <span className="text-muted font-medium mr-1">Affected stores:</span>
                  {issue.sites.map((s) => (
                    <Link
                      key={s.siteId}
                      href={`/${orgSlug}/sites/${s.siteId}/issues?rule=${encodeURIComponent(issue.ruleId)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-subtle/50 px-2 py-0.5 text-ink hover:border-primary hover:text-primary transition-colors no-underline"
                      title={`View ${issue.title} in ${s.siteName}`}
                    >
                      <span className="font-medium">{s.siteName}</span>
                      {s.clientName && <span className="text-muted">({s.clientName})</span>}
                      <span className="rounded bg-surface px-1 text-[11px] font-semibold text-muted">
                        {s.occurrences}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtering and Grouping Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Icon d={I.search} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search sites or URLs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-line bg-subtle/50 py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
            />
          </div>

          {/* Client Filter Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="client-filter-select" className="text-xs font-semibold text-muted">
              Client:
            </label>
            <select
              id="client-filter-select"
              value={prefs.clientFilter}
              onChange={(e) => onUpdatePrefs({ clientFilter: e.target.value })}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            >
              <option value="all">All clients ({SITES.length} sites)</option>
              {clientsList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Group by Client Toggle */}
          <button
            type="button"
            onClick={() => onUpdatePrefs({ groupByClient: !prefs.groupByClient })}
            className={`ease-ui flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              prefs.groupByClient
                ? "border-primary bg-primary-soft text-ptext"
                : "border-line bg-surface text-ink hover:bg-subtle"
            }`}
          >
            <Icon d={I.building} size={14} />
            <span>Group by client</span>
          </button>
        </div>

        {/* Sort selector dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="sort-key-select" className="text-xs font-semibold text-muted">
            Sort by:
          </label>
          <select
            id="sort-key-select"
            value={prefs.sortKey}
            onChange={(e) => onUpdatePrefs({ sortKey: e.target.value as SortKey })}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink focus:border-primary focus:outline-none"
          >
            <option value="score">Score (worst-first)</option>
            <option value="crit_ser">Critical & Serious issues</option>
            <option value="regressions">Regressions count</option>
            <option value="name">Site name (A–Z)</option>
            <option value="lastScan">Last scan date</option>
          </select>
        </div>
      </div>

      {/* Main Sites Table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {clientGroups ? (
          // Grouped by client view
          <div className="divide-y divide-line">
            {clientGroups.map((g) => (
              <div key={g.client} className="p-0">
                <div className="flex items-center justify-between bg-subtle px-4 py-2.5 border-b border-line">
                  <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                    <Icon d={I.building} size={15} className="text-muted" />
                    <span>{g.client}</span>
                  </div>
                  <span className="text-xs font-medium text-muted">
                    {g.sites.length} {g.sites.length === 1 ? "site" : "sites"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm leading-5">
                    <thead>
                      <tr className="border-b border-line bg-surface text-xs font-semibold text-muted">
                        <th scope="col" className="px-4 py-2.5">Site</th>
                        <th scope="col" className="px-4 py-2.5">Score</th>
                        <th scope="col" className="px-4 py-2.5">Critical · Serious</th>
                        <th scope="col" className="px-4 py-2.5">Regressions</th>
                        <th scope="col" className="px-4 py-2.5">Last Scan</th>
                        <th scope="col" className="px-4 py-2.5">Next Scan</th>
                        <th scope="col" className="px-4 py-2.5">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {g.sites.map((r) => (
                        <tr key={r.id} className="hover:bg-subtle/50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={siteHref(r)} className="font-semibold text-ink hover:text-primary no-underline block">
                              {r.name}
                            </Link>
                            <span className="text-xs text-muted">
                              {r.url} · {r.platform}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Score r={r} />
                          </td>
                          <td className="px-4 py-3 tnum text-xs">
                            <span className="font-semibold text-crit">{r.crit} critical</span> ·{" "}
                            <span className="font-semibold text-ser">{r.ser} serious</span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {(r.regressions ?? 0) > 0 ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-crit">
                                <Icon d={I.regressed} size={12} />
                                <span>{r.regressions} regression{r.regressions === 1 ? "" : "s"}</span>
                              </span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">{r.last}</td>
                          <td className="px-4 py-3 text-xs text-muted">{r.nextScan}</td>
                          <td className="px-4 py-3">
                            {r.verified ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-full px-2 py-0.5">
                                <Icon d={I.check} size={12} />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-full px-2 py-0.5">
                                <Icon d={I.alert} size={12} />
                                <span>Pending</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat worst-first table view
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm leading-5">
              <thead>
                <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                  <th
                    scope="col"
                    onClick={() => handleHeaderSort("name")}
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink"
                    aria-sort={prefs.sortKey === "name" ? (prefs.sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span>Site</span>
                    {renderSortIndicator("name")}
                  </th>
                  <th scope="col" className="px-4 py-3">Client</th>
                  <th
                    scope="col"
                    onClick={() => handleHeaderSort("score")}
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink"
                    aria-sort={prefs.sortKey === "score" ? (prefs.sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span>Score (Worst-first)</span>
                    {renderSortIndicator("score")}
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleHeaderSort("crit_ser")}
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink"
                    aria-sort={prefs.sortKey === "crit_ser" ? (prefs.sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span>Critical · Serious</span>
                    {renderSortIndicator("crit_ser")}
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleHeaderSort("regressions")}
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink"
                    aria-sort={prefs.sortKey === "regressions" ? (prefs.sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span>Regressions</span>
                    {renderSortIndicator("regressions")}
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleHeaderSort("lastScan")}
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink"
                    aria-sort={prefs.sortKey === "lastScan" ? (prefs.sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span>Last Scan</span>
                    {renderSortIndicator("lastScan")}
                  </th>
                  <th scope="col" className="px-4 py-3">Next Scan</th>
                  <th scope="col" className="px-4 py-3">Verification</th>
                </tr>
              </thead>
              <tbody data-rows className="divide-y divide-line">
                {sorted.map((r) => (
                  <tr key={r.id} className="hover:bg-subtle/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={siteHref(r)} className="font-semibold text-ink hover:text-primary no-underline block">
                        {r.name}
                      </Link>
                      <span className="text-xs text-muted">
                        {r.url} · {r.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted font-medium">{r.client}</td>
                    <td className="px-4 py-3">
                      <Score r={r} />
                    </td>
                    <td className="px-4 py-3 tnum text-xs">
                      <span className="font-semibold text-crit">{r.crit} critical</span> ·{" "}
                      <span className="font-semibold text-ser">{r.ser} serious</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(r.regressions ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-crit">
                          <Icon d={I.regressed} size={12} />
                          <span>{r.regressions} regression{r.regressions === 1 ? "" : "s"}</span>
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{r.last}</td>
                    <td className="px-4 py-3 text-xs text-muted">{r.nextScan}</td>
                    <td className="px-4 py-3">
                      {r.verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-full px-2 py-0.5">
                          <Icon d={I.check} size={12} />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-full px-2 py-0.5">
                          <Icon d={I.alert} size={12} />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 1b - Triage lanes ---------- */
function LanesLayout() {
  const { sites: SITES, siteHref } = useOverview();
  const lanes = [
    { id: "regressed", title: "Regressions", filter: (s: SiteRow) => (s.regressions ?? 0) > 0 },
    { id: "critical", title: "High priority (< 70)", filter: (s: SiteRow) => s.score !== null && s.score < 70 },
    { id: "good", title: "Stable (≥ 70)", filter: (s: SiteRow) => (s.score ?? 0) >= 70 },
  ];

  return (
    <div data-layout className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={H1}>Overview · Triage Lanes</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {lanes.map((l) => {
          const sitesInLane = SITES.filter(l.filter);
          return (
            <div key={l.id} className={`${CARD} flex flex-col p-4`}>
              <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
                <h2 className="text-sm font-semibold text-ink m-0">{l.title}</h2>
                <span className="text-xs text-muted bg-subtle px-2 py-0.5 rounded-full">{sitesInLane.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {sitesInLane.map((s) => (
                  <Link
                    key={s.id}
                    href={siteHref(s)}
                    className="p-3 rounded-xl border border-line bg-surface hover:bg-subtle/50 no-underline text-ink transition-colors block"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <Score r={s} size="text-sm" />
                    </div>
                    <div className="mt-1 text-xs text-muted flex items-center justify-between">
                      <span>{s.client}</span>
                      <span>{s.crit} crit · {s.ser} ser</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 1c - Grouped by client + common problems ---------- */
function ClientsLayout() {
  const { sites: SITES, siteHref, commonIssues } = useOverview();
  const groups = [...new Set(SITES.map((s) => s.client))].map((c) => ({
    name: c,
    items: SITES.filter((s) => s.client === c),
  }));

  return (
    <div data-layout className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-5">
        <h1 className={H1}>Overview · By Client</h1>
        {groups.map((g) => (
          <section key={g.name} aria-labelledby={`cl-${g.name}`} className={`${CARD} overflow-hidden`}>
            <h2 id={`cl-${g.name}`} className="m-0 flex justify-between bg-subtle px-4 py-3 text-base font-semibold">
              <span>{g.name}</span>
              <span className="text-sm font-normal text-muted">
                {g.items.length} {g.items.length === 1 ? "site" : "sites"}
              </span>
            </h2>
            {g.items.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_120px_180px_110px]"
              >
                <span>
                  <Link href={siteHref(r)} className="font-semibold text-ink no-underline hover:text-primary">
                    {r.name}
                  </Link>
                  <span className="block text-muted text-xs">{r.url} · {r.platform}</span>
                </span>
                <Score r={r} />
                <span className="tnum text-xs">
                  {r.crit} critical · {r.ser} serious
                </span>
                <span className={`text-xs ${deltaCls(r)}`}>{r.delta}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <aside className="flex flex-col gap-4">
        <section className={`${CARD} flex flex-col gap-3 p-5`}>
          <h2 className="m-0 text-xl leading-7 font-semibold">Most common problems</h2>
          <p className="m-0 text-sm leading-5 text-muted">Fix once in a shared theme, help many clients.</p>
          {commonIssues.map((p) => (
            <div key={p.ruleId} className="flex justify-between gap-3 border-t border-line py-2 text-sm text-ink">
              <span>{p.title}</span>
              <span className="whitespace-nowrap text-muted text-xs font-semibold">{p.affectedSitesCount} sites</span>
            </div>
          ))}
        </section>
        <section className={`${CARD} flex flex-col gap-2 p-5`}>
          <h2 className="m-0 text-base font-semibold">This week</h2>
          <span className="text-sm">2 regressions · 31 problems fixed · 1 failed scan</span>
          <Link href="/reports" className="text-sm font-semibold text-primary hover:underline">
            View on-demand reports →
          </Link>
        </section>
      </aside>
    </div>
  );
}

export interface AgencyOverviewProps {
  orgSlug: string;
}

/** Agency overview - with persistent sorting and filtering per user (P2-20). */
export function AgencyOverview({ orgSlug }: AgencyOverviewProps) {
  const router = useRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStoreSingleSite, setIsStoreSingleSite] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient<{ org: { type: "agency" | "store" } }>(`/v1/orgs/${orgSlug}`),
      appApi.listSites(orgSlug),
      appApi.listCrossSiteIssues(orgSlug).catch(() => []),
    ])
      .then(([orgRes, sites, commonIssues]) => {
        if (cancelled) return;
        // Stores with one site go straight to that site's overview.
        if (orgRes.org.type === "store" && sites.length === 1) {
          setIsStoreSingleSite(true);
          router.replace(`/${orgSlug}/sites/${sites[0]!.id}`);
          return;
        }
        setData({ orgSlug, sites: sites.map(toSiteRow), commonIssues });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiException && err.status === 401) {
          router.replace(`/sign-in?redirect=${encodeURIComponent(`/${orgSlug}`)}`);
        }
        else setLoadError(err instanceof ApiException ? err.message : "Could not load the overview.");
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, router]);

  // Load persistent user preferences
  const [prefs, setPrefs] = useState<OverviewUserPrefs>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
        }
      } catch {
        // Fall back to defaults
      }
    }
    return DEFAULT_PREFS;
  });

  const updatePrefs = (updater: Partial<OverviewUserPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updater };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
      }
      return next;
    });
  };

  const scope = useEntrance<HTMLDivElement>([prefs.layout], "[data-layout] > *, [data-rows] > tr");
  const currentLayout = LAYOUTS.find((l) => l.id === prefs.layout) ?? LAYOUTS[0];

  if (loadError) {
    return (
      <AppShell active="overview" crumbs={[{ label: "Overview" }]}>
        <div role="alert" className="p-12 text-center text-sm text-crit">
          {loadError}
        </div>
      </AppShell>
    );
  }

  if (!data || isStoreSingleSite) {
    return (
      <AppShell active="overview" crumbs={[{ label: "Overview" }]}>
        <div role="status" className="p-12 text-center text-sm text-muted">
          {isStoreSingleSite ? "Opening your site…" : "Loading overview…"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="overview" crumbs={[{ label: "Overview" }]}>
      {/* Design layout switch bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-full border border-dashed border-line-strong py-2 pr-4 pl-2 text-sm">
        <div role="radiogroup" aria-label="Design layout option" className="inline-flex gap-1">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={prefs.layout === l.id}
              onClick={() => updatePrefs({ layout: l.id })}
              className={`ease-ui rounded-full border-0 px-3 py-1 font-bold ${
                prefs.layout === l.id ? "bg-primary text-on-primary" : "bg-transparent text-ink hover:bg-subtle"
              }`}
            >
              {l.id}
              <span className="sr-only">: {l.label}</span>
            </button>
          ))}
        </div>
        <span className="font-semibold text-ink">{currentLayout.label}</span>
        <span className="text-muted text-xs sm:text-sm">{currentLayout.hint}</span>
      </div>

      <div ref={scope}>
        <OverviewContext.Provider value={data}>
          {prefs.layout === "1a" && (
            <TableLayout prefs={prefs} onUpdatePrefs={updatePrefs} />
          )}
          {prefs.layout === "1b" && <LanesLayout />}
          {prefs.layout === "1c" && <ClientsLayout />}
        </OverviewContext.Provider>
      </div>
    </AppShell>
  );
}
