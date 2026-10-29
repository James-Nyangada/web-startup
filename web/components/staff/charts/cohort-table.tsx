"use client";

import React from "react";

export interface CohortRow {
  cohort: string; // e.g. "2025-01"
  size: number;
  retention: number[]; // % active in month 0, 1, 2, ...
}

export interface CohortTableProps {
  cohorts: CohortRow[];
  ariaLabel?: string;
}

export function CohortTable({ cohorts, ariaLabel = "Retention cohort matrix" }: CohortTableProps) {
  if (!cohorts || cohorts.length === 0) {
    return <div className="text-sm text-muted">No cohort retention data available.</div>;
  }

  const maxMonths = Math.max(...cohorts.map((c) => c.retention.length), 12);
  const monthHeaders = Array.from({ length: maxMonths }, (_, i) => `M${i}`);

  const getHeatmapColor = (pct: number) => {
    if (pct >= 85) return "bg-ok text-on-primary font-bold";
    if (pct >= 70) return "bg-ok/70 text-on-primary font-semibold";
    if (pct >= 50) return "bg-ok/40 text-ink font-medium";
    if (pct >= 30) return "bg-warn/30 text-ink";
    if (pct > 0) return "bg-crit/20 text-ink";
    return "bg-subtle/50 text-muted";
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line" role="region" aria-label={ariaLabel}>
      <table className="w-full text-left text-xs">
        <thead className="bg-subtle text-muted font-semibold">
          <tr>
            <th scope="col" className="px-3 py-2.5">Cohort</th>
            <th scope="col" className="px-3 py-2.5 text-right">Size</th>
            {monthHeaders.map((m) => (
              <th key={m} scope="col" className="px-2.5 py-2.5 text-center">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface text-ink">
          {cohorts.map((row) => (
            <tr key={row.cohort} className="hover:bg-subtle/30">
              <td className="px-3 py-2 font-medium whitespace-nowrap">{row.cohort}</td>
              <td className="px-3 py-2 text-right font-mono text-muted">{row.size}</td>
              {monthHeaders.map((_, mIdx) => {
                const val = row.retention[mIdx];
                const hasVal = typeof val === "number";

                return (
                  <td key={mIdx} className="p-1 text-center">
                    {hasVal ? (
                      <div
                        className={`rounded px-1.5 py-1 font-mono text-[11px] ${getHeatmapColor(val)}`}
                        title={`Cohort ${row.cohort}, Month ${mIdx}: ${val}% retention`}
                      >
                        {val}%
                      </div>
                    ) : (
                      <span className="text-muted/40">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
