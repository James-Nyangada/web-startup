"use client";

import React, { useState } from "react";

export interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface LineChartProps {
  data: DataPoint[];
  comparisonData?: DataPoint[];
  height?: number;
  valueFormatter?: (val: number) => string;
  unit?: string;
  ariaLabel?: string;
}

export function LineChart({
  data,
  comparisonData,
  height = 240,
  valueFormatter = (v) => String(v),
  unit = "",
  ariaLabel = "Line chart",
}: LineChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center rounded-xl border border-dashed border-line text-sm text-muted"
      >
        No chart data available for this range.
      </div>
    );
  }

  const padding = { top: 20, right: 30, bottom: 35, left: 55 };
  const width = 600; // SVG viewBox coordinates
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allValues = [
    ...data.map((d) => d.value),
    ...(comparisonData ? comparisonData.map((d) => d.value) : []),
  ];
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const getX = (idx: number, total: number) =>
    padding.left + (idx / Math.max(total - 1, 1)) * innerWidth;
  const getY = (val: number) =>
    padding.top + innerHeight - ((val - minVal) / range) * innerHeight;

  // Build main path
  const points = data.map((d, i) => `${getX(i, data.length)},${getY(d.value)}`).join(" ");

  // Build comparison path if provided
  const compPoints = comparisonData
    ? comparisonData
        .map((d, i) => `${getX(i, comparisonData.length)},${getY(d.value)}`)
        .join(" ")
    : null;

  // Area under line
  const areaPoints = `${getX(0, data.length)},${padding.top + innerHeight} ${points} ${getX(
    data.length - 1,
    data.length,
  )},${padding.top + innerHeight}`;

  // Y-axis grid ticks (4 ticks)
  const ticks = [0, 0.33, 0.66, 1].map((pct) => minVal + pct * range);

  const activePoint = activeIdx !== null ? data[activeIdx] : null;
  const activeComp = activeIdx !== null && comparisonData ? comparisonData[activeIdx] : null;

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary, #4338ca)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-primary, #4338ca)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines and labels */}
        {ticks.map((t, i) => {
          const y = getY(t);
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
                {valueFormatter(Math.round(t))}
              </text>
            </g>
          );
        })}

        {/* Gradient area */}
        <polygon points={areaPoints} fill="url(#lineGrad)" />

        {/* Comparison Line (dashed) */}
        {compPoints && (
          <polyline
            points={compPoints}
            fill="none"
            stroke="currentColor"
            className="text-muted/60"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        )}

        {/* Main Line */}
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-primary, #4338ca)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points (focusable) */}
        {data.map((d, i) => {
          const cx = getX(i, data.length);
          const cy = getY(d.value);
          const isSelected = activeIdx === i;

          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 6 : 4}
                className="fill-surface transition-all"
                stroke="var(--color-primary, #4338ca)"
                strokeWidth={isSelected ? 3 : 2}
                tabIndex={0}
                role="button"
                aria-label={`${d.date}: ${valueFormatter(d.value)} ${unit}`}
                onFocus={() => setActiveIdx(i)}
                onBlur={() => setActiveIdx(null)}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
              />
            </g>
          );
        })}

        {/* X-axis labels (first, middle, last) */}
        {data.length > 0 && (
          <g className="fill-muted text-[10px]">
            <text x={padding.left} y={height - 10} textAnchor="start">
              {data[0]?.label || data[0]?.date}
            </text>
            {data.length > 2 && (
              <text
                x={getX(Math.floor(data.length / 2), data.length)}
                y={height - 10}
                textAnchor="middle"
              >
                {data[Math.floor(data.length / 2)]?.label || data[Math.floor(data.length / 2)]?.date}
              </text>
            )}
            <text x={width - padding.right} y={height - 10} textAnchor="end">
              {data[data.length - 1]?.label || data[data.length - 1]?.date}
            </text>
          </g>
        )}
      </svg>

      {/* Floating tooltip */}
      {activePoint && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface p-2 shadow-lg text-xs"
          style={{
            left: `${(getX(activeIdx!, data.length) / width) * 100}%`,
            top: 10,
          }}
        >
          <div className="font-semibold text-ink">{activePoint.date}</div>
          <div className="mt-1 font-mono text-primary font-bold">
            {valueFormatter(activePoint.value)} {unit}
          </div>
          {activeComp && (
            <div className="mt-0.5 text-muted">
              Prev: {valueFormatter(activeComp.value)} {unit}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
