"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { BandBadge } from "@/components/badges";
import type { SiteRow } from "@/lib/site-data";
import { ApiException, apiClient } from "@/lib/api";
import { appApi, toSiteRow, type ApiSite } from "@/lib/app-api";
import { AddSiteDialog } from "./add-site-dialog";
import { useToast } from "@/components/shell/toast-context";

/** S-21 Sites list with S-22 Add site dialog. */
export function SitesList({ orgSlug }: { orgSlug: string }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [sites, setSites] = useState<ApiSite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "name" | "lastScan" | "openCritical">("score");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    appApi
      .listSites(orgSlug)
      .then((list) => {
        setSites(list);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiException ? err.message : "Could not load your sites."),
      );
  }, [orgSlug]);

  useEffect(load, [load]);

  const siteRows = useMemo(() => (sites ?? []).map(toSiteRow), [sites]);
  const lastScanAt = useMemo(
    () => new Map((sites ?? []).map((s) => [s.id, s.lastScanAt ? new Date(s.lastScanAt).getTime() : 0])),
    [sites],
  );

  // Extract unique platforms and clients for filter dropdowns
  const platforms = useMemo(() => {
    return Array.from(new Set(siteRows.map((s) => s.platform))).filter(Boolean);
  }, [siteRows]);
  const clients = useMemo(() => {
    return Array.from(new Set(siteRows.map((s) => s.client))).filter(Boolean).sort();
  }, [siteRows]);

  const errorText = (err: unknown, fallback: string) =>
    err instanceof ApiException ? err.message : fallback;

  const handlePauseResume = async (site: SiteRow) => {
    setActionMenuOpen(null);
    const resume = site.status === "Paused";
    try {
      await apiClient(`/v1/orgs/${orgSlug}/sites/${site.id}/${resume ? "resume" : "pause"}`, {
        method: "POST",
        body: "{}",
      });
      showToast(`${site.name} is now ${resume ? "active" : "paused"}.`);
      load();
    } catch (err) {
      showToast(errorText(err, "Could not change the scan schedule."), { type: "error" });
    }
  };

  const handleRemoveSite = async (site: SiteRow) => {
    setActionMenuOpen(null);
    if (!window.confirm(`Remove ${site.name}? Its history is kept for 30 days.`)) return;
    try {
      await apiClient(`/v1/orgs/${orgSlug}/sites/${site.id}`, { method: "DELETE" });
      showToast(`Removed ${site.name}.`, { type: "info" });
      load();
    } catch (err) {
      showToast(errorText(err, "Could not remove the site."), { type: "error" });
    }
  };

  const handleScanNow = async (site: SiteRow) => {
    setActionMenuOpen(null);
    try {
      const scan = await appApi.startScan(orgSlug, site.id!);
      router.push(`/${orgSlug}/sites/${site.id}/scans/${scan.id}`);
    } catch (err) {
      showToast(errorText(err, "Could not start a scan."), { type: "error" });
    }
  };

  // Filter and sort sites
  const filteredSites = useMemo(() => {
    return siteRows
      .filter((s) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches =
            s.name.toLowerCase().includes(q) ||
            s.url.toLowerCase().includes(q) ||
            s.client.toLowerCase().includes(q);
          if (!matches) return false;
        }

        // Status filter
        if (statusFilter !== "all") {
          if (statusFilter === "active" && s.status !== "Active") return false;
          if (statusFilter === "paused" && s.status !== "Paused") return false;
          if (statusFilter === "error" && s.status !== "Error") return false;
        }

        // Platform filter
        if (platformFilter !== "all" && s.platform.toLowerCase() !== platformFilter.toLowerCase()) {
          return false;
        }

        if (clientFilter !== "all" && s.client !== clientFilter) return false;

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "score":
            // Worst-first (lowest score first per spec)
            return (a.score ?? 999) - (b.score ?? 999);
          case "name":
            return a.name.localeCompare(b.name);
          case "openCritical":
            return b.crit - a.crit;
          case "lastScan":
            return (lastScanAt.get(b.id!) ?? 0) - (lastScanAt.get(a.id!) ?? 0);
          default:
            return 0;
        }
      });
  }, [siteRows, searchQuery, statusFilter, platformFilter, clientFilter, sortBy, lastScanAt]);

  const activeCount = siteRows.length;
  const maxLimit = 25;
  const filtersActive =
    searchQuery || statusFilter !== "all" || platformFilter !== "all" || clientFilter !== "all";

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header: Title, Limit Meter & Add Site Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="m-0 font-serif text-[32px] sm:text-[38px] font-normal tracking-tight text-ink">
            Monitored Websites
          </h1>
          <p className="mt-1 text-sm text-muted">
            Manage your stores, automated check schedules, and compliance targets.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-semibold text-ink">
              {activeCount} of {maxLimit} sites monitored
            </span>
            <div className="mt-1 h-1.5 w-32 rounded-full bg-line overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(activeCount / maxLimit) * 100}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAddDialogOpen(true)}
            className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-card"
          >
            <Icon d={I.plus} size={16} />
            <span>Add site</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-xl border border-line bg-subtle/50 px-3 py-1.5">
          <Icon d={I.search} size={16} className="text-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by site, domain, or client..."
            className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="grid size-5 place-items-center text-muted hover:text-ink border-0 bg-transparent"
            >
              <Icon d={I.close} size={12} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink outline-none focus:border-primary"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="error">Error / Attention</option>
          </select>

          {/* Platform filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            aria-label="Filter by platform"
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink outline-none focus:border-primary"
          >
            <option value="all">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {clients.length > 0 && (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              aria-label="Filter by client"
              className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink outline-none focus:border-primary"
            >
              <option value="all">All clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Sort order */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Sort sites by"
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink outline-none focus:border-primary"
          >
            <option value="score">Sort: Worst score first</option>
            <option value="openCritical">Sort: Most critical issues</option>
            <option value="name">Sort: Alphabetical (A-Z)</option>
            <option value="lastScan">Sort: Last scan date</option>
          </select>
        </div>
      </div>

      {/* Sites Table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {loadError ? (
          <div role="alert" className="p-12 text-center text-sm text-crit">
            {loadError}{" "}
            <button type="button" onClick={load} className="font-semibold underline">
              Try again
            </button>
          </div>
        ) : sites === null ? (
          <div role="status" className="p-12 text-center text-sm text-muted">
            Loading sites…
          </div>
        ) : filteredSites.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-subtle text-muted">
              <Icon d={I.globe} size={24} />
            </span>
            <div className="flex flex-col gap-1 max-w-sm">
              <h3 className="text-base font-semibold text-ink m-0">No websites found</h3>
              <p className="text-xs text-muted m-0">
                {filtersActive
                  ? "Try resetting your search filters to view your websites."
                  : "Add your first online store to begin automated accessibility audits."}
              </p>
            </div>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setPlatformFilter("all");
                  setClientFilter("all");
                }}
                className="mt-2 rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink hover:bg-subtle"
              >
                Clear all filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAddDialogOpen(true)}
                className="mt-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover shadow-card"
              >
                Add website
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                  <th className="px-4 py-3 sm:px-6">Website</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Open Issues</th>
                  <th className="px-4 py-3 hidden md:table-cell">Last Checked</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredSites.map((site) => {
                  const isPaused = site.status === "Paused";
                  const isError = site.status === "Error";
                  const siteHref = `/${orgSlug}/sites/${site.id}`;

                  return (
                    <tr
                      key={site.id}
                      className={`transition-colors hover:bg-subtle/50 ${
                        isPaused ? "opacity-60 bg-subtle/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3 sm:px-6">
                        <Link
                          href={siteHref}
                          className="flex flex-col no-underline text-ink group"
                        >
                          <span className="font-semibold group-hover:text-primary transition-colors">
                            {site.name}
                          </span>
                          <span className="text-xs text-muted flex items-center gap-1">
                            {site.url}
                            <Icon d={I.arrowUpRight} size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </Link>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted font-medium">
                        {site.client}
                      </td>

                      <td className="px-4 py-3 text-xs">
                        <span className="rounded-full bg-subtle border border-line/60 px-2.5 py-0.5 text-muted font-medium">
                          {site.platform}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink tnum">
                            {site.score ?? "-"}
                          </span>
                          <BandBadge score={site.score} className="px-1.5 text-[11px]" />
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs">
                        {site.score === null ? (
                          <span className="text-muted">Not scanned yet</span>
                        ) : site.crit > 0 ? (
                          <span className="font-semibold text-crit flex items-center gap-1">
                            <Icon d={I.critical} size={14} stroke="var(--crit)" />
                            {site.crit} critical
                          </span>
                        ) : site.ser > 0 ? (
                          <span className="font-semibold text-ser flex items-center gap-1">
                            <Icon d={I.serious} size={14} stroke="var(--ser)" />
                            {site.ser} serious
                          </span>
                        ) : (
                          <span className="text-ok font-semibold flex items-center gap-1">
                            <Icon d={I.fixed} size={14} stroke="var(--ok)" />
                            Clean
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-muted hidden md:table-cell">
                        {site.last}
                      </td>

                      <td className="px-4 py-3 text-xs">
                        {isError ? (
                          <span className="rounded-full bg-crit/10 text-crit px-2 py-0.5 font-semibold">
                            Error
                          </span>
                        ) : isPaused ? (
                          <span className="rounded-full bg-subtle text-muted px-2 py-0.5 font-semibold">
                            Paused
                          </span>
                        ) : (
                          <span className="rounded-full bg-ok/10 text-ok px-2 py-0.5 font-semibold">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right relative">
                        <button
                          type="button"
                          onClick={() => setActionMenuOpen((curr) => (curr === site.id ? null : site.id!))}
                          aria-label={`Actions for ${site.name}`}
                          className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink hover:bg-subtle ml-auto focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <Icon d={I.chevronsUpDown} size={14} />
                        </button>

                        {actionMenuOpen === site.id && (
                          <div
                            role="menu"
                            aria-label={`Actions for ${site.name}`}
                            className="absolute right-4 top-full z-40 mt-1 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-dialog text-left text-ink"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleScanNow(site)}
                              className="ease-ui flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink hover:bg-subtle"
                            >
                              <Icon d={I.refresh} size={14} className="text-muted" />
                              <span>Scan now</span>
                            </button>
                            <Link
                              href={`${siteHref}/settings`}
                              role="menuitem"
                              onClick={() => setActionMenuOpen(null)}
                              className="ease-ui flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink hover:bg-subtle no-underline"
                            >
                              <Icon d={I.settings} size={14} className="text-muted" />
                              <span>Settings</span>
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handlePauseResume(site)}
                              className="ease-ui flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink hover:bg-subtle"
                            >
                              <Icon d={I.circle} size={14} className="text-muted" />
                              <span>{isPaused ? "Resume scans" : "Pause scans"}</span>
                            </button>
                            <div className="my-1 h-px bg-line" />
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleRemoveSite(site)}
                              className="ease-ui flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-crit hover:bg-rose-500/10"
                            >
                              <Icon d={I.close} size={14} />
                              <span>Remove site</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* S-22 Add Site Dialog */}
      <AddSiteDialog
        open={addDialogOpen}
        orgSlug={orgSlug}
        onClose={() => setAddDialogOpen(false)}
        onSiteCreated={load}
        isAgency={true}
      />
    </div>
  );
}
