"use client";

import React from "react";
import { Icon, I } from "@/components/icons";
import { btn } from "../staff-shell";

export type DatePreset = "7d" | "30d" | "90d" | "12m" | "custom";

export interface DateRangeControlProps {
  preset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  from?: string;
  to?: string;
  onCustomRangeChange?: (from: string, to: string) => void;
  lastUpdated?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function DateRangeControl({
  preset,
  onPresetChange,
  compare,
  onCompareChange,
  from,
  to,
  onCustomRangeChange,
  lastUpdated,
  onRefresh,
  refreshing = false,
}: DateRangeControlProps) {
  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: "7d", label: "7 days" },
    { id: "30d", label: "30 days" },
    { id: "90d", label: "90 days" },
    { id: "12m", label: "12 months" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Date range preset">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetChange(p.id)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-ink pl-2">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => onCompareChange(e.target.checked)}
            className="size-4 rounded border-line text-primary focus:ring-primary"
          />
          Compare with previous period
        </label>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        {lastUpdated && <span>Updated {lastUpdated}</span>}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={`${btn.secondary} !py-1 !text-xs`}
            title="Refresh dashboard metrics"
          >
            <Icon d={I.refresh} size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
