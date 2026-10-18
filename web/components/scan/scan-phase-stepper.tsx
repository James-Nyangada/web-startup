"use client";

import React from "react";
import { Icon, I } from "@/components/icons";

interface ScanPhaseStepperProps {
  phase: string;
  status: string;
  pagesScanned: number;
  pagesPlanned: number;
}

export function ScanPhaseStepper({
  phase,
  status,
  pagesScanned,
  pagesPlanned,
}: ScanPhaseStepperProps) {
  // Determine index of current active step (0 = discovering, 1 = scanning, 2 = processing, 3 = complete)
  let currentStep = 0;
  if (status === "queued") {
    currentStep = 0;
  } else if (phase === "discovering" || status === "discovering") {
    currentStep = 0;
  } else if (phase === "scanning" || status === "scanning") {
    currentStep = 1;
  } else if (phase === "processing" || status === "processing") {
    currentStep = 2;
  } else if (["completed", "partial", "failed", "canceled"].includes(status)) {
    currentStep = 3;
  }

  const isFailed = status === "failed";
  const isCanceled = status === "canceled";

  const steps = [
    {
      title: "Discovery",
      desc: "Finding pages & sitemaps",
    },
    {
      title: "Page checks",
      desc: pagesScanned > 0 ? `${pagesScanned} of ${pagesPlanned} scanned` : "Running axe-core rules",
    },
    {
      title: "Processing",
      desc: "Fingerprinting & score",
    },
    {
      title: isFailed ? "Failed" : isCanceled ? "Canceled" : "Complete",
      desc: isFailed
        ? "Scan encountered an error"
        : isCanceled
          ? "Scan canceled by user"
          : "Results ready",
    },
  ];

  return (
    <nav aria-label="Scan progress phases" className="w-full">
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {steps.map((step, idx) => {
          const isPast = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isTerminalStep = idx === 3;

          return (
            <li
              key={step.title}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex flex-col gap-1 rounded-xl border p-3 transition-colors ${
                isCurrent
                  ? isFailed
                    ? "border-crit bg-crit-soft"
                    : isCanceled
                      ? "border-line-strong bg-subtle"
                      : "border-primary bg-primary-soft"
                  : isPast
                    ? "border-line bg-surface"
                    : "border-line/60 bg-surface/50 opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                    isPast
                      ? "bg-ok text-on-primary"
                      : isCurrent
                        ? isFailed
                          ? "bg-crit text-on-primary"
                          : isCanceled
                            ? "bg-muted text-on-primary"
                            : "bg-primary text-on-primary"
                        : "bg-line text-muted"
                  }`}
                >
                  {isPast ? (
                    <Icon d={I.check} size={14} />
                  ) : isCurrent && !isTerminalStep ? (
                    <Icon d={I.loader} className="animate-spin" size={14} />
                  ) : isFailed ? (
                    <Icon d={I.close} size={14} />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="text-sm font-semibold text-ink">{step.title}</span>
              </div>
              <span className="text-xs text-muted pl-8">{step.desc}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
