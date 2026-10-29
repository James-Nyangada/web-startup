"use client";

import React, { useState } from "react";
import { Icon, I } from "@/components/icons";
import { btn } from "../staff-shell";

export interface AccessibleChartProps {
  findingTitle: string;
  summaryText: string;
  csvHref?: string;
  onExportCsv?: () => void;
  tableHeaders: string[];
  tableRows: (string | number)[][];
  children: React.ReactNode;
  className?: string;
}

export function AccessibleChart({
  findingTitle,
  summaryText,
  csvHref,
  onExportCsv,
  tableHeaders,
  tableRows,
  children,
  className = "",
}: AccessibleChartProps) {
  const [viewTable, setViewTable] = useState(false);

  const handleDownloadCsv = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    if (csvHref) {
      window.open(csvHref, "_blank");
      return;
    }
    // Fallback: build CSV from table rows
    // A leading = + - @ would run as a formula when opened in a spreadsheet, and some values
    // (referrers, campaigns) come from outside, so those cells are defused with a quote.
    const cell = (v: string | number) => {
      const text = String(v);
      const safe = /^[=+\-@\t\r]/.test(text) && typeof v === "string" ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const headerLine = tableHeaders.map(cell).join(",");
    const rowsLines = tableRows.map((row) => row.map(cell).join(","));
    const csvContent = "data:text/csv;charset=utf-8," + [headerLine, ...rowsLines].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${findingTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section
      aria-label={findingTitle}
      className={`rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-base font-semibold text-ink">{findingTitle}</h3>
          <p className="mt-1 text-sm text-muted">{summaryText}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewTable((v) => !v)}
            className={btn.secondary}
            aria-pressed={viewTable}
          >
            <Icon d={viewTable ? I.monitor : I.layout} size={15} />
            {viewTable ? "View as chart" : "View as table"}
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className={btn.secondary}
            aria-label={`Export CSV for ${findingTitle}`}
          >
            <Icon d={I.download} size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {viewTable ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{findingTitle} - Data table</caption>
            <thead className="bg-subtle text-xs font-semibold text-muted">
              <tr>
                {tableHeaders.map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface text-ink">
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-subtle/50">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-4 py-3 ${cIdx > 0 && typeof cell === "number" ? "font-mono" : ""}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-4 py-8 text-center text-muted">
                    No data recorded for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pt-2">{children}</div>
      )}
    </section>
  );
}
