"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { BandBadge, SeverityBadge } from "@/components/badges";
import { ScanProgressBar } from "./scan-progress-bar";
import { ScanPhaseStepper } from "./scan-phase-stepper";
import { useScanProgress, type ScanRecord } from "@/lib/use-scan-progress";
import { apiClient } from "@/lib/api";

const CARD = "rounded-2xl border border-line bg-surface p-6 shadow-card";

interface ScanDetailViewProps {
  orgSlug: string;
  siteSlug: string;
  scanId: string;
  initialScan?: ScanRecord | null;
  siteName?: string;
  rootUrl?: string;
}

export function ScanDetailView({
  orgSlug,
  siteSlug,
  scanId,
  initialScan,
  siteName = "Site",
  rootUrl,
}: ScanDetailViewProps) {
  const {
    scan,
    status,
    phase,
    pagesScanned,
    pagesPlanned,
    currentUrl,
    score,
    counts,
    errorCode,
    errorMessage,
    isLive,
    isPolling,
    announcement,
  } = useScanProgress(orgSlug, scanId, initialScan);

  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const isTerminal = ["completed", "partial", "failed", "canceled"].includes(status);
  const shortId = scanId.slice(0, 8);

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

  const overviewUrl = orgSlug ? `/${orgSlug}/sites/${siteSlug}` : `/sites/${siteSlug}`;
  const issuesUrl = `${overviewUrl}?tab=issues`;

  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Sites", href: "/sites" },
        { label: siteName, href: overviewUrl },
        { label: "Scans", href: overviewUrl },
        { label: `Scan #${shortId}` },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* Top bar with back link and title */}
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
              <h1 className="m-0 font-serif text-[32px] font-normal leading-tight">
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
                className="inline-flex items-center gap-1 text-sm text-muted"
              >
                {rootUrl}
                <Icon d={I.external} size={12} />
              </a>
            )}
          </div>

          {/* Connection status indicator */}
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

        {/* Failure Explanation */}
        {status === "failed" && (
          <div className={`${CARD} border-crit/30 bg-crit-soft/20`}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-crit text-on-primary">
                <Icon d={I.close} size={20} />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="m-0 text-base font-semibold text-crit">Scan failed to complete</h3>
                <p className="m-0 text-sm text-ink">
                  {errorMessage || "An unexpected error occurred during execution."}
                </p>
                {errorCode && (
                  <span className="mt-1 font-mono text-xs text-muted">Error code: {errorCode}</span>
                )}
                <div className="mt-4 flex gap-3">
                  <Link
                    href={overviewUrl}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
                  >
                    Return to overview
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Card (when completed or partial) */}
        {(status === "completed" || status === "partial") && (
          <div className="flex flex-col gap-6">
            {/* Score & Summary Banner */}
            <div className={`${CARD} grid grid-cols-1 items-center gap-6 md:grid-cols-3`}>
              {/* Score Display */}
              <div className="flex flex-col gap-2 border-b border-line pb-6 md:border-b-0 md:border-r md:pr-6 md:pb-0">
                <span className="text-sm font-semibold text-muted">Automated check score</span>
                <div className="flex items-baseline gap-3">
                  <span className="tnum font-serif text-[48px] font-bold tracking-tight text-ink">
                    {score != null ? score : "—"}
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
                  <div className="flex flex-col gap-1 rounded-xl bg-crit-soft/60 p-3">
                    <SeverityBadge sev="critical" />
                    <span className="tnum text-2xl font-bold text-crit">
                      {counts?.critical ?? 0}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl bg-ser-soft/60 p-3">
                    <SeverityBadge sev="serious" />
                    <span className="tnum text-2xl font-bold text-ser">
                      {counts?.serious ?? 0}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl bg-mod-soft/60 p-3">
                    <SeverityBadge sev="moderate" />
                    <span className="tnum text-2xl font-bold text-mod">
                      {counts?.moderate ?? 0}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl bg-min-soft/60 p-3">
                    <SeverityBadge sev="minor" />
                    <span className="tnum text-2xl font-bold text-min">
                      {counts?.minor ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scan Diff Section (New, Fixed, Regressed) */}
            <div className={CARD}>
              <h3 className="m-0 mb-4 text-base font-semibold text-ink">Changes since last scan</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl border border-line p-4">
                  <span className="grid size-8 place-items-center rounded-full bg-mod-soft text-mod font-bold">
                    +
                  </span>
                  <div>
                    <span className="tnum block text-xl font-bold text-ink">{counts?.new ?? 0}</span>
                    <span className="text-xs text-muted">New issues discovered</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-line p-4">
                  <span className="grid size-8 place-items-center rounded-full bg-ok-soft text-ok font-bold">
                    ✓
                  </span>
                  <div>
                    <span className="tnum block text-xl font-bold text-ok">{counts?.fixed ?? 0}</span>
                    <span className="text-xs text-muted">Issues marked fixed</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-line p-4">
                  <span className="grid size-8 place-items-center rounded-full bg-crit-soft text-crit font-bold">
                    ⟲
                  </span>
                  <div>
                    <span className="tnum block text-xl font-bold text-crit">{counts?.regressed ?? 0}</span>
                    <span className="text-xs text-muted">Regressions detected</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6">
                <Link
                  href={issuesUrl}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
                >
                  <Icon d={I.layout} size={16} />
                  View all issues
                </Link>
                <Link
                  href={overviewUrl}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-subtle"
                >
                  Back to Site
                </Link>
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
