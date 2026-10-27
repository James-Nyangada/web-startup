"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { BandBadge, ScanStatusBadge } from "@/components/badges";

export interface ScanHistoryItem {
  id: string;
  queuedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  trigger: "scheduled" | "manual" | "onboarding" | "api" | "plugin";
  pagesScanned: number;
  pagesPlanned: number;
  pagesFailed: number;
  score: number | null;
  counts?: {
    critical?: number;
    serious?: number;
    moderate?: number;
    minor?: number;
    new?: number;
    fixed?: number;
    regressed?: number;
  };
  status: "completed" | "partial" | "failed" | "canceled" | "discovering" | "scanning" | "processing" | "queued";
  errorCode?: string | null;
  errorMessage?: string | null;
  hint?: {
    reason: string;
    whatToDo: string;
  } | null;
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

function formatDate(iso: string): { full: string; relative: string } {
  try {
    const d = new Date(iso);
    const full = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const diffHours = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60));
    if (diffHours < 24) {
      if (diffHours <= 1) return { full, relative: "Just now" };
      return { full, relative: `${diffHours} hours ago` };
    }
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return { full, relative: "Yesterday" };
    if (diffDays < 30) return { full, relative: `${diffDays} days ago` };
    return { full, relative: full };
  } catch {
    return { full: iso, relative: iso };
  }
}

interface ScansTabProps {
  orgSlug: string;
  siteSlug: string;
  scans?: ScanHistoryItem[];
  onTriggerScan?: () => void;
  isTriggering?: boolean;
}

