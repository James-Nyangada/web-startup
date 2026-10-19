"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

export interface SiteSettingsData {
  id: string;
  name: string;
  rootUrl: string;
  clientName?: string | null;
  platform?: string;
  scanFrequency?: string;
  scanDay?: number;
  scanHour?: number;
  pageLimit?: number;
  standard?: string;
  pinnedUrls?: string[];
  excludedPaths?: string[];
  status?: string;
  timeZone?: string;
}

export interface SettingsTabProps {
  orgSlug?: string;
  siteSlug?: string;
  siteId?: string;
  initialSite?: SiteSettingsData;
  onToast?: (message: string) => void;
  onSiteUpdated?: (updated: Partial<SiteSettingsData>) => void;
  onSiteDeleted?: () => void;
}

const PLATFORMS_LIST = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "magento", label: "Magento / Adobe Commerce" },
  { value: "bigcommerce", label: "BigCommerce" },
  { value: "custom", label: "Custom / In-house" },
  { value: "unknown", label: "Unknown / Other" },
];

const FREQUENCIES = [
  { value: "daily", label: "Daily (7 days a week)" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Every two weeks (Fortnightly)" },
  { value: "monthly", label: "Monthly" },
  { value: "manual", label: "Manual only (No scheduled runs)" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function SettingsTab({
  orgSlug,
  siteSlug,
  siteId,
  initialSite,
  onToast,
  onSiteUpdated,
  onSiteDeleted,
}: SettingsTabProps) {
  // Baseline initial state
  const baseline: SiteSettingsData = useMemo(() => {
    return {
      id: siteId || initialSite?.id || "",
      name: initialSite?.name || "",
      rootUrl: initialSite?.rootUrl || "",
      clientName: initialSite?.clientName || "",
      platform: initialSite?.platform || "unknown",
      scanFrequency: initialSite?.scanFrequency || "weekly",
      scanDay: initialSite?.scanDay ?? 1,
      scanHour: initialSite?.scanHour ?? 2,
      pageLimit: initialSite?.pageLimit ?? 50,
      standard: initialSite?.standard || "wcag22aa",
      pinnedUrls: initialSite?.pinnedUrls || [],
      excludedPaths: initialSite?.excludedPaths || [],
      status: initialSite?.status || "active",
      timeZone: initialSite?.timeZone || "UTC",
    };
  }, [siteId, initialSite]);

  // Section 1: General
  const [name, setName] = useState(baseline.name);
  const [clientName, setClientName] = useState(baseline.clientName || "");
  const [platform, setPlatform] = useState(baseline.platform || "shopify");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Section 2: Monitoring
  const [scanFrequency, setScanFrequency] = useState(baseline.scanFrequency || "weekly");
  const [scanDay, setScanDay] = useState(baseline.scanDay ?? 1);
  const [scanHour, setScanHour] = useState(baseline.scanHour ?? 2);
  const [pageLimit, setPageLimit] = useState(baseline.pageLimit ?? 50);
  const [standard, setStandard] = useState(baseline.standard || "wcag22aa");
  const [savingMonitoring, setSavingMonitoring] = useState(false);

  // Section 3: Pages & Excluded Paths
  const [pinnedUrls, setPinnedUrls] = useState<string[]>(baseline.pinnedUrls || []);
  const [newPinnedUrl, setNewPinnedUrl] = useState("");
  const [excludedPathsText, setExcludedPathsText] = useState(
    (baseline.excludedPaths || []).join("\n"),
  );
  const [savingPages, setSavingPages] = useState(false);

  // Excluded paths preview state
  const [exclusionPreview, setExclusionPreview] = useState<{
    matchCount: number;
    matchedUrls: string[];
    loading: boolean;
  }>({
    matchCount: 0,
    matchedUrls: [],
    loading: false,
  });

  // Section 4: Danger Zone
  const [status, setStatus] = useState(baseline.status || "active");
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Unsaved changes tracking
  const generalDirty =
    name !== baseline.name ||
    clientName !== (baseline.clientName || "") ||
    platform !== baseline.platform;

  const monitoringDirty =
    scanFrequency !== baseline.scanFrequency ||
    scanDay !== baseline.scanDay ||
    scanHour !== baseline.scanHour ||
    pageLimit !== baseline.pageLimit ||
    standard !== baseline.standard;

  const currentExcludedList = useMemo(
    () =>
      excludedPathsText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
    [excludedPathsText],
  );

  const pagesDirty =
    JSON.stringify(pinnedUrls) !== JSON.stringify(baseline.pinnedUrls || []) ||
    JSON.stringify(currentExcludedList) !==
      JSON.stringify(baseline.excludedPaths || []);

  const hasAnyUnsavedChanges = generalDirty || monitoringDirty || pagesDirty;

  // Debounced live preview for excluded paths
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(previewTimer.current);
    const patterns = currentExcludedList;

    if (patterns.length === 0) {
      setExclusionPreview({ matchCount: 0, matchedUrls: [], loading: false });
      return;
    }

    setExclusionPreview((prev) => ({ ...prev, loading: true }));

    previewTimer.current = setTimeout(async () => {
      if (orgSlug && siteId) {
        try {
          const res = await apiClient<{ matchCount: number; matchedUrls: string[] }>(
            `/v1/orgs/${orgSlug}/sites/${siteId}/preview-exclusions`,
            {
              method: "POST",
              body: JSON.stringify({ patterns }),
            },
          );
          setExclusionPreview({
            matchCount: res.matchCount,
            matchedUrls: res.matchedUrls || [],
            loading: false,
          });
          return;
        } catch {
          // Preview is best-effort; show no matches if it fails.
        }
      }

      setExclusionPreview({ matchCount: 0, matchedUrls: [], loading: false });
    }, 350);

    return () => clearTimeout(previewTimer.current);
  }, [currentExcludedList, orgSlug, siteId]);

  // Save General
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      if (orgSlug && siteId) {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            clientName: clientName || null,
            platform,
          }),
        });
      }
      onSiteUpdated?.({ name, clientName, platform });
      onToast?.("General settings updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update general settings";
      onToast?.(`Error: ${msg}`);
    } finally {
      setSavingGeneral(false);
    }
  };

  // Save Monitoring
  const handleSaveMonitoring = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMonitoring(true);
    try {
      if (orgSlug && siteId) {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}`, {
          method: "PATCH",
          body: JSON.stringify({
            scanFrequency,
            scanDay,
            scanHour,
            pageLimit,
            standard,
          }),
        });
      }
      onSiteUpdated?.({ scanFrequency, scanDay, scanHour, pageLimit, standard });
      onToast?.("Monitoring schedule saved successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update monitoring schedule";
      onToast?.(`Error: ${msg}`);
    } finally {
      setSavingMonitoring(false);
    }
  };

  // Save Pages & Excluded Paths
  const handleSavePages = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPages(true);
    try {
      if (orgSlug && siteId) {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}`, {
          method: "PATCH",
          body: JSON.stringify({
            pinnedUrls,
            excludedPaths: currentExcludedList,
          }),
        });
      }
      onSiteUpdated?.({ pinnedUrls, excludedPaths: currentExcludedList });
      onToast?.("Pages and excluded paths updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save pages settings";
      onToast?.(`Error: ${msg}`);
    } finally {
      setSavingPages(false);
    }
  };

  // Add Pinned URL
  const handleAddPinnedUrl = () => {
    const trimmed = newPinnedUrl.trim();
    if (!trimmed) return;
    const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    if (!pinnedUrls.includes(normalized)) {
      setPinnedUrls([...pinnedUrls, normalized]);
    }
    setNewPinnedUrl("");
  };

  // Remove Pinned URL
  const handleRemovePinnedUrl = (url: string) => {
    setPinnedUrls(pinnedUrls.filter((u) => u !== url));
  };

  // Pause / Resume site
  const handleTogglePause = async () => {
    setTogglingStatus(true);
    const isCurrentlyActive = status === "active";
    const endpoint = isCurrentlyActive ? "pause" : "resume";
    const nextStatus = isCurrentlyActive ? "paused" : "active";

    try {
      if (orgSlug && siteId) {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}/${endpoint}`, {
          method: "POST",
        });
      }
      setStatus(nextStatus);
      onSiteUpdated?.({ status: nextStatus });
      onToast?.(
        isCurrentlyActive
          ? "Site scanning paused. Scheduled scans are temporarily disabled."
          : "Site scanning resumed. Scheduled scans are now active.",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update site status";
      onToast?.(`Error: ${msg}`);
    } finally {
      setTogglingStatus(false);
    }
  };

  // Delete site
  const handleDeleteSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmation.trim().toLowerCase() !== baseline.name.toLowerCase()) {
      return;
    }

    setIsDeleting(true);
    try {
      if (orgSlug && siteId) {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}`, {
          method: "DELETE",
        });
      }
      onToast?.(`Site "${baseline.name}" has been deleted.`);
      onSiteDeleted?.();
      setTimeout(() => {
        window.location.href = orgSlug ? `/${orgSlug}/sites` : "/sites";
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete site";
      onToast?.(`Error: ${msg}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">
          Site settings
        </h2>
        <p className="m-0 text-sm text-muted">
          Configure monitoring schedules, audit standards, pinned URLs, and path exclusions.
        </p>
      </div>

      {/* Unsaved Changes Banner */}
      {hasAnyUnsavedChanges && (
        <div className="sticky top-4 z-20 flex items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-ink backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-2">
            <Icon d={I.alert} size={16} className="text-amber-600 flex-shrink-0" />
            <span className="font-medium">
              You have unsaved changes in one or more sections.
            </span>
          </div>
          <span className="text-xs text-muted">
            Remember to click &ldquo;Save changes&rdquo; within each edited section.
          </span>
        </div>
      )}

      {/* Section 1: General */}
      <section className="rounded-xl border border-line bg-surface p-6 shadow-xs">
        <form onSubmit={handleSaveGeneral} className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h3 className="m-0 text-base font-semibold text-ink">General</h3>
              <p className="m-0 text-xs text-muted">
                Basic site details, client attribution, and website platform.
              </p>
            </div>
            {generalDirty && (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Unsaved edits
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="site-name" className="text-xs font-semibold text-ink uppercase tracking-wider">
                Site Name
              </label>
              <input
                id="site-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="client-name" className="text-xs font-semibold text-ink uppercase tracking-wider">
                Client Attribution (Optional)
              </label>
              <input
                id="client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Mark Otieno"
                className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="platform-select" className="text-xs font-semibold text-ink uppercase tracking-wider">
                CMS / eCommerce Platform
              </label>
              <select
                id="platform-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PLATFORMS_LIST.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">
                Platform detection helps tailor remediation snippets and theme-level guidelines.
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!generalDirty || savingGeneral}
              className="ease-ui flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {savingGeneral ? "Saving..." : "Save general settings"}
            </button>
          </div>
        </form>
      </section>

      {/* Section 2: Monitoring Schedule & Standards */}
      <section className="rounded-xl border border-line bg-surface p-6 shadow-xs">
        <form onSubmit={handleSaveMonitoring} className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h3 className="m-0 text-base font-semibold text-ink">Monitoring &amp; Audit Standard</h3>
              <p className="m-0 text-xs text-muted">
                Configure automated recurrence, testing quotas, and accessibility criteria.
              </p>
            </div>
            {monitoringDirty && (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Unsaved edits
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="frequency-select" className="text-xs font-semibold text-ink uppercase tracking-wider">
                Scan Frequency
              </label>
              <select
                id="frequency-select"
                value={scanFrequency}
                onChange={(e) => setScanFrequency(e.target.value)}
                className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {scanFrequency !== "manual" && (
              <>
                {scanFrequency !== "daily" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="day-select" className="text-xs font-semibold text-ink uppercase tracking-wider">
                      Scheduled Day of Week
                    </label>
                    <select
                      id="day-select"
                      value={scanDay}
                      onChange={(e) => setScanDay(Number(e.target.value))}
                      className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="hour-select" className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Scan Hour ({baseline.timeZone || "UTC"})
                  </label>
                  <select
                    id="hour-select"
                    value={scanHour}
                    onChange={(e) => setScanHour(Number(e.target.value))}
                    className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00 ({baseline.timeZone || "UTC"})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label htmlFor="page-limit" className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Page Limit Per Scan
                </label>
                <span className="font-mono text-sm font-semibold text-primary">
                  {pageLimit} pages
                </span>
              </div>
              <input
                id="page-limit"
                type="range"
                min="5"
                max="100"
                step="5"
                value={pageLimit}
                onChange={(e) => setPageLimit(Number(e.target.value))}
                className="accent-primary cursor-pointer w-full"
              />
              <span className="text-xs text-muted">
                Limits how many sampled pages are crawled per scan. Maximum allowed by your plan is 100 pages.
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                Accessibility Standard
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                    standard === "wcag22aa"
                      ? "border-primary bg-primary/5"
                      : "border-line bg-surface hover:bg-subtle/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="standard"
                    value="wcag22aa"
                    checked={standard === "wcag22aa"}
                    onChange={(e) => setStandard(e.target.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ink">
                      WCAG 2.2 Level AA (Recommended)
                    </span>
                    <span className="text-xs text-muted">
                      Includes latest criteria: target size, focus appearance, and dragging movements.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                    standard === "wcag21aa"
                      ? "border-primary bg-primary/5"
                      : "border-line bg-surface hover:bg-subtle/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="standard"
                    value="wcag21aa"
                    checked={standard === "wcag21aa"}
                    onChange={(e) => setStandard(e.target.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ink">
                      WCAG 2.1 Level AA
                    </span>
                    <span className="text-xs text-muted">
                      Standard compliance level required under UK Public Sector and EU Web Accessibility Directive.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!monitoringDirty || savingMonitoring}
              className="ease-ui flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {savingMonitoring ? "Saving..." : "Save monitoring settings"}
            </button>
          </div>
        </form>
      </section>

      {/* Section 3: Pages & Exclusions */}
      <section className="rounded-xl border border-line bg-surface p-6 shadow-xs">
        <form onSubmit={handleSavePages} className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h3 className="m-0 text-base font-semibold text-ink">Pages &amp; Path Exclusions</h3>
              <p className="m-0 text-xs text-muted">
                Specify pages to prioritize on every scan and patterns to ignore completely.
              </p>
            </div>
            {pagesDirty && (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Unsaved edits
              </span>
            )}
          </div>

          {/* Pinned URLs Subsection */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-semibold text-ink uppercase tracking-wider">
              Pinned URLs (Always Checked)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPinnedUrl}
                onChange={(e) => setNewPinnedUrl(e.target.value)}
                placeholder="https://oakhaus.com/custom-page"
                className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleAddPinnedUrl}
                disabled={!newPinnedUrl.trim()}
                className="ease-ui inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50"
              >
                <Icon d={I.plus} size={14} />
                Pin URL
              </button>
            </div>

            {pinnedUrls.length === 0 ? (
              <p className="text-xs text-muted italic">
                No pinned URLs yet. Add URLs above to guarantee they are tested on every scan.
              </p>
            ) : (
              <div className="divide-y divide-line rounded-lg border border-line bg-subtle/20">
                {pinnedUrls.map((url) => (
                  <div key={url} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="truncate font-mono text-ink">{url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePinnedUrl(url)}
                      className="text-crit hover:underline flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Excluded Paths Subsection + Live Matching Preview */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex items-center justify-between">
              <label htmlFor="excluded-paths" className="text-xs font-semibold text-ink uppercase tracking-wider">
                Excluded Path Patterns (One Per Line)
              </label>
              <span className="text-xs text-muted">
                Supports glob wildcards (<code>*</code>, <code>**</code>)
              </span>
            </div>

            <textarea
              id="excluded-paths"
              rows={4}
              value={excludedPathsText}
              onChange={(e) => setExcludedPathsText(e.target.value)}
              placeholder={"/cart*\n/checkout*\n/account/*\n/admin/*"}
              className="font-mono text-xs leading-relaxed rounded-lg border border-line-strong bg-surface p-3 text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="rounded-lg border border-line bg-subtle/40 p-3 text-xs text-muted">
              <div className="font-semibold text-ink mb-1">Pattern Guidelines:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li><code>/cart*</code> matches <code>/cart</code> and <code>/cart/checkout</code></li>
                <li><code>/account/*</code> matches any path under <code>/account/</code></li>
                <li><code>*.pdf</code> matches all PDF document URLs</li>
              </ul>
            </div>

            {/* Acceptance Criteria: Excluded-path preview shows how many discovered URLs match */}
            <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon d={I.search} size={15} className="text-primary" />
                  <span className="text-xs font-semibold text-ink">
                    Live Exclusion Preview
                  </span>
                </div>
                {exclusionPreview.loading ? (
                  <span className="text-xs text-muted">Checking matches...</span>
                ) : (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {exclusionPreview.matchCount}{" "}
                    {exclusionPreview.matchCount === 1 ? "URL matches" : "URLs match"}
                  </span>
                )}
              </div>

              {exclusionPreview.matchCount > 0 ? (
                <div className="mt-1 flex flex-col gap-1.5">
                  <span className="text-xs text-muted">
                    The following discovered URLs will be excluded from future scans:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {exclusionPreview.matchedUrls.map((u) => (
                      <span
                        key={u}
                        className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted">
                  No currently discovered URLs match the exclusion patterns above.
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!pagesDirty || savingPages}
              className="ease-ui flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {savingPages ? "Saving..." : "Save page settings"}
            </button>
          </div>
        </form>
      </section>

      {/* Section 4: Danger Zone */}
      <section className="rounded-xl border border-crit/30 bg-crit-soft/10 p-6 shadow-xs">
        <div className="flex flex-col gap-6">
          <div className="border-b border-crit/20 pb-4">
            <h3 className="m-0 text-base font-semibold text-crit">Danger zone</h3>
            <p className="m-0 text-xs text-muted">
              Destructive actions and temporary monitoring pause.
            </p>
          </div>

          {/* Pause / Resume site */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-crit/20 pb-6">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink">
                {status === "active" ? "Pause automated monitoring" : "Resume automated monitoring"}
              </span>
              <span className="text-xs text-muted">
                {status === "active"
                  ? "Pausing stops all scheduled automated scans. You can resume at any time."
                  : "Scanning is currently paused. Resume to restart weekly automated scans."}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTogglePause}
              disabled={togglingStatus}
              className={`ease-ui inline-flex h-9 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold transition-colors flex-shrink-0 ${
                status === "active"
                  ? "border-line-strong bg-surface text-ink hover:bg-subtle"
                  : "border-primary bg-primary text-on-primary hover:bg-primary-hover"
              }`}
            >
              <Icon d={status === "active" ? I.pause : I.play} size={14} />
              {togglingStatus
                ? "Updating..."
                : status === "active"
                  ? "Pause monitoring"
                  : "Resume monitoring"}
            </button>
          </div>

          {/* Delete Site with Typed Confirmation */}
          <form onSubmit={handleDeleteSite} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-crit">Delete site</span>
              <span className="text-xs text-muted">
                Permanently removes this site, its discovered pages, and all historical scan audits.
                This action cannot be undone.
              </span>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <label htmlFor="confirm-delete" className="text-xs text-ink">
                To confirm deletion, type <strong className="font-semibold">{baseline.name}</strong> below:
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="confirm-delete"
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder={baseline.name}
                  className="h-10 min-w-[260px] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-crit focus:outline-none focus:ring-1 focus:ring-crit"
                />
                <button
                  type="submit"
                  disabled={
                    deleteConfirmation.trim().toLowerCase() !== baseline.name.toLowerCase() ||
                    isDeleting
                  }
                  className="ease-ui flex h-10 items-center gap-1.5 rounded-lg bg-crit px-4 text-sm font-semibold text-white hover:bg-crit/90 disabled:opacity-40"
                >
                  <Icon d={I.trash} size={15} />
                  {isDeleting ? "Deleting site..." : "Delete this site"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
