"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { OverviewTab } from "./overview-tab";
import { IssuesTab } from "./issues-tab";
import { ScansTab, type ScanHistoryItem } from "./scans-tab";
import { IssueDrawer } from "./issue-drawer";
import { IgnoreDialog } from "./ignore-dialog";
import { Toast } from "./toast";
import { ISSUES, RECENTLY_FIXED, SITE_TABS, type Issue } from "@/lib/site-data";
import type { TrendPoint } from "@/lib/trend";
import type { Severity } from "@/lib/severity";

const isActive = (i: Issue) => i.status === "open" || i.status === "regressed" || i.status === "needsReview";

export interface SiteWorkspaceProps {
  startTab?: number;
  orgSlug?: string;
  siteSlug?: string;
  siteName?: string;
  initialScans?: ScanHistoryItem[];
  initialSite?: {
    id: string;
    name: string;
    rootUrl: string;
    platform?: string;
    clientName?: string | null;
    score?: number | null;
    status?: string;
    lastScanId?: string | null;
    scanFrequency?: string;
    scanDay?: number;
    scanHour?: number;
    pageLimit?: number;
    standard?: string;
  };
  initialOverview?: {
    score?: number | null;
    scoreBand?: string | null;
    scoreExplanation?: string | null;
    trend?: TrendPoint[];
    trendSummary?: string;
    topIssues?: Issue[];
    severityCounts?: Record<Severity, number>;
    diffSummary?: {
      newCount: number;
      fixedCount: number;
      regressedCount: number;
      sinceLabel?: string | null;
    };
    recentlyFixed?: Array<{ id: string; title: string; fixedAt: string | null; fixedDate?: string }>;
    coverage?: {
      pagesScanned?: number;
      pagesPlanned?: number;
      templatesFound?: number;
      standard?: string;
      nextScan?: string;
      nextScanFormatted?: string | null;
    };
  };
}

