"use client";

import React, { useState } from "react";

export interface BarDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
}

export interface BarChartProps {
  data: BarDataPoint[];
  height?: number;
  horizontal?: boolean;
  valueFormatter?: (val: number) => string;
  ariaLabel?: string;
}

export function BarChart({
  data,
  height = 240,
  horizontal = false,
  valueFormatter = (v) => String(v),
  ariaLabel = "Bar chart",
}: BarChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center rounded-xl border border-dashed border-line text-sm text-muted"
      >
        No chart data available.
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  if (horizontal) {
    return (
      <div className="flex flex-col gap-3 py-2" role="region" aria-label={ariaLabel}>
        {data.map((d, i) => {
          const pct = Math.min(100, Math.max(0, (d.value / maxVal) * 100));
          const isSelected = activeIdx === i;

          return (
            <div
              key={i}
              className="flex flex-col gap-1 text-xs"
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(i)}
              onBlur={() => setActiveIdx(null)}
              tabIndex={0}
              role="button"
              aria-label={`${d.label}: ${valueFormatter(d.value)}`}
            >
              <div className="flex justify-between font-medium text-ink">
                <span className="truncate pr-2">{d.label}</span>
                <span className="font-mono font-bold text-ink">{valueFormatter(d.value)}</span>
              </div>
              <div className="h-5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isSelected ? "bg-primary" : "bg-primary/80"
                  }`}
                  style={{ width: `${pct}%`, backgroundColor: d.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical Bar Chart
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const width = 600;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const barWidth = Math.min(36, Math.max(12, (innerWidth / data.length) * 0.65));
  const step = innerWidth / data.length;

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Y-axis grid lines */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = padding.top + innerHeight * (1 - pct);
          const val = Math.round(pct * maxVal);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-line"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted text-[10px] font-mono"
              >
                {valueFormatter(val)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barHeight = (d.value / maxVal) * innerHeight;
          const x = padding.left + i * step + (step - barWidth) / 2;
          const y = padding.top + innerHeight - barHeight;
          const isSelected = activeIdx === i;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={d.color || "var(--color-primary, #4338ca)"}
                className={`transition-opacity duration-150 ${isSelected ? "opacity-100" : "opacity-85"}`}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${valueFormatter(d.value)}`}
                onFocus={() => setActiveIdx(i)}
                onBlur={() => setActiveIdx(null)}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
              />
              <text
                x={x + barWidth / 2}
                y={height - 15}
                textAnchor="middle"
                className="fill-muted text-[10px] font-medium"
              >
                {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating tooltip */}
      {activeIdx !== null && data[activeIdx] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface p-2 shadow-lg text-xs"
          style={{
            left: `${((padding.left + activeIdx * step + step / 2) / width) * 100}%`,
            top: 5,
          }}
        >
          <div className="font-semibold text-ink">{data[activeIdx].label}</div>
          <div className="mt-1 font-mono text-primary font-bold">
            {valueFormatter(data[activeIdx].value)}
          </div>
        </div>
      )}
    </div>
  );
}
