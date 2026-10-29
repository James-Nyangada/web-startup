"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { OverviewTab } from "./overview-tab";
import { IssuesTab, type BulkRequest } from "./issues-tab";
import { ScansTab, type ScanHistoryItem } from "./scans-tab";
import { PagesTab } from "./pages-tab";
import { ReportsTab } from "./reports-tab";
import { EvidenceTab } from "./evidence-tab";
import { ManualChecksTab } from "./manual-checks-tab";
import { StatementTab } from "./statement-tab";
import { SettingsTab } from "./settings-tab";
import { IssueDrawer } from "./issue-drawer";
import { IgnoreDialog } from "./ignore-dialog";
import { Toast } from "./toast";
import { SITE_TABS, type Issue } from "@/lib/site-data";
import { ApiException } from "@/lib/api";
import {
  appApi,
  formatDay,
  formatDayTime,
  loadIssue,
  platformLabel,
  recheckAndWait,
  recheckMessage,
  toIssue,
  type ApiMember,
  type ApiSiteDetail,
} from "@/lib/app-api";

export interface SiteWorkspaceProps {
  startTab?: number;
  orgSlug: string;
  siteId: string;
}

/** S-24 Site overview · S-25 Issues · S-26 Issue drawer - interactive flow F-04 (triage and fix). */
export function SiteWorkspace({
  startTab = 0,
  orgSlug,
  siteId,
}: SiteWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState(startTab);
  const [detail, setDetail] = useState<ApiSiteDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Issue | null>(null);
  const [ignoreTargets, setIgnoreTargets] = useState<string[] | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [startingScan, setStartingScan] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ignoreOpen = ignoreTargets !== null;

  const site = detail?.site;
  const siteHref = `/${orgSlug}/sites/${siteId}`;

  const startToastTimer = useCallback(() => {
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const showToast = useCallback(
    (t: string) => {
      setToast(t);
      startToastTimer();
    },
    [startToastTimer],
  );
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const errorText = (err: unknown, fallback: string) =>
    err instanceof ApiException ? err.message : fallback;

  // Site detail (score, trend, top issues, counts) - reloaded after every change.
  useEffect(() => {
    let cancelled = false;
    appApi
      .getSite(orgSlug, siteId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiException && err.status === 404
            ? "This site doesn’t exist or you don’t have access to it."
            : errorText(err, "Could not load this site."),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, siteId, refreshKey]);

  useEffect(() => {
    appApi
      .listMembers(orgSlug)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [orgSlug]);

  useEffect(() => {
    if (tab !== 2) return;
    appApi
      .listScans(orgSlug, siteId)
      .then(setScans)
      .catch(() => setScans([]));
  }, [orgSlug, siteId, tab, refreshKey]);

  // Drawer content
  useEffect(() => {
    if (!openId) {
      setCurrent(null);
      return;
    }
    let cancelled = false;
    loadIssue(orgSlug, openId)
      .then((issue) => {
        if (!cancelled) setCurrent(issue);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOpenId(null);
        showToast(errorText(err, "Could not open this issue."));
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, openId, refreshKey, showToast]);

  const refresh = () => setRefreshKey((k) => k + 1);

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

  /** Queues issue.recheck jobs and waits for the worker to record each outcome (P2-14). */
  const recheckIssues = async (ids: string[]) => {
    showToast(
      `Rechecking ${ids.length === 1 ? "this issue" : `${ids.length} issues`}…`,
    );
    try {
      const outcomes = await recheckAndWait(orgSlug, ids);
      showToast(recheckMessage(outcomes, ids.length));
    } catch (err) {
      showToast(errorText(err, "Could not start the recheck."));
    }
    refresh();
  };

  const recheck = async () => {
    if (!current) return;
    setRechecking(true);
    await recheckIssues([current.id]);
    setRechecking(false);
  };

  const focusInDrawer = (sel: string) =>
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(sel) ??
        document.getElementById("drawer-title")
      )?.focus(),
    );
  const closeIgnore = () => {
    setIgnoreTargets(null);
    if (openId) focusInDrawer("[data-ignore-btn]");
  };
  const confirmIgnore = async (reason: string, note?: string) => {
    const targets = ignoreTargets ?? [];
    setIgnoreTargets(null);
    try {
      if (targets.length === 1)
        await appApi.ignore(orgSlug, targets[0]!, reason, note);
      else
        await appApi.bulk(orgSlug, {
          issueIds: targets,
          action: "ignore",
          data: { reason, note },
        });
      setSelected((s) => s.filter((id) => !targets.includes(id)));
      showToast(
        targets.length === 1
          ? "Issue ignored. It stays in your evidence log with your reason."
          : `Ignored ${targets.length} issues. They remain in your evidence log.`,
      );
      refresh();
    } catch (err) {
      showToast(errorText(err, "Could not ignore the issue."));
    }
    if (openId) focusInDrawer("#drawer-title");
  };

  const reopen = async () => {
    if (!current) return;
    try {
      await appApi.unignore(orgSlug, current.id);
      showToast("Issue reopened.");
      refresh();
    } catch (err) {
      showToast(errorText(err, "Could not reopen the issue."));
    }
  };

  const assign = async (assigneeId: string | null) => {
    if (!current) return;
    try {
      await appApi.assign(orgSlug, current.id, assigneeId);
      refresh();
    } catch (err) {
      showToast(errorText(err, "Could not change the assignee."));
    }
  };

  const setDue = async (dueDate: string | null) => {
    if (!current) return;
    try {
      await appApi.setDueDate(orgSlug, current.id, dueDate);
      refresh();
    } catch (err) {
      showToast(errorText(err, "Could not set the due date."));
    }
  };

  const onBulk = async (request: BulkRequest) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (request.action === "ignore") {
      setIgnoreTargets(ids);
      return;
    }
    if (request.action === "recheck") {
      setSelected([]);
      await recheckIssues(ids);
      return;
    }
    try {
      const data =
        request.action === "assign"
          ? { assigneeId: request.assigneeId }
          : { dueDate: request.dueDate };
      await appApi.bulk(orgSlug, {
        issueIds: ids,
        action: request.action,
        data,
      });
      showToast(
        `Updated ${ids.length} ${ids.length === 1 ? "issue" : "issues"}.`,
      );
      setSelected([]);
      refresh();
    } catch (err) {
      showToast(errorText(err, "Could not update the selected issues."));
    }
  };

  const scanNow = async () => {
    setStartingScan(true);
    try {
      const scan = await appApi.startScan(orgSlug, siteId);
      router.push(`${siteHref}/scans/${scan.id}`);
    } catch (err) {
      showToast(errorText(err, "Could not start a scan."));
      setStartingScan(false);
    }
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

  if (loadError && !detail) {
    return (
      <AppShell
        active="sites"
        crumbs={[
          { label: "Sites", href: `/${orgSlug}/sites` },
          { label: "Site" },
        ]}
      >
        <div
          role="alert"
          className="rounded-2xl border border-line bg-surface px-6 py-12 text-center"
        >
          <h1 className="m-0 text-xl font-semibold">{loadError}</h1>
          <button
            type="button"
            onClick={refresh}
            className="ease-ui mt-4 h-10 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-subtle"
          >
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  if (!detail || !site) {
    return (
      <AppShell
        active="sites"
        crumbs={[
          { label: "Sites", href: `/${orgSlug}/sites` },
          { label: "Loading…" },
        ]}
      >
        <div
          role="status"
          className="px-6 py-12 text-center text-sm text-muted"
        >
          Loading site…
        </div>
      </AppShell>
    );
  }

  const displayName = site.name;
  const rootUrl = site.rootUrl;
  const rootHost = rootUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const isVerified = site.status !== "pending_verification";
  const topIssues = detail.topIssues.map((i) => toIssue(i));
  const recentlyFixed = detail.recentlyFixed.map(
    (f) => [f.title, formatDay(f.fixedAt)] as [string, string],
  );
  const lastScanText = detail.latestScanSummary
    ? `Last scan ${formatDayTime(detail.latestScanSummary.finishedAt ?? site.updatedAt)}`
    : "Not scanned yet";

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
            <a
              href={rootUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
            >
              {rootHost}
              <Icon d={I.external} size={14} />
              <span className="sr-only">(opens in new tab)</span>
            </a>
            <span>{platformLabel(site.platform)}</span>
            {site.clientName && <span>Client: {site.clientName}</span>}
            {site.status === "paused" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
                Paused
              </span>
            )}
            {isVerified ? (
              <span className="inline-flex items-center gap-1 font-medium text-ok">
                <Icon d={I.fixed} />
                Verified
              </span>
            ) : (
              <a
                href={`${siteHref}/verify`}
                className="inline-flex items-center gap-1 font-medium text-mod"
              >
                <Icon d={I.moderate} />
                Verify site ownership to enable monitoring
              </a>
            )}
            <span>{lastScanText}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTab(4)}
            className="ease-ui h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle"
          >
            Download report
          </button>
          <button
            type="button"
            onClick={scanNow}
            disabled={startingScan || site.status === "paused"}
            title={site.status === "paused" ? "Site is paused" : undefined}
            className="ease-ui flex h-10 items-center gap-2 rounded-full border-0 bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Icon d={I.refresh} strokeWidth={2} />
            {startingScan
              ? "Starting…"
              : site.status === "paused"
                ? "Paused"
                : "Scan now"}
          </button>
        </div>
      </div>

      {site.status === "paused" && (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-warn/30 bg-warn/10 p-4 text-ink"
        >
          <div className="flex items-center gap-3">
            <span className="text-warn font-bold">⚠</span>
            <span className="text-sm font-medium">
              This site is paused due to a plan downgrade. Automated scans and
              rechecks are inactive, but all historical data, scans, and reports
              remain safe and accessible.
            </span>
          </div>
          <a
            href="/settings/billing"
            className="ease-ui rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover shadow-card shrink-0"
          >
            Manage plan
          </a>
        </div>
      )}

      {/* Mobile: site tabs become a "Site menu" select (spec 7.1). */}
      <div className="mt-6 mb-6 md:hidden">
        <label
          htmlFor="site-menu"
          className="mb-1.5 block text-sm font-semibold"
        >
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
            active={topIssues}
            fixed={recentlyFixed}
            trend={detail.trend}
            trendSummary={detail.trendSummary}
            score={detail.score}
            diffSummary={detail.diffSummary}
            severityCounts={detail.severityCounts}
            coverage={detail.coverage}
            verificationStatus={
              isVerified ? "Verified" : "Pending verification"
            }
            onOpen={openIssue}
            goIssues={() => setTab(1)}
          />
        )}
        {tab === 1 && (
          <IssuesTab
            orgSlug={orgSlug}
            siteId={siteId}
            members={members}
            refreshKey={refreshKey}
            selected={selected}
            setSelected={setSelected}
            onOpen={openIssue}
            onBulk={onBulk}
          />
        )}
        {tab === 2 && (
          <ScansTab
            orgSlug={orgSlug}
            siteSlug={siteId}
            scans={scans}
            onTriggerScan={scanNow}
            isTriggering={startingScan}
          />
        )}
        {tab === 3 && (
          <PagesTab
            orgSlug={orgSlug}
            siteSlug={siteId}
            siteId={siteId}
            onNavigateToSettings={() => setTab(8)}
            onToast={showToast}
          />
        )}
        {tab === 4 && (
          <ReportsTab
            orgSlug={orgSlug}
            siteSlug={siteId}
            siteId={siteId}
            siteName={displayName}
            onToast={showToast}
          />
        )}
        {tab === 5 && (
          <EvidenceTab
            orgSlug={orgSlug}
            siteId={siteId}
            siteName={displayName}
            onToast={showToast}
          />
        )}
        {tab === 6 && (
          <ManualChecksTab
            orgSlug={orgSlug}
            siteId={siteId}
            siteName={displayName}
            onToast={showToast}
          />
        )}
        {tab === 7 && (
          <StatementTab
            orgSlug={orgSlug}
            siteId={siteId}
            siteName={displayName}
            siteUrl={site.rootUrl}
            onToast={showToast}
          />
        )}
        {tab === 8 && (
          <SettingsTab
            orgSlug={orgSlug}
            siteSlug={siteId}
            siteId={siteId}
            initialSite={site}
            onToast={showToast}
          />
        )}
        {tab > 2 &&
          tab !== 3 &&
          tab !== 4 &&
          tab !== 5 &&
          tab !== 6 &&
          tab !== 7 &&
          tab !== 8 && (
            <div className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
              {SITE_TABS[tab]} is not part of this design pass. Overview,
              Issues, Scans, Pages, Reports, Evidence, Manual checks, Statement,
              and Settings are interactive.
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
        onIgnore={() => current && setIgnoreTargets([current.id])}
        onReopen={reopen}
        siteHref={siteHref}
        orgSlug={orgSlug}
        sitePlatform={site.platform}
        siteRootUrl={site.rootUrl}
        members={members}
        onAssign={assign}
        onSetDue={setDue}
      />
      {ignoreOpen && (
        <IgnoreDialog onCancel={closeIgnore} onConfirm={confirmIgnore} />
      )}
      <Toast
        message={toast}
        onClose={() => setToast(null)}
        onPause={() => clearTimeout(toastTimer.current)}
        onResume={startToastTimer}
      />
    </AppShell>
  );
}
