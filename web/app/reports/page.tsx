"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { apiBaseUrl, apiClient, ApiException } from "@/lib/api";
import { useActiveOrg } from "@/lib/use-active-org";

type ReportType = "scan_summary" | "full" | "evidence_pack" | "client_monthly" | "agency_overview";
type ReportStatus = "queued" | "rendering" | "ready" | "failed";

/** A row from GET /v1/orgs/:orgId/reports. */
interface ApiReport {
  id: string;
  siteId: string | null;
  type: ReportType;
  status: ReportStatus;
  fileSize: number | null;
  branded: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  createdAt: string;
  siteName?: string | null;
  scanScore?: number | null;
}

const REPORT_TITLES: Record<ReportType, string> = {
  scan_summary: "Accessibility Scan Summary",
  full: "Full Accessibility Audit Report",
  evidence_pack: "Accessibility Evidence Pack",
  client_monthly: "Client Monthly Report",
  agency_overview: "Agency Overview Report",
};

const TYPE_LABELS: Record<ReportType, string> = {
  scan_summary: "Summary",
  full: "Full",
  evidence_pack: "Evidence",
  client_monthly: "Monthly",
  agency_overview: "Overview",
};

const STATUS_LABELS: Record<Exclude<ReportStatus, "ready">, string> = {
  queued: "Queued",
  rendering: "Generating…",
  failed: "Failed",
};

function formatDate(value: string, utc = false): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
}

function formatFileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reportDetail(r: ApiReport): string | null {
  if (r.type === "evidence_pack" && r.dateFrom && r.dateTo) {
    return `${formatDate(`${r.dateFrom}T00:00:00Z`, true)} – ${formatDate(`${r.dateTo}T00:00:00Z`, true)}`;
  }
  if (r.scanScore != null) return `Score ${r.scanScore}/100`;
  return null;
}

export default function ReportsPage() {
  const { showToast } = useToast();
  const { slug, org, loading: orgLoading } = useActiveOrg();
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!slug) {
      if (!orgLoading) setState("ready");
      return;
    }
    let canceled = false;
    setState("loading");
    apiClient<ApiReport[]>(`/v1/orgs/${slug}/reports?limit=100`)
      .then((rows) => {
        if (canceled) return;
        setReports(Array.isArray(rows) ? rows : []);
        setState("ready");
      })
      .catch(() => {
        if (!canceled) setState("error");
      });
    return () => {
      canceled = true;
    };
  }, [slug, orgLoading]);

  const handleDownload = async (report: ApiReport) => {
    if (!slug) return;
    try {
      const res = await apiClient<{ downloadUrl: string }>(`/v1/orgs/${slug}/reports/${report.id}/download`);
      if (res?.downloadUrl) {
        window.open(`${apiBaseUrl()}${res.downloadUrl}`, "_blank", "noopener");
      }
    } catch (err) {
      showToast(err instanceof ApiException ? err.message : "Could not start the download. Please try again.");
    }
  };

  const sitesHref = slug ? `/${slug}/sites` : "/overview";

  return (
    <AppShell
      active="reports"
      crumbs={[
        { label: org?.name ?? "Organisation", href: "/overview" },
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
          <Link
            href={sitesHref}
            className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
          >
            <Icon d={I.plus} size={16} />
            <span>Generate report</span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {state === "loading" ? (
            <p className="m-0 px-6 py-10 text-center text-sm text-muted" role="status">
              Loading reports…
            </p>
          ) : state === "error" ? (
            <p className="m-0 px-6 py-10 text-center text-sm text-muted" role="alert">
              Reports could not be loaded. Refresh the page to try again.
            </p>
          ) : reports.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="m-0 text-sm font-semibold text-ink">No reports yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Open a site and use its Reports tab to generate a scan summary, full audit or evidence pack.
                Generated reports appear here for the whole organisation.
              </p>
            </div>
          ) : (
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
                  {reports.map((r) => {
                    const detail = reportDetail(r);
                    const size = formatFileSize(r.fileSize);
                    return (
                      <tr key={r.id} className="hover:bg-subtle/50 transition-colors">
                        <td className="px-4 py-3 sm:px-6">
                          <div className="flex items-center gap-2.5">
                            <Icon d={I.fileText} size={16} className="shrink-0 text-muted" />
                            <div>
                              <span className="font-semibold text-ink">{REPORT_TITLES[r.type] ?? "Accessibility Report"}</span>
                              {detail && <span className="block text-xs text-muted">{detail}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {r.siteId && slug ? (
                            <Link href={`/${slug}/sites/${r.siteId}`} className="text-muted hover:text-ink hover:underline">
                              {r.siteName ?? "Site"}
                            </Link>
                          ) : (
                            r.siteName ?? "All sites"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-muted">
                            {TYPE_LABELS[r.type] ?? r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(r.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "ready" ? (
                            <button
                              type="button"
                              onClick={() => handleDownload(r)}
                              className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
                            >
                              PDF{size ? ` (${size})` : ""}
                            </button>
                          ) : (
                            <span className={`text-xs ${r.status === "failed" ? "text-red-700 dark:text-red-400" : "text-muted"}`}>
                              {STATUS_LABELS[r.status]}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
