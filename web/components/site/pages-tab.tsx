"use client";

import React, { useState, useEffect } from "react";
import { Icon, I } from "@/components/icons";
import { ScanStatusBadge } from "@/components/badges";
import { apiClient } from "@/lib/api";

export interface PageItem {
  id: string;
  url: string;
  templateKey: string;
  title?: string | null;
  isPinned: boolean;
  lastStatusCode?: number | null;
  lastResultStatus?: string | null;
  violations?: number | null;
  passes?: number | null;
  score?: number | null;
}

export interface TemplateGroup {
  templateKey: string;
  templateName: string;
  pagesDiscovered: number;
  pagesCheckedLastScan: number;
  openIssuesCount: number;
  pages: PageItem[];
}


export interface PagesTabProps {
  orgSlug?: string;
  siteSlug?: string;
  siteId?: string;
  onNavigateToSettings?: () => void;
  onToast?: (message: string) => void;
}

export function PagesTab({
  orgSlug,
  siteSlug,
  siteId,
  onNavigateToSettings,
  onToast,
}: PagesTabProps) {
  const [templates, setTemplates] = useState<TemplateGroup[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    home: true,
    product: true,
    collection: true,
    cart: true,
    article: false,
  });
  const [newUrl, setNewUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPinnedOnly, setFilterPinnedOnly] = useState(false);

  useEffect(() => {
    if (!orgSlug || !siteId) return;

    let mounted = true;
    apiClient<{ templates: TemplateGroup[] }>(`/v1/orgs/${orgSlug}/sites/${siteId}/pages`)
      .then((res) => {
        if (mounted && res?.templates) {
          setTemplates(res.templates);
          // Set initial expanded keys
          const exp: Record<string, boolean> = {};
          res.templates.forEach((t, i) => {
            exp[t.templateKey] = i < 3;
          });
          setExpanded(exp);
        }
      })
      .catch(() => {
        if (mounted) onToast?.("Could not load pages for this site.");
      });

    return () => {
      mounted = false;
    };
  }, [orgSlug, siteId]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePin = async (page: PageItem) => {
    const nextPinned = !page.isPinned;

    // Optimistic update
    setTemplates((prev) =>
      prev.map((group) => {
        if (!group.pages.some((p) => p.id === page.id || p.url === page.url)) {
          return group;
        }
        return {
          ...group,
          pages: group.pages.map((p) =>
            p.id === page.id || p.url === page.url ? { ...p, isPinned: nextPinned } : p,
          ),
        };
      }),
    );

    onToast?.(
      nextPinned
        ? `Pinned ${page.url}. It will now be checked on every scan.`
        : `Unpinned ${page.url}.`,
    );

    if (orgSlug && siteId) {
      try {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}/pages/pin`, {
          method: "POST",
          body: JSON.stringify({
            pageId: page.id,
            url: page.url,
            isPinned: nextPinned,
          }),
        });
      } catch {
        onToast?.("Could not save the pin change. Please reload and try again.");
      }
    }
  };

  const handleAddPage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUrl.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

    // Add to state optimistically
    const newPage: PageItem = {
      id: `custom-${Date.now()}`,
      url: normalized,
      templateKey: "custom",
      title: normalized,
      isPinned: true,
      lastStatusCode: null,
      lastResultStatus: null,
      violations: null,
      passes: null,
      score: null,
    };

    setTemplates((prev) => {
      const existingCustom = prev.find((t) => t.templateKey === "custom");
      if (existingCustom) {
        return prev.map((t) =>
          t.templateKey === "custom"
            ? {
                ...t,
                pagesDiscovered: t.pagesDiscovered + 1,
                pages: [newPage, ...t.pages],
              }
            : t,
        );
      } else {
        return [
          {
            templateKey: "custom",
            templateName: "Custom Pinned Pages",
            pagesDiscovered: 1,
            pagesCheckedLastScan: 0,
            openIssuesCount: 0,
            pages: [newPage],
          },
          ...prev,
        ];
      }
    });

    setExpanded((prev) => ({ ...prev, custom: true }));
    setNewUrl("");
    setIsSubmitting(false);
    onToast?.(`Added ${normalized} to always check on every scan.`);

    if (orgSlug && siteId) {
      try {
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}/pages/pin`, {
          method: "POST",
          body: JSON.stringify({
            url: normalized,
            isPinned: true,
          }),
        });
      } catch {
        onToast?.("Could not pin that page. Please reload and try again.");
      }
    }
  };

  // Calculations
  const totalDiscovered = templates.reduce((acc, t) => acc + t.pagesDiscovered, 0);
  const totalChecked = templates.reduce((acc, t) => acc + t.pagesCheckedLastScan, 0);
  const totalPinned = templates.reduce(
    (acc, t) => acc + t.pages.filter((p) => p.isPinned).length,
    0,
  );

  const filteredTemplates = templates
    .map((group) => {
      const q = search.toLowerCase().trim();
      const matchingPages = group.pages.filter((p) => {
        if (filterPinnedOnly && !p.isPinned) return false;
        if (!q) return true;
        return (
          p.url.toLowerCase().includes(q) ||
          (p.title && p.title.toLowerCase().includes(q))
        );
      });
      return {
        ...group,
        pages: matchingPages,
      };
    })
    .filter((group) => group.pages.length > 0 || !search);

  return (
    <div className="flex flex-col gap-8">
      {/* Header & Description */}
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">
          Pages &amp; templates
        </h2>
        <p className="m-0 text-sm text-muted">
          Discovered pages grouped by detected page template. Pinned pages are guaranteed to
          be included in every automated scan run.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Discovered Pages
          </span>
          <span className="text-2xl font-semibold text-ink">{totalDiscovered}</span>
          <span className="text-xs text-muted">Across {templates.length} templates</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Checked in Last Scan
          </span>
          <span className="text-2xl font-semibold text-ink">{totalChecked}</span>
          <span className="text-xs text-muted">Sampled per template quota</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Always Checked (Pinned)
          </span>
          <span className="text-2xl font-semibold text-ink">{totalPinned}</span>
          <span className="text-xs text-muted">Prioritized on every scheduled scan</span>
        </div>
      </div>

      {/* Action Bar: Add Page to Always Check + Search & Settings Link */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-[280px] flex-1 flex-col gap-1">
            <span className="text-sm font-semibold text-ink">
              Add page to always check
            </span>
            <span className="text-xs text-muted">
              Enter a full URL to pin it to future scans regardless of discovery limits.
            </span>
          </div>

          <form onSubmit={handleAddPage} className="flex w-full sm:w-auto items-center gap-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/important-page"
              className="h-9 min-w-[280px] flex-1 sm:w-80 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!newUrl.trim() || isSubmitting}
              className="ease-ui flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              <Icon d={I.plus} size={15} />
              Add page
            </button>
          </form>
        </div>

        {/* Excluded paths link alert */}
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle/50 px-3.5 py-2.5 text-xs text-muted">
          <div className="flex items-center gap-2">
            <Icon d={I.alert} size={15} className="text-primary flex-shrink-0" />
            <span>
              Looking to prevent certain paths from ever being scanned (e.g. checkout, login)?
            </span>
          </div>
          {onNavigateToSettings ? (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="font-semibold text-primary hover:underline flex-shrink-0"
            >
              Manage excluded paths in Site settings &rarr;
            </button>
          ) : (
            <span className="font-semibold text-ink">Manage in Site settings</span>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <Icon
            d={I.search}
            size={16}
            className="pointer-events-none absolute left-3 top-2.5 text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter pages by URL or title..."
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterPinnedOnly(!filterPinnedOnly)}
            className={`ease-ui inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
              filterPinnedOnly
                ? "border-primary bg-primary/10 text-primary"
                : "border-line-strong bg-surface text-ink hover:bg-subtle"
            }`}
          >
            <Icon d={I.pin} size={13} />
            {filterPinnedOnly ? "Showing pinned only" : "Filter pinned only"}
          </button>
        </div>
      </div>

      {/* Template Groups Accordions */}
      <div className="flex flex-col gap-4">
        {filteredTemplates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            No pages found matching &ldquo;{search}&rdquo;.
          </div>
        ) : (
          filteredTemplates.map((group) => {
            const isExp = expanded[group.templateKey] ?? false;
            return (
              <div
                key={group.templateKey}
                className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs transition-colors"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.templateKey)}
                  aria-expanded={isExp}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-subtle/60 focus:outline-none"
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      d={isExp ? I.chevronDown : I.chevronRight}
                      size={18}
                      className="text-muted"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-sm sm:text-base">
                          {group.templateName}
                        </span>
                        <code className="rounded bg-subtle px-1.5 py-0.5 text-xs font-mono text-muted">
                          {group.templateKey}
                        </code>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {group.pagesDiscovered} {group.pagesDiscovered === 1 ? "page" : "pages"} discovered
                        {" · "}
                        {group.pagesCheckedLastScan} checked in last scan
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {group.openIssuesCount > 0 ? (
                      <span className="rounded-full bg-crit-soft/40 px-2.5 py-0.5 text-xs font-semibold text-crit">
                        {group.openIssuesCount} open {group.openIssuesCount === 1 ? "issue" : "issues"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-ok-soft/40 px-2.5 py-0.5 text-xs font-semibold text-ok">
                        No open issues
                      </span>
                    )}
                  </div>
                </button>

                {/* Accordion Content: Page Rows */}
                {isExp && (
                  <div className="border-t border-line">
                    <div className="divide-y divide-line">
                      {group.pages.map((page) => (
                        <div
                          key={page.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-subtle/30"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <a
                                href={page.url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate font-mono text-xs text-ink hover:underline inline-flex items-center gap-1"
                              >
                                {page.url}
                                <Icon d={I.external} size={12} className="text-muted flex-shrink-0" />
                              </a>
                            </div>
                            {page.title && (
                              <span className="truncate text-xs text-muted">
                                {page.title}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            {page.lastResultStatus && (
                              <ScanStatusBadge
                                status={
                                  page.lastResultStatus === "completed"
                                    ? "completed"
                                    : page.lastResultStatus === "partial"
                                      ? "partial"
                                      : "failed"
                                }
                              />
                            )}

                            {page.score !== null && page.score !== undefined && (
                              <span className="inline-flex items-center gap-1 rounded bg-subtle px-2 py-0.5 text-xs font-mono font-medium text-ink">
                                Score: {page.score}
                              </span>
                            )}

                            {page.violations !== null && page.violations !== undefined && (
                              <span
                                className={`text-xs font-medium ${
                                  page.violations > 0 ? "text-crit" : "text-ok"
                                }`}
                              >
                                {page.violations} {page.violations === 1 ? "violation" : "violations"}
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => togglePin(page)}
                              title={
                                page.isPinned
                                  ? "Always checked (click to unpin)"
                                  : "Click to always check this page on every scan"
                              }
                              className={`ease-ui inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium border transition-colors ${
                                page.isPinned
                                  ? "border-primary bg-primary text-on-primary shadow-2xs hover:bg-primary-hover"
                                  : "border-line-strong bg-surface text-muted hover:border-ink hover:text-ink"
                              }`}
                            >
                              <Icon d={I.pin} size={13} />
                              <span>{page.isPinned ? "Pinned" : "Pin"}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
