"use client";

import React, { useState } from "react";

export interface StackedBarPoint {
  label: string;
  positive: { category: string; value: number; color: string }[];
  negative?: { category: string; value: number; color: string }[];
}

export interface StackedBarsProps {
  data: StackedBarPoint[];
  height?: number;
  valueFormatter?: (val: number) => string;
  ariaLabel?: string;
}

export function StackedBars({
  data,
  height = 240,
  valueFormatter = (v) => String(v),
  ariaLabel = "Stacked bar chart",
}: StackedBarsProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center rounded-xl border border-dashed border-line text-sm text-muted"
      >
        No movement data available.
      </div>
    );
  }

  const maxPos = Math.max(
    ...data.map((d) => d.positive.reduce((acc, c) => acc + c.value, 0)),
    1,
  );
  const maxNeg = Math.max(
    ...data.map((d) => (d.negative ? d.negative.reduce((acc, c) => acc + c.value, 0) : 0)),
    0,
  );

  const totalRange = maxPos + maxNeg;
  const padding = { top: 20, right: 20, bottom: 35, left: 55 };
  const width = 600;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const zeroY = padding.top + (maxPos / totalRange) * innerHeight;
  const step = innerWidth / data.length;
  const barWidth = Math.min(32, Math.max(12, step * 0.65));

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Zero baseline */}
        <line
          x1={padding.left}
          y1={zeroY}
          x2={width - padding.right}
          y2={zeroY}
          stroke="currentColor"
          className="text-line-strong"
          strokeWidth="1.5"
        />

        {/* Y-axis labels */}
        <text
          x={padding.left - 8}
          y={padding.top + 4}
          textAnchor="end"
          className="fill-muted text-[10px] font-mono"
        >
          +{valueFormatter(maxPos)}
        </text>
        <text
          x={padding.left - 8}
          y={zeroY + 4}
          textAnchor="end"
          className="fill-muted text-[10px] font-mono"
        >
          0
        </text>
        {maxNeg > 0 && (
          <text
            x={padding.left - 8}
            y={height - padding.bottom}
            textAnchor="end"
            className="fill-muted text-[10px] font-mono"
          >
            -{valueFormatter(maxNeg)}
          </text>
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + i * step + (step - barWidth) / 2;

          // Positive stacks (grow upward from zeroY)
          let currentPosY = zeroY;
          const posRects = d.positive.map((p, pIdx) => {
            const h = (p.value / totalRange) * innerHeight;
            currentPosY -= h;
            return (
              <rect
                key={`p-${pIdx}`}
                x={x}
                y={currentPosY}
                width={barWidth}
                height={Math.max(h, 0)}
                fill={p.color}
                className="opacity-90 hover:opacity-100 transition-opacity"
              />
            );
          });

          // Negative stacks (grow downward from zeroY)
          let currentNegY = zeroY;
          const negRects = (d.negative || []).map((n, nIdx) => {
            const h = (n.value / totalRange) * innerHeight;
            const y = currentNegY;
            currentNegY += h;
            return (
              <rect
                key={`n-${nIdx}`}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, 0)}
                fill={n.color}
                className="opacity-90 hover:opacity-100 transition-opacity"
              />
            );
          });

          return (
            <g
              key={i}
              tabIndex={0}
              role="button"
              aria-label={`${d.label}: net movement`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(i)}
              onBlur={() => setActiveIdx(null)}
            >
              {posRects}
              {negRects}
              <text
                x={x + barWidth / 2}
                y={height - 10}
                textAnchor="middle"
                className="fill-muted text-[10px]"
              >
                {d.label}
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
          <div className="mt-1 flex flex-col gap-0.5">
            {data[activeIdx].positive.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 text-ink">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.category}
                </span>
                <span className="font-mono font-bold text-ok">+{valueFormatter(p.value)}</span>
              </div>
            ))}
            {(data[activeIdx].negative || []).map((n, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 text-ink">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: n.color }} />
                  {n.category}
                </span>
                <span className="font-mono font-bold text-crit">-{valueFormatter(n.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
