"use client";

import React from "react";
import { Icon, I } from "@/components/icons";

export interface FunnelStep {
  name: string;
  count: number;
  conversionPct: number; // percentage from previous step
  dropOffPct?: number;
}

export interface FunnelChartProps {
  steps: FunnelStep[];
  ariaLabel?: string;
}

export function FunnelChart({ steps, ariaLabel = "Conversion funnel" }: FunnelChartProps) {
  if (!steps || steps.length === 0) {
    return <div className="text-sm text-muted">No funnel data available.</div>;
  }

  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="flex flex-col gap-3 py-2" role="region" aria-label={ariaLabel}>
      {steps.map((step, idx) => {
        const widthPct = Math.max(12, (step.count / maxCount) * 100);
        const isLast = idx === steps.length - 1;

        return (
          <div key={idx} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-ink">{step.name}</span>
              <span className="font-mono text-ink">{step.count.toLocaleString()}</span>
            </div>

            <div className="h-8 w-full overflow-hidden rounded-xl bg-subtle">
              <div
                className="h-full rounded-xl bg-primary/85 transition-all duration-500 flex items-center justify-end px-3 text-xs font-bold text-on-primary"
                style={{ width: `${widthPct}%` }}
              >
                {step.count > 0 && `${Math.round((step.count / maxCount) * 100)}%`}
              </div>
            </div>

            {!isLast && (
              <div className="flex items-center gap-2 px-2 py-0.5 text-xs text-muted">
                <Icon d={I.arrowDownRight} size={13} className="text-muted" />
                <span>
                  <strong className="text-ink font-mono">{step.conversionPct}%</strong> conversion to next step
                </span>
                {step.dropOffPct !== undefined && (
                  <span className="text-muted/70">({step.dropOffPct}% drop-off)</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
