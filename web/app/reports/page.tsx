"use client";

import React from "react";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";

interface ReportItem {
  id: string;
  title: string;
  site: string;
  type: "R-01 Summary" | "R-02 Full" | "R-03 Evidence";
  date: string;
  score: number;
}

const REPORTS: ReportItem[] = [
  {
    id: "rep-1",
    title: "Scan #23 Summary Report",
    site: "Oakhaus Furniture",
    type: "R-01 Summary",
    date: "14 Oct 2026",
    score: 78,
  },
  {
    id: "rep-2",
    title: "Full Accessibility Audit Report",
    site: "Oakhaus Furniture",
    type: "R-02 Full",
    date: "14 Oct 2026",
    score: 78,
  },
  {
    id: "rep-3",
    title: "Monthly Compliance Summary",
    site: "Baraka Bikes",
    type: "R-01 Summary",
    date: "14 Oct 2026",
    score: 91,
  },
  {
    id: "rep-4",
    title: "Quarterly Evidence Pack",
    site: "Lumen Opticians",
    type: "R-03 Evidence",
    date: "12 Oct 2026",
    score: 83,
  },
];

export default function ReportsPage() {
  const { showToast } = useToast();

  const handleDownload = (report: ReportItem) => {
    showToast(`Downloading ${report.title} (${report.type})...`);
  };

  return (
    <AppShell
      active="reports"
      crumbs={[
        { label: "Brightline Studio", href: "/overview" },
        { label: "Reports" },
      ]}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="m-0 font-serif text-[32px] sm:text-[38px] font-normal text-ink">
              Reports
            </h1>
            <p className="mt-1 text-sm text-muted">
              Download tagged PDF reports for stakeholders, clients, and compliance records.
            </p>
          </div>
          <button
            type="button"
            onClick={() => showToast("Generating new PDF report...")}
            className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            <Icon d={I.plus} size={16} />
            <span>Generate report</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                  <th className="px-4 py-3 sm:px-6">Report</th>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Generated</th>
                  <th className="px-4 py-3 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {REPORTS.map((r) => (
                  <tr key={r.id} className="hover:bg-subtle/50 transition-colors">
                    <td className="px-4 py-3 sm:px-6 font-semibold text-ink">
                      <div className="flex items-center gap-2.5">
                        <Icon d={I.fileText} size={16} className="text-muted" />
                        <span>{r.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.site}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-muted">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{r.date}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownload(r)}
                        className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
                      >
                        PDF (A4)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
