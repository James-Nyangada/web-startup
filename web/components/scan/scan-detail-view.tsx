"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { SEV, SEVERITIES } from "@/lib/severity";
import { BandBadge, SeverityBadge, StatusBadge } from "@/components/badges";
import { ScanProgressBar } from "./scan-progress-bar";
import { ScanPhaseStepper } from "./scan-phase-stepper";
import {
  useScanProgress,
  type ScanRecord,
  type ScanDiffItem,
  type ScanDiffState,
  type ScanFailureHint,
} from "@/lib/use-scan-progress";
import { apiClient } from "@/lib/api";
import { appApi } from "@/lib/app-api";

const CARD = "rounded-2xl border border-line bg-surface p-6 shadow-card";

interface PageResultItem {
  id?: string;
  url: string;
  templateKey?: string;
  title?: string | null;
  status: string;
  httpStatus?: number | null;
  loadMs?: number | null;
  violations?: number;
  passes?: number;
  incomplete?: number;
  score?: number | null;
}



interface ScanDetailViewProps {
  orgSlug: string;
  siteSlug: string;
  scanId: string;
  initialScan?: ScanRecord | null;
}

export function ScanDetailView({
  orgSlug,
  siteSlug,
  scanId,
  initialScan,
}: ScanDetailViewProps) {
  const [siteName, setSiteName] = useState("Site");
  const [rootUrl, setRootUrl] = useState<string | undefined>();

  useEffect(() => {
    appApi
      .getSite(orgSlug, siteSlug)
      .then((d) => {
        setSiteName(d.site.name);
        setRootUrl(d.site.rootUrl);
      })
      .catch(() => {});
  }, [orgSlug, siteSlug]);

  const {
    scan,
    status,
    phase,
    pagesScanned,
    pagesPlanned,
    currentUrl,
    score,
    counts,
    diff: liveDiff,
    hint: liveHint,
    errorCode,
    errorMessage,
    isLive,
    isPolling,
    announcement,
  } = useScanProgress(orgSlug, scanId, initialScan);

  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [activeDiffTab, setActiveDiffTab] = useState<"all" | "regressed" | "new" | "fixed">("all");
  const [pagesList, setPagesList] = useState<PageResultItem[]>([]);
  const [loadingPages, setLoadingPages] = useState<boolean>(true);

  const shortId = scanId.slice(0, 8);
  const overviewUrl = `/${orgSlug}/sites/${siteSlug}`;
  const scansUrl = `${overviewUrl}/scans`;
  const issuesUrl = `${overviewUrl}/issues`;

  // Fetch per-page results (Spec S-28: pages table URL, template, status, issues, load time)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoadingPages(true);
        const res = await apiClient<{ pages: PageResultItem[] }>(
          `/v1/orgs/${orgSlug}/scans/${scanId}/pages`,
        );
        if (active) setPagesList(res.pages ?? []);
      } catch {
        if (active) setPagesList([]);
      } finally {
        if (active) setLoadingPages(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [orgSlug, scanId]);

  const handleConfirmCancel = async () => {
    setIsCanceling(true);
    setCancelError(null);
    try {
      await apiClient(`/v1/orgs/${orgSlug}/scans/${scanId}/cancel`, {
        method: "POST",
      });
      setShowCancelModal(false);
    } catch (err: unknown) {
      setCancelError((err as Error).message || "Failed to cancel scan");
    } finally {
      setIsCanceling(false);
    }
  };

  const diff: ScanDiffState = liveDiff || { regressed: [], new: [], fixed: [] };
  const regressedList = diff.regressed || [];
  const newList = diff.new || [];
  const fixedList = diff.fixed || [];

  // Resolve failure reason and "what to do" hint (Spec S-28 & Gate 2)
  const failureHint: ScanFailureHint | null =
    liveHint ||
    (status === "partial"
      ? {
          reason: "Scan completed partially: more than 50% of planned pages failed or timed out.",
          whatToDo:
            "Partial scans never mark issues as fixed to avoid false positives. Review the failed pages below and re-run once the site is responsive.",
        }
      : status === "failed"
        ? {
            reason: errorMessage || "The scan encountered unrecoverable errors while loading pages.",
            whatToDo:
              "Check that your site is online and responsive, verify robots.txt permissions for PlainsightBot, and retry the scan.",
          }
        : null);

  const getIssueUrl = (issueId: string) =>
    orgSlug ? `/${orgSlug}/sites/${siteSlug}/issues/${issueId}` : `/sites/${siteSlug}/issues/${issueId}`;

  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Sites", href: "/sites" },
        { label: siteName, href: overviewUrl },
        { label: "Scans", href: scansUrl },
        { label: `Scan #${shortId}` },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* Top bar with back link, title, and actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Link
              href={overviewUrl}
              className="inline-flex items-center gap-1.5 text-sm text-muted no-underline hover:text-ink"
            >
              <Icon d={I.chevronLeft} size={14} />
              Back to {siteName}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 font-serif text-[32px] font-normal leading-tight text-ink">
                Scan #{shortId}
              </h1>
              {/* Trigger Badge */}
              <span className="rounded-full bg-subtle px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted">
                {scan?.trigger || "manual"}
              </span>
              <span className="rounded-full bg-subtle px-3 py-0.5 text-xs font-medium text-muted">
                {scan?.standard?.toUpperCase() || "WCAG 2.2 AA"}
              </span>
            </div>
            {rootUrl && (
              <a
                href={rootUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
              >
                {rootUrl}
                <Icon d={I.external} size={12} />
              </a>
            )}
          </div>

          {/* Connection status indicator & Cancel button */}
          <div className="flex items-center gap-3">
            {isLive ? (
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  isPolling ? "bg-amber-500/10 text-amber-600" : "bg-ok-soft text-ok"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    isPolling ? "bg-amber-500" : "bg-ok animate-pulse"
                  }`}
                />
                {isPolling ? "Live (Polling 5s)" : "Live progress"}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-subtle px-3 py-1 text-xs font-semibold text-muted">
                <span className="size-2 rounded-full bg-muted" />
                Finished
              </div>
            )}

            {isLive && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="ease-ui inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-crit hover:border-crit hover:bg-crit-soft"
              >
                <Icon d={I.close} size={12} />
                Cancel scan
              </button>
            )}

            {!isLive && (
              <div className="flex items-center gap-2">
                <Link
                  href={issuesUrl}
                  className="ease-ui rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink no-underline hover:bg-subtle"
                >
                  View issues
                </Link>
                <a
                  href={`/api/v1/orgs/${orgSlug}/scans/${scanId}/raw`}
                  target="_blank"
                  rel="noreferrer"
                  className="ease-ui rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted no-underline hover:bg-subtle hover:text-ink"
                >
                  Raw JSON
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Phase Stepper */}
        <div className={CARD}>
          <ScanPhaseStepper
            phase={phase}
            status={status}
            pagesScanned={pagesScanned}
            pagesPlanned={pagesPlanned}
          />
        </div>

        {/* Live Progress Bar (while running) */}
        {isLive && (
          <div className={CARD}>
            <ScanProgressBar
              phase={phase}
              status={status}
              pagesScanned={pagesScanned}
              pagesPlanned={pagesPlanned}
              currentUrl={currentUrl}
              announcement={announcement}
              isLive={isLive}
            />
            <p className="mt-4 mb-0 text-xs text-muted">
              You can leave this page; we’ll email you when the scan completes.
            </p>
          </div>
        )}

        {/* S-28 & Gate 2: Partial Scan Explanation with Reason & "What to do" Hint */}
        {status === "partial" && failureHint && (
          <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 p-6 shadow-card">
            <div className="flex items-start gap-4">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-amber-500 text-on-primary">
                <Icon d={I.alert} size={20} />
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="m-0 text-base font-bold text-amber-700 dark:text-amber-400">
                    Partial scan completed
                  </h3>
                  {errorCode && (
                    <span className="font-mono text-xs text-muted">({errorCode})</span>
                  )}
                </div>
                <p className="m-0 text-sm font-semibold text-ink">
                  {failureHint.reason}
                </p>
                <p className="m-0 text-xs leading-relaxed text-muted">
                  <strong className="text-ink">What to do: </strong>
                  {failureHint.whatToDo}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href={overviewUrl}
                    className="ease-ui rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary no-underline hover:bg-primary-hover"
                  >
                    Return to overview
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* S-28 & Gate 2: Failed Scan Explanation with Reason & "What to do" Hint */}
        {status === "failed" && failureHint && (
          <div className="rounded-2xl border-2 border-crit/30 bg-crit-soft/20 p-6 shadow-card">
            <div className="flex items-start gap-4">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-crit text-on-primary">
                <Icon d={I.close} size={20} />
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="m-0 text-base font-bold text-crit">
                    Scan failed to complete
                  </h3>
                  {errorCode && (
                    <span className="font-mono text-xs text-muted">({errorCode})</span>
                  )}
                </div>
                <p className="m-0 text-sm font-semibold text-ink">
                  {failureHint.reason}
                </p>
                <p className="m-0 text-xs leading-relaxed text-muted">
                  <strong className="text-ink">What to do: </strong>
                  {failureHint.whatToDo}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href={overviewUrl}
                    className="ease-ui rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary no-underline hover:bg-primary-hover"
                  >
                    Return to overview
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canceled Notification */}
        {status === "canceled" && (
          <div className={`${CARD} border-line bg-subtle/40`}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-line text-muted">
                <Icon d={I.stop} size={18} />
              </span>
              <div>
                <h3 className="m-0 text-base font-semibold text-ink">Scan was canceled</h3>
                <p className="m-0 text-sm text-muted">
                  The scan was stopped. Any pages scanned up to cancellation are recorded in scan history.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Card (when completed or partial) */}
        {(status === "completed" || status === "partial") && (
          <div className="flex flex-col gap-6">
            {/* Score & Counts Breakdown */}
            <div className={`${CARD} grid grid-cols-1 items-center gap-6 md:grid-cols-3`}>
              {/* Score Display */}
              <div className="flex flex-col gap-2 border-b border-line pb-6 md:border-b-0 md:border-r md:pr-6 md:pb-0">
                <span className="text-sm font-semibold text-muted">Automated check score</span>
                <div className="flex items-baseline gap-3">
                  <span className="tnum font-serif text-[48px] font-bold tracking-tight text-ink">
                    {score != null ? score : "-"}
                  </span>
                  <span className="text-lg text-muted">/ 100</span>
                  <BandBadge score={score ?? null} />
                </div>
                <span className="text-xs text-muted">
                  Checked {pagesScanned} of {pagesPlanned} pages
                </span>
              </div>

              {/* Counts Breakdown by Severity */}
              <div className="col-span-2 flex flex-col gap-3">
                <span className="text-sm font-semibold text-muted">Open problems by severity</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {SEVERITIES.map((k) => {
                    const n = counts?.[k] ?? 0;
                    return (
                      <div
                        key={k}
                        title={SEV[k].tip}
                        className={`flex flex-col gap-1 rounded-xl border p-3 ${
                          n ? `border-transparent ${SEV[k].bg} ${SEV[k].text}` : "border-line bg-subtle text-muted"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 text-[13px] leading-5 font-semibold">
                          <Icon d={SEV[k].icon} />
                          {SEV[k].label}
                        </span>
                        <span className="tnum text-2xl leading-8 font-bold">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* S-28 Comparison with previous: Regressed first, New, Fixed */}
            <div className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h3 className="m-0 text-base font-bold text-ink">
                    Comparison with previous scan
                  </h3>
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    New, fixed, and regressed issues detected between scans (Regressions listed first)
                  </p>
                </div>

                {/* Filter tabs: All, Regressed, New, Fixed */}
                <div className="flex items-center gap-1.5" role="group" aria-label="Filter changes">
                  <button
                    type="button"
                    onClick={() => setActiveDiffTab("all")}
                    aria-pressed={activeDiffTab === "all"}
                    className={`ease-ui h-8 rounded-full border px-3 text-xs font-semibold ${
                      activeDiffTab === "all"
                        ? "border-ptext bg-ptext text-surface"
                        : "border-line-strong bg-surface text-ink hover:bg-subtle"
                    }`}
                  >
                    All changes ({regressedList.length + newList.length + fixedList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDiffTab("regressed")}
                    aria-pressed={activeDiffTab === "regressed"}
                    className={`ease-ui h-8 rounded-full border px-3 text-xs font-semibold ${
                      activeDiffTab === "regressed"
                        ? "border-crit bg-crit text-on-primary"
                        : "border-line-strong bg-surface text-crit hover:bg-crit-soft"
                    }`}
                  >
                    Regressed ({regressedList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDiffTab("new")}
                    aria-pressed={activeDiffTab === "new"}
                    className={`ease-ui h-8 rounded-full border px-3 text-xs font-semibold ${
                      activeDiffTab === "new"
                        ? "border-mod bg-mod text-surface"
                        : "border-line-strong bg-surface text-mod hover:bg-mod-soft"
                    }`}
                  >
                    New ({newList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDiffTab("fixed")}
                    aria-pressed={activeDiffTab === "fixed"}
                    className={`ease-ui h-8 rounded-full border px-3 text-xs font-semibold ${
                      activeDiffTab === "fixed"
                        ? "border-ok bg-ok text-on-primary"
                        : "border-line-strong bg-surface text-ok hover:bg-ok-soft"
                    }`}
                  >
                    Fixed ({fixedList.length})
                  </button>
                </div>
              </div>

              {/* Diff Content Lists */}
              <div className="mt-4 flex flex-col gap-6">
                {/* 1. REGRESSED ISSUES LIST FIRST (Spec S-28 requirement) */}
                {(activeDiffTab === "all" || activeDiffTab === "regressed") &&
                  regressedList.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-5 place-items-center rounded-full bg-crit text-xs font-bold text-on-primary">
                          ⟲
                        </span>
                        <h4 className="m-0 text-sm font-bold text-crit">
                          Regressed issues ({regressedList.length})
                        </h4>
                        <span className="text-xs text-muted">Issues previously fixed that reappeared</span>
                      </div>
                      <div className="divide-y divide-line rounded-xl border border-crit/30 bg-crit-soft/10">
                        {regressedList.map((item) => (
                          <Link
                            key={item.id}
                            href={getIssueUrl(item.id)}
                            className="group flex flex-wrap items-center justify-between gap-3 p-3.5 no-underline hover:bg-crit-soft/30"
                          >
                            <div className="flex items-center gap-3">
                              <SeverityBadge sev={item.impact as any} />
                              <div>
                                <span className="font-semibold text-ink group-hover:text-primary group-hover:underline">
                                  {item.title}
                                </span>
                                <span className="block text-xs text-muted">
                                  Template: {item.templateKey} · Selector:{" "}
                                  <code className="font-mono text-[11px]">{item.selector}</code>
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-crit-soft px-2 py-0.5 text-xs font-bold text-crit">
                                Regressed {item.regressionCount ?? 1}x
                              </span>
                              <Icon d={I.chevronRight} size={14} className="text-muted" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                {/* 2. NEW ISSUES LIST */}
                {(activeDiffTab === "all" || activeDiffTab === "new") && newList.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded-full bg-mod text-xs font-bold text-surface">
                        +
                      </span>
                      <h4 className="m-0 text-sm font-bold text-mod">
                        New issues ({newList.length})
                      </h4>
                      <span className="text-xs text-muted">First seen in this scan</span>
                    </div>
                    <div className="divide-y divide-line rounded-xl border border-mod/30 bg-mod-soft/10">
                      {newList.map((item) => (
                        <Link
                          key={item.id}
                          href={getIssueUrl(item.id)}
                          className="group flex flex-wrap items-center justify-between gap-3 p-3.5 no-underline hover:bg-mod-soft/30"
                        >
                          <div className="flex items-center gap-3">
                            <SeverityBadge sev={item.impact as any} />
                            <div>
                              <span className="font-semibold text-ink group-hover:text-primary group-hover:underline">
                                {item.title}
                              </span>
                              <span className="block text-xs text-muted">
                                Template: {item.templateKey} · Selector:{" "}
                                <code className="font-mono text-[11px]">{item.selector}</code>
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-mod-soft px-2 py-0.5 text-xs font-bold text-mod">
                              {item.occurrenceCount ?? 1} occurrences
                            </span>
                            <Icon d={I.chevronRight} size={14} className="text-muted" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. FIXED ISSUES LIST */}
                {(activeDiffTab === "all" || activeDiffTab === "fixed") && fixedList.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded-full bg-ok text-xs font-bold text-on-primary">
                        ✓
                      </span>
                      <h4 className="m-0 text-sm font-bold text-ok">
                        Fixed issues ({fixedList.length})
                      </h4>
                      <span className="text-xs text-muted">Resolved in this scan</span>
                    </div>
                    <div className="divide-y divide-line rounded-xl border border-ok/30 bg-ok-soft/10">
                      {fixedList.map((item) => (
                        <Link
                          key={item.id}
                          href={getIssueUrl(item.id)}
                          className="group flex flex-wrap items-center justify-between gap-3 p-3.5 no-underline hover:bg-ok-soft/30"
                        >
                          <div className="flex items-center gap-3">
                            <span className="grid size-6 place-items-center rounded-full bg-ok/20 text-xs font-bold text-ok">
                              ✓
                            </span>
                            <div>
                              <span className="font-semibold text-ink group-hover:text-primary group-hover:underline">
                                {item.title}
                              </span>
                              <span className="block text-xs text-muted">
                                Template: {item.templateKey}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok">
                              Fixed
                            </span>
                            <Icon d={I.chevronRight} size={14} className="text-muted" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State for Selected Diff Filter */}
                {activeDiffTab === "regressed" && regressedList.length === 0 && (
                  <p className="my-4 text-center text-sm text-muted">
                    No regressions were detected in this scan. Great work!
                  </p>
                )}
                {activeDiffTab === "new" && newList.length === 0 && (
                  <p className="my-4 text-center text-sm text-muted">
                    No new accessibility issues were found in this scan.
                  </p>
                )}
                {activeDiffTab === "fixed" && fixedList.length === 0 && (
                  <p className="my-4 text-center text-sm text-muted">
                    No issues were resolved in this scan.
                  </p>
                )}
              </div>
            </div>

            {/* S-28 Scanned Pages Table */}
            <div className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h3 className="m-0 text-base font-bold text-ink">Scanned pages</h3>
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    Results per scanned page, load times, violations, and individual page scores
                  </p>
                </div>
                <span className="text-xs text-muted">
                  Showing {pagesList.length} pages
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Pages tested in this scan</caption>
                  <thead>
                    <tr className="border-b border-line text-xs font-semibold text-muted">
                      <th scope="col" className="py-2.5 pr-4">
                        URL
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Template
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Load time
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Violations
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Passes
                      </th>
                      <th scope="col" className="py-2.5 pl-3">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {pagesList.map((page, idx) => (
                      <tr key={page.url + idx} className="hover:bg-subtle/40">
                        <td className="py-3 pr-4">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-ink hover:text-primary hover:underline"
                          >
                            {page.url}
                            <Icon d={I.external} size={11} className="text-muted" />
                          </a>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-muted">
                            {page.templateKey || "page"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              page.status === "ok"
                                ? "bg-ok-soft text-ok"
                                : page.status === "timeout"
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-crit-soft text-crit"
                            }`}
                          >
                            {page.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted">
                          {page.loadMs ? `${page.loadMs}ms` : "-"}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-crit">
                          {page.violations ?? 0}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-ok">
                          {page.passes ?? 0}
                        </td>
                        <td className="py-3 pl-3">
                          {page.score != null ? (
                            <span className="tnum font-serif text-sm font-bold text-ink">
                              {page.score}
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
              <h2 id="cancel-title" className="m-0 text-lg font-bold text-ink">
                Cancel active scan?
              </h2>
              <p className="mt-2 text-sm text-muted">
                Are you sure you want to stop this scan? Scanned page results will be preserved, but
                remaining pages will not be checked.
              </p>

              {cancelError && (
                <div className="mt-3 rounded-lg bg-crit-soft p-3 text-xs text-crit">
                  {cancelError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isCanceling}
                  onClick={() => setShowCancelModal(false)}
                  className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle"
                >
                  Keep running
                </button>
                <button
                  type="button"
                  disabled={isCanceling}
                  onClick={() => void handleConfirmCancel()}
                  className="ease-ui inline-flex items-center gap-2 rounded-full bg-crit px-4 py-2 text-sm font-semibold text-on-primary hover:bg-crit/90"
                >
                  {isCanceling && <Icon d={I.loader} className="animate-spin" size={14} />}
                  Yes, cancel scan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