/** S-24 Site overview · S-25 Issues · S-26 Issue drawer — interactive flow F-04 (triage and fix). */
export function SiteWorkspace({
  startTab = 0,
  orgSlug,
  siteSlug,
  siteName,
  initialSite,
  initialOverview,
  initialScans,
}: SiteWorkspaceProps) {
  const [tab, setTab] = useState(startTab);
  const [issues, setIssues] = useState<Issue[]>(() => {
    if (initialOverview?.topIssues && initialOverview.topIssues.length > 0) {
      // Merge initial top issues with standard issues set
      return ISSUES;
    }
    return ISSUES;
  });
  const [fixed, setFixed] = useState<[string, string][]>(RECENTLY_FIXED);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const active = issues.filter(isActive);
  const current = issues.find((i) => i.id === openId) ?? null;

  const displayName = siteName || initialSite?.name || "Oakhaus Furniture";
  const rootUrl = initialSite?.rootUrl || "https://oakhaus.com";
  const rootHost = rootUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const platform = initialSite?.platform || "Shopify";
  const clientName = initialSite?.clientName ? `Client: ${initialSite.clientName}` : "Client: Mark Otieno";
  const isVerified = initialSite ? initialSite.status === "active" : true;

  const siteHref = orgSlug && siteSlug ? `/${orgSlug}/sites/${siteSlug}` : (siteSlug ? `/sites/${siteSlug}` : "/sites/oakhaus");
  const scanHref = orgSlug && siteSlug
    ? `/${orgSlug}/sites/${siteSlug}/scans/scan-demo`
    : (siteSlug ? `/sites/${siteSlug}/scans/scan-demo` : "/sites/oakhaus/scans/scan-demo");

  const startToastTimer = useCallback(() => {
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const showToast = (t: string) => {
    setToast(t);
    startToastTimer();
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const setIssue = (id: string, patch: Partial<Issue>) =>
    setIssues((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const openIssue = (id: string) => {
    returnTo.current = document.activeElement as HTMLElement;
    setOpenId(id);
  };
  const closeDrawer = useCallback(() => setOpenId(null), []);
  // After the exit animation, send focus back to the row that opened the drawer. If that row
  // left the list (e.g. the issue was just fixed), fall back to the main content.
  const onDrawerExited = useCallback(() => {
    const r = returnTo.current;
    if (r?.isConnected) r.focus();
    else document.getElementById("main")?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ignoreOpen) closeIgnore();
      else if (openId) closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const recheck = () => {
    if (!current) return;
    const { id, title, template, pages } = current;
    const n = Math.min(pages, 3);
    setRechecking(true);
    setTimeout(() => {
      setIssue(id, { status: "fixed" });
      setRechecking(false);
      setFixed((f) => [[`${title} — ${template}`, "Today"], ...f]);
      setSelected((s) => s.filter((x) => x !== id));
      showToast(`Fixed — the problem no longer appears on ${n} checked ${n === 1 ? "page" : "pages"}.`);
    }, 1600);
  };

  const focusInDrawer = (sel: string) =>
    requestAnimationFrame(() => (document.querySelector<HTMLElement>(sel) ?? document.getElementById("drawer-title"))?.focus());
  const closeIgnore = () => {
    setIgnoreOpen(false);
    focusInDrawer("[data-ignore-btn]");
  };
  const confirmIgnore = (reason: string) => {
    if (current) setIssue(current.id, { status: "ignored", ignoreReason: reason });
    setIgnoreOpen(false);
    focusInDrawer("#drawer-title");
    showToast("Issue ignored. It stays in your evidence log with your reason.");
  };

  // Arrow-key navigation between site tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + SITE_TABS.length) % SITE_TABS.length;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Sites", href: orgSlug ? `/${orgSlug}/sites` : "/sites" },
        { label: displayName, href: siteHref },
        { label: SITE_TABS[tab] },
      ]}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="m-0 font-serif text-[36px] leading-10 font-normal sm:text-[42px] sm:leading-[46px]">
            {displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-5 text-muted">
            <a href={rootUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
              {rootHost}
              <Icon d={I.external} size={14} />
              <span className="sr-only">(opens in new tab)</span>
            </a>
            <span className="capitalize">{platform}</span>
            <span>{clientName}</span>
            {isVerified ? (
              <span className="inline-flex items-center gap-1 font-medium text-ok">
                <Icon d={I.fixed} />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-mod">
                <Icon d={I.moderate} />
                Pending verification
              </span>
            )}
            <span>Last scan 14 Oct, 09:12</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="ease-ui h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle"
          >
            Download report
          </button>
          <Link
            href={scanHref}
            className="ease-ui flex h-10 items-center gap-2 rounded-full border-0 bg-primary px-4 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
          >
            <Icon d={I.refresh} strokeWidth={2} />
            Scan now
          </Link>
        </div>
      </div>

      {/* Mobile: site tabs become a "Site menu" select (spec 7.1). */}
      <div className="mt-6 mb-6 md:hidden">
        <label htmlFor="site-menu" className="mb-1.5 block text-sm font-semibold">
          Site menu
        </label>
        <select
          id="site-menu"
          value={tab}
          onChange={(e) => setTab(Number(e.target.value))}
          className="h-11 w-full rounded border border-line-strong bg-surface px-3 text-base text-ink"
        >
          {SITE_TABS.map((l, i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div
        role="tablist"
        aria-label="Site sections"
        className="mt-6 mb-8 hidden gap-1 overflow-x-auto border-b border-line md:flex"
      >
        {SITE_TABS.map((l, i) => {
          const on = i === tab;
          return (
            <button
              key={l}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`stab-${i}`}
              aria-selected={on}
              aria-controls="site-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(i)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`ease-ui flex-none border-0 bg-transparent px-3 py-2.5 text-sm leading-5 ${
                on
                  ? "font-semibold text-ptext shadow-[inset_0_-2px_0_var(--primary)]"
                  : "font-medium text-muted hover:text-ink"
              }`}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div id="site-panel" role="tabpanel" aria-labelledby={`stab-${tab}`}>
        {tab === 0 && (
          <OverviewTab
            active={active}
            fixed={fixed}
            fixedCount={8 + (fixed.length - RECENTLY_FIXED.length)}
            trend={initialOverview?.trend}
            trendSummary={initialOverview?.trendSummary}
            score={initialOverview?.score ?? initialSite?.score}
            diffSummary={initialOverview?.diffSummary}
            severityCounts={initialOverview?.severityCounts}
            coverage={initialOverview?.coverage}
            verificationStatus={
              initialSite?.status === "active"
                ? "Active (verified)"
                : initialSite?.status === "pending_verification"
                  ? "Pending verification"
                  : undefined
            }
            onOpen={openIssue}
            goIssues={() => setTab(1)}
          />
        )}
        {tab === 1 && (
          <IssuesTab
            active={active}
            selected={selected}
            setSelected={setSelected}
            onOpen={openIssue}
            onRecheckSelected={() => {
              const n = selected.length;
              showToast(`Rechecking ${n} ${n === 1 ? "issue" : "issues"}. We’ll update the list when it’s done.`);
              setSelected([]);
            }}
            onIgnoreSelected={() => {
              const n = selected.length;
              setIssues((prev) =>
                prev.map((i) =>
                  selected.includes(i.id)
                    ? { ...i, status: "ignored" as const, ignoreReason: "Accepted risk" }
                    : i,
                ),
              );
              setSelected([]);
              showToast(`Ignored ${n} ${n === 1 ? "issue" : "issues"}. They remain in your evidence log.`);
            }}
          />
        )}
        {tab === 2 && (
          <ScansTab
            orgSlug={orgSlug || "default"}
            siteSlug={siteSlug || "oakhaus"}
            scans={initialScans}
            onTriggerScan={() => {
              showToast("New manual scan queued. Navigating to live progress...");
              setTimeout(() => {
                window.location.href = scanHref;
              }, 1200);
            }}
          />
        )}
        {tab > 2 && (
          <div className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
            {SITE_TABS[tab]} is not part of this design pass. Overview, Issues, and Scans are interactive.
          </div>
        )}
      </div>

      <IssueDrawer
        issue={current}
        rechecking={rechecking}
        modalOpen={ignoreOpen}
        onClose={closeDrawer}
        onExited={onDrawerExited}
        onRecheck={recheck}
        onIgnore={() => setIgnoreOpen(true)}
        onReopen={() => current && setIssue(current.id, { status: "open" })}
        siteHref={siteHref}
      />
      {ignoreOpen && <IgnoreDialog onCancel={closeIgnore} onConfirm={confirmIgnore} />}
      <Toast
        message={toast}
        onClose={() => setToast(null)}
        onPause={() => clearTimeout(toastTimer.current)}
        onResume={startToastTimer}
      />
    </AppShell>
  );
}