export function ScansTab({
  orgSlug,
  siteSlug,
  scans = [],
  onTriggerScan,
  isTriggering = false,
}: ScansTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const [expandedHints, setExpandedHints] = useState<Record<string, boolean>>({});

  const toggleHint = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedHints((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const runningScan = scans.find((s) =>
    ["queued", "discovering", "scanning", "processing"].includes(s.status),
  );

  const filteredScans = scans.filter((s) => {
    if (filter === "completed") return s.status === "completed";
    if (filter === "issues") return s.status === "partial" || s.status === "failed";
    if (filter === "scheduled") return s.trigger === "scheduled";
    if (filter === "manual") return s.trigger === "manual";
    return true;
  });

  const getScanUrl = (scanId: string) =>
    orgSlug ? `/${orgSlug}/sites/${siteSlug}/scans/${scanId}` : `/sites/${siteSlug}/scans/${scanId}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned Running Scan (Spec S-27: running scan pinned at top with live progress) */}
      {runningScan && (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary-soft/30 p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-primary" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="m-0 text-base font-bold text-ink">
                    Scan #{runningScan.id.slice(0, 8)} in progress
                  </h3>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {runningScan.status}
                  </span>
                </div>
                <p className="m-0 mt-0.5 text-sm text-muted">
                  Checked {runningScan.pagesScanned} of {runningScan.pagesPlanned} planned pages ·{" "}
                  Elapsed {formatDuration(runningScan.startedAt)}
                </p>
              </div>
            </div>

            <Link
              href={getScanUrl(runningScan.id)}
              className="ease-ui inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
            >
              <span>View live progress</span>
              <Icon d={I.arrowRight} size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Toolbar: Filters & Manual Scan Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter scans">
          {[
            { id: "all", label: `All scans (${scans.length})` },
            { id: "completed", label: "Completed" },
            { id: "issues", label: "Partial & Failed" },
            { id: "scheduled", label: "Scheduled" },
            { id: "manual", label: "Manual" },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilter(btn.id)}
              className={`ease-ui h-8 rounded-full border px-3 text-xs font-semibold ${
                filter === btn.id
                  ? "border-ptext bg-ptext text-surface"
                  : "border-line-strong bg-surface text-ink hover:bg-subtle"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {onTriggerScan && (
          <button
            type="button"
            disabled={isTriggering || Boolean(runningScan)}
            onClick={onTriggerScan}
            className="ease-ui inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon d={I.refresh} size={14} className={isTriggering ? "animate-spin" : ""} />
            <span>{isTriggering ? "Starting scan..." : "Scan site now"}</span>
          </button>
        )}
      </div>

      {/* S-27 Scans Table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Accessibility scan history</caption>
          <thead>
            <tr className="border-b border-line bg-subtle/50 text-xs font-semibold text-muted">
              <th scope="col" className="px-5 py-3.5">
                Date & time
              </th>
              <th scope="col" className="px-4 py-3.5">
                Trigger
              </th>
              <th scope="col" className="px-4 py-3.5">
                Pages scanned
              </th>
              <th scope="col" className="px-4 py-3.5">
                Score
              </th>
              <th scope="col" className="px-4 py-3.5">
                Changes (diff)
              </th>
              <th scope="col" className="px-4 py-3.5">
                Duration
              </th>
              <th scope="col" className="px-4 py-3.5">
                Status
              </th>
              <th scope="col" className="w-12 px-3 py-3.5">
                <span className="sr-only">View</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredScans.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-sm text-muted">
                  No scans match the current filter.
                </td>
              </tr>
            ) : (
              filteredScans.map((scan) => {
                const date = formatDate(scan.queuedAt);
                const hasProblems = scan.status === "partial" || scan.status === "failed";
                const isHintExpanded = expandedHints[scan.id] ?? hasProblems;
                const scanUrl = getScanUrl(scan.id);

                return (
                  <React.Fragment key={scan.id}>
                    <tr
                      className={`group cursor-pointer transition-colors hover:bg-subtle/60 ${
                        hasProblems ? "bg-crit-soft/10" : ""
                      }`}
                      onClick={() => {
                        window.location.href = scanUrl;
                      }}
                    >
                      {/* Date */}
                      <td className="px-5 py-4">
                        <Link
                          href={scanUrl}
                          className="font-medium text-ink no-underline group-hover:text-primary group-hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {date.full}
                        </Link>
                        <span className="block text-xs text-muted">{date.relative}</span>
                      </td>

                      {/* Trigger */}
                      <td className="px-4 py-4">
                        <span className="inline-block rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium capitalize text-ink">
                          {scan.trigger}
                        </span>
                      </td>

                      {/* Pages Scanned */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <span className="font-semibold text-ink">{scan.pagesScanned}</span>
                          <span className="text-muted">/ {scan.pagesPlanned}</span>
                          {scan.pagesFailed > 0 && (
                            <span
                              className="rounded bg-crit-soft px-1.5 py-0.2 text-[11px] font-bold text-crit"
                              title={`${scan.pagesFailed} failed`}
                            >
                              {scan.pagesFailed} failed
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-4">
                        {scan.score != null ? (
                          <div className="flex items-center gap-2">
                            <span className="tnum font-serif text-lg font-bold text-ink">
                              {scan.score}
                            </span>
                            <BandBadge score={scan.score} />
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>

                      {/* New / Fixed / Regressed */}
                      <td className="px-4 py-4">
                        {scan.counts ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {(scan.counts.regressed ?? 0) > 0 && (
                              <span
                                className="rounded bg-crit-soft px-2 py-0.5 font-bold text-crit"
                                title="Regressions"
                              >
                                ⟲ {scan.counts.regressed} regressed
                              </span>
                            )}
                            {(scan.counts.new ?? 0) > 0 && (
                              <span
                                className="rounded bg-mod-soft px-2 py-0.5 font-bold text-mod"
                                title="New issues"
                              >
                                +{scan.counts.new} new
                              </span>
                            )}
                            {(scan.counts.fixed ?? 0) > 0 && (
                              <span
                                className="rounded bg-ok-soft px-2 py-0.5 font-bold text-ok"
                                title="Fixed issues"
                              >
                                ✓ {scan.counts.fixed} fixed
                              </span>
                            )}
                            {!(scan.counts.new || scan.counts.fixed || scan.counts.regressed) && (
                              <span className="text-muted">No changes</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-4 text-xs text-muted">
                        {formatDuration(scan.startedAt, scan.finishedAt)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <ScanStatusBadge status={scan.status} />
                          {hasProblems && (
                            <button
                              type="button"
                              onClick={(e) => toggleHint(scan.id, e)}
                              className="text-xs font-semibold text-crit underline hover:text-crit/80"
                              aria-expanded={isHintExpanded}
                              aria-label={`${isHintExpanded ? "Hide" : "Show"} failure details`}
                            >
                              {isHintExpanded ? "Hide hint" : "Why?"}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Chevron Arrow */}
                      <td className="px-3 py-4 text-right text-muted group-hover:text-ink">
                        <Icon d={I.chevronRight} size={16} />
                      </td>
                    </tr>

                    {/* S-27 & Gate 2: Partial and Failed Scans Show Reasons and 'What to do' Hint */}
                    {hasProblems && isHintExpanded && scan.hint && (
                      <tr className="bg-crit-soft/20">
                        <td colSpan={8} className="border-t border-crit/20 px-6 py-4">
                          <div className="flex flex-col gap-2 rounded-xl border border-crit/30 bg-surface/80 p-4 shadow-sm md:flex-row md:items-start md:justify-between">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 grid size-6 flex-none place-items-center rounded-full bg-crit text-xs font-bold text-on-primary">
                                !
                              </span>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-crit">
                                    {scan.status === "partial" ? "Partial scan explanation" : "Scan failure"}
                                  </span>
                                  {scan.errorCode && (
                                    <span className="font-mono text-xs text-muted">({scan.errorCode})</span>
                                  )}
                                </div>
                                <p className="m-0 text-sm font-semibold text-ink">
                                  {scan.hint.reason}
                                </p>
                                <p className="m-0 mt-1 text-xs leading-relaxed text-muted">
                                  <strong className="text-ink">What to do: </strong>
                                  {scan.hint.whatToDo}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-none items-center gap-2 pt-2 md:pt-0">
                              <Link
                                href={scanUrl}
                                className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink no-underline hover:bg-subtle"
                              >
                                View scan report
                              </Link>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
