"use client";

import React from "react";
import { Icon, I } from "@/components/icons";

export interface StatCardProps {
  label: string;
  value: string | number;
  changePct?: number;
  changeLabel?: string;
  finding?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  changePct,
  changeLabel = "vs previous period",
  finding,
  className = "",
}: StatCardProps) {
  const hasChange = typeof changePct === "number" && !isNaN(changePct);
  const isPositive = hasChange && changePct >= 0;

  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-5 shadow-card transition-all ${className}`}
      role="region"
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        {hasChange && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              isPositive
                ? "bg-ok-soft text-ok border border-ok/20"
                : "bg-crit-soft text-crit border border-crit/20"
            }`}
          >
            <Icon d={isPositive ? I.arrowUpRight : I.arrowDownRight} size={12} />
            {isPositive ? `+${changePct}%` : `${changePct}%`}
          </span>
        )}
      </div>

      <div className="mt-3 text-3xl font-bold font-mono tracking-tight text-ink">{value}</div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        {hasChange ? <span>{changeLabel}</span> : <span />}
        {finding && <span className="text-right font-medium text-ptext">{finding}</span>}
      </div>
    </div>
  );
}
