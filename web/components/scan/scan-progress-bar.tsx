"use client";

import React from "react";
import { Icon, I } from "@/components/icons";

interface ScanProgressBarProps {
  phase: string;
  status: string;
  pagesScanned: number;
  pagesPlanned: number;
  currentUrl?: string;
  announcement?: string;
  isLive?: boolean;
}

export function ScanProgressBar({
  phase,
  status,
  pagesScanned,
  pagesPlanned,
  currentUrl,
  announcement,
  isLive = true,
}: ScanProgressBarProps) {
  const percent =
    pagesPlanned > 0
      ? Math.min(100, Math.max(0, Math.floor((pagesScanned / pagesPlanned) * 100)))
      : 0;

  const isComplete = status === "completed" || status === "partial";
  const isFailed = status === "failed";
  const isCanceled = status === "canceled";

  let statusText = `Scanning ${pagesScanned} of ${pagesPlanned} pages (${percent}%)`;
  if (isComplete) {
    statusText = `Scan finished: ${pagesScanned} pages checked`;
  } else if (isFailed) {
    statusText = "Scan failed";
  } else if (isCanceled) {
    statusText = "Scan canceled";
  } else if (phase === "discovering" || status === "discovering") {
    statusText = "Discovering pages and sitemaps...";
  } else if (phase === "processing" || status === "processing") {
    statusText = "Processing violations and computing score...";
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Screen reader live region (throttled every 10% or 15 s) */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement || statusText}
      </div>

      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="flex items-center gap-2 text-ink">
          {isLive && !isComplete && !isFailed && !isCanceled && (
            <Icon d={I.loader} className="animate-spin text-primary" size={16} />
          )}
          {statusText}
        </span>
        <span className="tnum font-mono text-muted">{percent}%</span>
      </div>

      {/* Accessible progress bar element */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Scan progress"
        className="relative h-3 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            isFailed
              ? "bg-crit"
              : isCanceled
                ? "bg-muted"
                : isComplete
                  ? "bg-ok"
                  : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Current page being scanned indicator */}
      {currentUrl && isLive && (
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Icon d={I.globe} size={14} className="flex-none" />
          <span className="flex-none font-medium">Checking:</span>
          <span className="truncate font-mono text-ink" title={currentUrl}>
            {currentUrl}
          </span>
        </div>
      )}
    </div>
  );
}
