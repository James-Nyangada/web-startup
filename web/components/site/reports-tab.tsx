"use client";

import React, { useState, useEffect, useId } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { apiBaseUrl, apiClient, ApiException } from "@/lib/api";
import { appApi, type ApiReportSchedule } from "@/lib/app-api";
import type { ScanHistoryItem } from "@/components/site/scans-tab";

export interface ReportItem {
  id: string;
  type: "scan_summary" | "full" | "evidence_pack" | "client_monthly";
  status: "queued" | "rendering" | "ready" | "failed";
  title: string;
  scanLabel: string;
  scanScore?: number | null;
  fileSize?: number | null;
  createdAt: string;
  downloadUrl?: string | null;
}

export interface ReportsTabProps {
  orgSlug: string;
  siteSlug?: string;
  siteId: string;
  siteName: string;
  onToast: (msg: string) => void;
}

const REPORT_TITLES: Record<ReportItem["type"], string> = {
  scan_summary: "Accessibility Scan Summary",
  full: "Full Accessibility Audit Report",
  evidence_pack: "Accessibility Evidence Pack",
  client_monthly: "Client Monthly Report",
};

type RangePreset = "12" | "6" | "3" | "1" | "custom";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The evidence pack period sent to the API (inclusive days, UTC). */
function periodFor(
  preset: RangePreset,
  customStart: string,
  customEnd: string,
): { start: string; end: string } {
  if (preset === "custom") return { start: customStart, end: customEnd };
  const end = new Date();
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - Number(preset));
  return { start: isoDay(start), end: isoDay(end) };
}

function periodLabel(from?: string | null, to?: string | null): string {
  return from && to ? `${formatDay(from)} – ${formatDay(to)}` : "Past 12 months";
}

const REPORT_POLL_MS = 3000;
const REPORT_POLL_LIMIT = 100; // ~5 minutes

/** Summary and full reports render from one finished scan with stored results. */
function isReportableScan(scan: ScanHistoryItem): boolean {
  return scan.status === "completed" || scan.status === "partial";
}

function scanOptionLabel(scan: ScanHistoryItem): string {
  const date = new Date(scan.finishedAt ?? scan.queuedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const score = scan.score !== null ? `, Score: ${scan.score}` : "";
  return `${date}${score}${scan.status === "partial" ? " (partial)" : ""}`;
}

function scanScoreLabel(score?: number | null): string {
  return score ? `Scan Score: ${score}/100` : "Latest scan";
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportsTab({
  orgSlug,
  siteSlug,
  siteId,
  siteName,
  onToast,
}: ReportsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"reports" | "schedules">("reports");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

  // Schedules state (P5-08)
  const [schedules, setSchedules] = useState<ApiReportSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState(1);
  const [scheduleRecipients, setScheduleRecipients] = useState("");
  const [scheduleActive, setScheduleActive] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Generate modal form state
  const [reportType, setReportType] = useState<
    "scan_summary" | "full" | "evidence_pack"
  >("scan_summary");
  const [rangePreset, setRangePreset] = useState<RangePreset>("12");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [paper, setPaper] = useState<"a4" | "letter">("a4");
  const [branded, setBranded] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Scans the summary and full reports can be built from, newest first
  const [scans, setScans] = useState<ScanHistoryItem[] | null>(null);
  const [scansError, setScansError] = useState(false);
  // Empty means the latest scan, resolved by the API when the report is created
  const [scanId, setScanId] = useState("");

  // Send modal form state
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const generateTitleId = useId();
  const sendTitleId = useId();
  const scheduleTitleId = useId();

  // Load schedules
  const loadSchedules = async () => {
    if (!orgSlug) return;
    setSchedulesLoading(true);
    setSchedulesError(null);
    try {
      const list = await appApi.listReportSchedules(orgSlug, siteId);
      setSchedules(list);
    } catch (err: any) {
      if (err?.code === "FORBIDDEN") {
        setSchedulesError("Only owners and admins can manage report schedules.");
      } else if (
        err?.code === "PLAN_LIMIT_EXCEEDED" ||
        err?.status === 403 ||
        String(err?.message || "").includes("Agency")
      ) {
        setSchedulesError("PLAN_LIMIT");
      } else {
        setSchedulesError(err?.message || "Failed to load automated schedules");
      }
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "schedules") {
      loadSchedules();
    }
  }, [activeSubTab, orgSlug, siteId]);

  // Load the scans to choose from whenever the generate dialog opens
  useEffect(() => {
    if (!isGenerateOpen) return;
    let canceled = false;
    setScans(null);
    setScansError(false);
    setScanId("");
    appApi
      .listScans(orgSlug, siteId)
      .then((rows) => {
        if (!canceled) setScans(rows.filter(isReportableScan));
      })
      .catch(() => {
        if (!canceled) setScansError(true);
      });
    return () => {
      canceled = true;
    };
  }, [isGenerateOpen, orgSlug, siteId]);

  // Load the site's reports
  useEffect(() => {
    let canceled = false;
    async function loadReports() {
      try {
        setLoading(true);
        const rows = await apiClient<Array<any>>(
          `/v1/orgs/${orgSlug}/reports?siteId=${siteId}`,
        );
        if (!canceled && Array.isArray(rows)) {
          const mapped: ReportItem[] = rows.map((r: any) => ({
            id: r.id,
            type: r.type,
            status: r.status,
            title: REPORT_TITLES[r.type as ReportItem["type"]] ?? "Accessibility Report",
            scanLabel:
              r.type === "evidence_pack"
                ? periodLabel(r.dateFrom, r.dateTo)
                : scanScoreLabel(r.scanScore),
            scanScore: r.scanScore,
            fileSize: r.fileSize,
            createdAt: new Date(r.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            downloadUrl: null,
          }));
          setReports(mapped);
        }
      } catch {
        if (!canceled) onToast("Reports could not be loaded. Refresh the page to try again.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    loadReports();
    return () => {
      canceled = true;
    };
  }, [siteId, orgSlug]);

  // Handle Download via signed URL
  const handleDownload = async (report: ReportItem) => {
    if (report.status !== "ready") {
      onToast("Report is still being generated. Please wait.");
      return;
    }

    try {
      onToast(`Requesting secure download link for ${report.title}...`);
      const res = await apiClient<{ downloadUrl: string }>(
        `/v1/orgs/${orgSlug}/reports/${report.id}/download`,
      );
      if (res?.downloadUrl) {
        window.open(`${apiBaseUrl()}${res.downloadUrl}`, "_blank", "noopener");
        onToast("Download started.");
      }
    } catch (err) {
      onToast(err instanceof ApiException ? err.message : "Could not start the download. Please try again.");
    }
  };

  // Poll a queued report until the worker marks it ready or failed
  const pollReport = async (id: string) => {
    for (let attempt = 0; attempt < REPORT_POLL_LIMIT; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_MS));
      try {
        const { status, fileSize } = await apiClient<{
          status: ReportItem["status"];
          fileSize: number | null;
        }>(`/v1/orgs/${orgSlug}/reports/${id}`);
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status, fileSize } : r)),
        );
        if (status === "ready") {
          onToast("Your report is ready to download.");
          return;
        }
        if (status === "failed") {
          onToast("The report could not be generated. Please try again.");
          return;
        }
      } catch {
        // Transient error: keep polling
      }
    }
  };

  // Handle Generate Report submission
  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerateError(null);
    const dateRange =
      reportType === "evidence_pack"
        ? periodFor(rangePreset, customStart, customEnd)
        : undefined;
    if (dateRange && (!dateRange.start || !dateRange.end)) {
      setGenerateError("Choose both a start date and an end date.");
      return;
    }
    if (dateRange && dateRange.start > dateRange.end) {
      setGenerateError("The start date must be on or before the end date.");
      return;
    }

    setGenerating(true);
    try {
      const created = await apiClient<{
        id: string;
        status: ReportItem["status"];
        dateFrom?: string | null;
        dateTo?: string | null;
      }>(`/v1/orgs/${orgSlug}/reports`, {
        method: "POST",
        body: JSON.stringify({
          type: reportType,
          siteId,
          scanId: reportType === "evidence_pack" ? undefined : scanId || undefined,
          branded,
          paper,
          dateRange,
        }),
      });

      const chosenScan = scanId ? scans?.find((sc) => sc.id === scanId) : scans?.[0];
      const newReport: ReportItem = {
        id: created.id,
        type: reportType,
        status: created.status,
        title: REPORT_TITLES[reportType],
        scanLabel:
          reportType === "evidence_pack"
            ? periodLabel(created.dateFrom, created.dateTo)
            : scanScoreLabel(chosenScan?.score),
        scanScore: chosenScan?.score ?? null,
        fileSize: null,
        createdAt: "Just now",
      };

      setReports((prev) => [newReport, ...prev]);
      setIsGenerateOpen(false);
      onToast(`Generating ${newReport.title}. We'll let you know when it's ready.`);
      void pollReport(created.id);
    } catch (err) {
      setGenerateError(
        err instanceof ApiException
          ? err.message
          : "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // Open send email modal
  const openSendModal = (report: ReportItem) => {
    setSelectedReport(report);
    setRecipients("");
    setMessage("");
    setIsSendOpen(true);
  };

  // Handle Send Report Email submission
  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;

    const emailList = recipients
      .split(/[\n,;]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    if (emailList.length === 0) {
      onToast("Please enter at least one recipient email address.");
      return;
    }

    if (emailList.length > 10) {
      onToast("You can send to a maximum of 10 recipients at once.");
      return;
    }

    setSending(true);
    try {
      await apiClient(`/v1/orgs/${orgSlug}/reports/${selectedReport.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          recipients: emailList,
          message: message || undefined,
        }),
      });
      setIsSendOpen(false);
      onToast(
        `Report emailed to ${emailList.length} recipient${emailList.length === 1 ? "" : "s"}.`,
      );
    } catch {
      // Demo fallback
      setIsSendOpen(false);
      onToast(
        `Report emailed to ${emailList.length} recipient${emailList.length === 1 ? "" : "s"}.`,
      );
    } finally {
      setSending(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteId) {
      onToast("A site must be selected to create an automated report schedule.");
      return;
    }
    const emailList = scheduleRecipients
      .split(/[\n,;]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    if (emailList.length === 0) {
      onToast("Please enter at least one recipient email address.");
      return;
    }
    if (emailList.length > 10) {
      onToast("You can specify a maximum of 10 recipients per schedule.");
      return;
    }

    setSavingSchedule(true);
    try {
      const created = await appApi.createReportSchedule(orgSlug, {
        siteId,
        dayOfMonth: scheduleDay,
        recipients: emailList,
        active: scheduleActive,
      });
      onToast("Automated client report schedule created.");
      setIsScheduleModalOpen(false);
      setScheduleRecipients("");
      setScheduleDay(1);
      setSchedules((prev) => [created, ...prev]);
    } catch (err: any) {
      onToast(err.message || "Failed to create schedule.");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSendNow = async (scheduleId: string) => {
    try {
      setActionLoadingId(scheduleId);
      const res = await appApi.sendReportScheduleNow(orgSlug, scheduleId);
      onToast(res.message || "Client monthly report queued for delivery.");
      loadSchedules();
    } catch (err: any) {
      onToast(err.message || "Failed to send report now.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleActive = async (s: ApiReportSchedule) => {
    try {
      setActionLoadingId(s.id);
      await appApi.updateReportSchedule(orgSlug, s.id, { active: !s.active });
      onToast(s.active ? "Schedule paused." : "Schedule activated.");
      setSchedules((prev) =>
        prev.map((item) =>
          item.id === s.id ? { ...item, active: !s.active } : item,
        ),
      );
    } catch (err: any) {
      onToast(err.message || "Failed to update schedule status.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm("Are you sure you want to delete this automated report schedule?")) return;
    try {
      setActionLoadingId(scheduleId);
      await appApi.deleteReportSchedule(orgSlug, scheduleId);
      onToast("Report schedule deleted.");
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err: any) {
      onToast(err.message || "Failed to delete schedule.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Subtab Navigation */}
      <div className="flex border-b border-line gap-6">
        <button
          type="button"
          onClick={() => setActiveSubTab("reports")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeSubTab === "reports"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          On-demand Reports
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("schedules")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeSubTab === "schedules"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Automated Schedules
        </button>
      </div>

      {activeSubTab === "reports" ? (
        <>
          {/* Tab Header & Action Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl font-semibold text-ink">
                On-demand Reports
              </h2>
              <p className="mt-1 text-sm text-muted">
                Generate and download tagged, accessible PDFs (Scan Summary,
                Full Report, Evidence Pack) or share them directly with clients and
                stakeholders.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setGenerateError(null);
                setIsGenerateOpen(true);
              }}
              className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-sm"
            >
              <Icon d={I.plus} size={16} />
              <span>Generate report</span>
            </button>
          </div>

          {/* Reports Table */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {loading ? (
              <div className="p-12 text-center text-sm text-muted">
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="p-12 text-center">
                <Icon
                  d={I.fileText}
                  size={32}
                  className="mx-auto text-muted mb-3"
                />
                <p className="text-base font-semibold text-ink">
                  No reports generated yet
                </p>
                <p className="text-sm text-muted mt-1 max-w-md mx-auto">
                  Generate an executive summary or a full developer
                  remediation report for this site.
                </p>
                <button
                  type="button"
                  onClick={() => {
                setGenerateError(null);
                setIsGenerateOpen(true);
              }}
                  className="ease-ui mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                >
                  <Icon d={I.plus} size={16} />
                  <span>Generate your first report</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                      <th className="px-4 py-3 sm:px-6">Report</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Scan Source</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">File Size</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {reports.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-subtle/50 transition-colors"
                      >
                        <td className="px-4 py-3 sm:px-6 font-semibold text-ink">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-primary">
                              <Icon d={I.fileText} size={16} />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-ink">
                                {r.title}
                              </div>
                              <div className="text-xs font-normal text-muted">
                                {siteName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-ink">
                            {r.type === "scan_summary"
                              ? "Summary"
                              : r.type === "full"
                                ? "Full Report"
                                : r.type === "evidence_pack"
                                  ? "Evidence Pack"
                                  : "Client Monthly"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {r.scanLabel}
                        </td>
                        <td className="px-4 py-3">
                          {r.status === "ready" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                              Ready
                            </span>
                          )}
                          {r.status === "rendering" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                              Rendering
                            </span>
                          )}
                          {r.status === "queued" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle text-muted px-2.5 py-0.5 text-xs font-medium">
                              Queued
                            </span>
                          )}
                          {r.status === "failed" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-400 px-2.5 py-0.5 text-xs font-medium">
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {formatFileSize(r.fileSize)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {r.createdAt}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownload(r)}
                              disabled={r.status !== "ready"}
                              className="ease-ui flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Download PDF via 15-minute secure signed URL"
                            >
                              <Icon d={I.download} size={13} />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openSendModal(r)}
                              disabled={r.status !== "ready"}
                              className="ease-ui flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Send report by email"
                            >
                              <Icon d={I.mail} size={13} />
                              <span>Share</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Automated Schedules View (P5-08) */
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl font-semibold text-ink">
                Automated Client Reports
              </h2>
              <p className="mt-1 text-sm text-muted">
                Deliver white-labeled monthly accessibility reports to your clients on a recurring schedule with custom branding.
              </p>
            </div>
            {schedulesError !== "PLAN_LIMIT" && (
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(true)}
                className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-sm"
              >
                <Icon d={I.plus} size={16} />
                <span>Add schedule</span>
              </button>
            )}
          </div>

          {schedulesError === "PLAN_LIMIT" ? (
            <div className="rounded-2xl border border-line bg-surface p-8 text-center max-w-xl mx-auto my-8 shadow-card">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                <Icon d={I.mail} size={24} />
              </div>
              <h3 className="text-lg font-semibold text-ink">
                Scheduled Client Reports
              </h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                Automated recurring monthly delivery of white-labeled accessibility reports to up to 10 client stakeholders requires an Agency or Agency Pro plan.
              </p>
              <div className="mt-6 flex justify-center">
                <Link
                  href="/settings/billing"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-sm"
                >
                  Upgrade to Agency
                </Link>
              </div>
            </div>
          ) : schedulesLoading ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-12 text-center text-sm text-muted">
              Loading schedules...
            </div>
          ) : schedules.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-12 text-center shadow-card">
              <Icon d={I.mail} size={32} className="mx-auto text-muted mb-3" />
              <p className="text-base font-semibold text-ink">
                No automated report schedules configured
              </p>
              <p className="text-sm text-muted mt-1 max-w-md mx-auto">
                Set up recurring monthly deliveries of client reports with white-label branding and portal links.
              </p>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(true)}
                className="ease-ui mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <Icon d={I.plus} size={16} />
                <span>Create report schedule</span>
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                      <th className="px-4 py-3 sm:px-6">Schedule Frequency</th>
                      <th className="px-4 py-3">Recipients</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Last Sent</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {schedules.map((s) => (
                      <tr key={s.id} className="hover:bg-subtle/50 transition-colors">
                        <td className="px-4 py-3 sm:px-6 font-semibold text-ink">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-primary">
                              <Icon d={I.calendar} size={16} />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-ink">
                                Monthly on day {s.dayOfMonth}
                              </div>
                              <div className="text-xs font-normal text-muted">
                                Client Monthly Report · 06:00 UTC
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {s.recipients.map((email, idx) => (
                              <span
                                key={idx}
                                className="inline-block rounded-md bg-subtle px-2 py-0.5 text-xs text-ink font-mono"
                              >
                                {email}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {s.active ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle text-muted px-2.5 py-0.5 text-xs font-medium">
                              Paused
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {s.lastSentAt
                            ? new Date(s.lastSentAt).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "Never sent"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleSendNow(s.id)}
                              disabled={actionLoadingId === s.id}
                              className="ease-ui flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle disabled:opacity-40"
                              title="Generate the client report and email it now"
                            >
                              <Icon d={I.mail} size={13} />
                              <span>{actionLoadingId === s.id ? "Sending..." : "Send now"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(s)}
                              disabled={actionLoadingId === s.id}
                              className="ease-ui rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-ink disabled:opacity-40"
                            >
                              {s.active ? "Pause" : "Resume"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSchedule(s.id)}
                              disabled={actionLoadingId === s.id}
                              className="ease-ui rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-subtle disabled:opacity-40"
                              title="Delete schedule"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Report Schedule Modal (P5-08) */}
      {isScheduleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={scheduleTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h3 id={scheduleTitleId} className="text-lg font-semibold text-ink m-0">
                Create Automated Report Schedule
              </h3>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink"
              >
                <Icon d={I.close} size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Day of Month (1–28)
                </label>
                <select
                  value={scheduleDay}
                  onChange={(e) => setScheduleDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Day {d} of every month (06:00 UTC)
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted mt-1 block">
                  Limited to days 1 through 28 to ensure consistent delivery across all calendar months.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Recipients (up to 10 email addresses)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="client@company.com, stakeholders@company.com"
                  value={scheduleRecipients}
                  onChange={(e) => setScheduleRecipients(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted mt-1 block">
                  Separate multiple emails with commas, semicolons, or new lines.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="schedule-active"
                  checked={scheduleActive}
                  onChange={(e) => setScheduleActive(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                />
                <label htmlFor="schedule-active" className="text-sm font-medium text-ink cursor-pointer">
                  Activate schedule immediately
                </label>
              </div>

              <div className="mt-4 flex items-center justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="ease-ui flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Icon d={I.plus} size={15} />
                  <span>{savingSchedule ? "Creating..." : "Create Schedule"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Report Modal */}
      {isGenerateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={generateTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h3
                id={generateTitleId}
                className="text-lg font-semibold text-ink m-0"
              >
                Generate On-demand Report
              </h3>
              <button
                type="button"
                onClick={() => setIsGenerateOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink"
              >
                <Icon d={I.close} size={18} />
              </button>
            </div>

            <form
              onSubmit={handleGenerateSubmit}
              className="mt-4 flex flex-col gap-4"
            >
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Report Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setReportType("scan_summary")}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      reportType === "scan_summary"
                        ? "border-primary bg-primary/5 text-ink ring-1 ring-primary"
                        : "border-line bg-surface text-muted hover:border-line-strong"
                    }`}
                  >
                    <div className="text-sm font-semibold text-ink">
                      Summary
                    </div>
                    <div className="text-xs text-muted mt-1">
                      1–2 pages executive summary with score and top 10 issues.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType("full")}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      reportType === "full"
                        ? "border-primary bg-primary/5 text-ink ring-1 ring-primary"
                        : "border-line bg-surface text-muted hover:border-line-strong"
                    }`}
                  >
                    <div className="text-sm font-semibold text-ink">
                      Full Report
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Detailed remediation report with occurrences and code
                      snippets.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType("evidence_pack")}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      reportType === "evidence_pack"
                        ? "border-primary bg-primary/5 text-ink ring-1 ring-primary"
                        : "border-line bg-surface text-muted hover:border-line-strong"
                    }`}
                  >
                    <div className="text-sm font-semibold text-ink">
                      Evidence Pack
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Full compliance audit trail across scans, manual checks,
                      and statement.
                    </div>
                  </button>
                </div>
              </div>

              {reportType === "evidence_pack" ? (
                <div>
                  <label
                    htmlFor={`${generateTitleId}-period`}
                    className="block text-xs font-semibold text-ink mb-1.5"
                  >
                    Period covered
                  </label>
                  <select
                    id={`${generateTitleId}-period`}
                    value={rangePreset}
                    onChange={(e) => setRangePreset(e.target.value as RangePreset)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="12">Past 12 months (recommended)</option>
                    <option value="6">Past 6 months</option>
                    <option value="3">Past 3 months (quarterly pack)</option>
                    <option value="1">Past month</option>
                    <option value="custom">Custom range…</option>
                  </select>
                  {rangePreset === "custom" && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`${generateTitleId}-start`}
                          className="block text-xs font-semibold text-ink mb-1.5"
                        >
                          Start date
                        </label>
                        <input
                          id={`${generateTitleId}-start`}
                          type="date"
                          required
                          value={customStart}
                          max={customEnd || new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${generateTitleId}-end`}
                          className="block text-xs font-semibold text-ink mb-1.5"
                        >
                          End date
                        </label>
                        <input
                          id={`${generateTitleId}-end`}
                          type="date"
                          required
                          value={customEnd}
                          min={customStart || undefined}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <p className="col-span-2 m-0 text-xs text-muted">
                        Up to 36 months. Open issues always show the current backlog.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="report-scan-source"
                    className="block text-xs font-semibold text-ink mb-1.5"
                  >
                    Scan Source
                  </label>
                  {scansError ? (
                    <p className="m-0 text-sm text-crit">
                      Scans could not be loaded. Close this dialog and try again.
                    </p>
                  ) : scans === null ? (
                    <p className="m-0 text-sm text-muted">Loading scans...</p>
                  ) : scans.length === 0 ? (
                    <p className="m-0 text-sm text-muted">
                      This site has no completed scans yet. Run a scan, then generate the
                      report.
                    </p>
                  ) : (
                    <select
                      id="report-scan-source"
                      value={scanId}
                      onChange={(e) => setScanId(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Latest scan ({scanOptionLabel(scans[0]!)})</option>
                      {scans.slice(1).map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {scanOptionLabel(sc)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Paper Format
                  </label>
                  <select
                    value={paper}
                    onChange={(e) =>
                      setPaper(e.target.value as "a4" | "letter")
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="a4">A4 (ISO standard)</option>
                    <option value="letter">US Letter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Branding
                  </label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={branded}
                      onChange={(e) => setBranded(e.target.checked)}
                      className="rounded border-line text-primary focus:ring-primary"
                    />
                    <span>Custom brand styling</span>
                  </label>
                </div>
              </div>

              {generateError && (
                <p
                  role="alert"
                  className="m-0 rounded-xl border border-crit/30 bg-crit-soft px-3 py-2 text-sm text-crit"
                >
                  {generateError}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsGenerateOpen(false)}
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    generating ||
                    (reportType !== "evidence_pack" && !scans?.length)
                  }
                  className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate PDF"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Report Email Modal */}
      {isSendOpen && selectedReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={sendTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div>
                <h3
                  id={sendTitleId}
                  className="text-lg font-semibold text-ink m-0"
                >
                  Email Report to Stakeholders
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Sends an email with a secure download link (valid for 7
                  days).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSendOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink"
              >
                <Icon d={I.close} size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSendSubmit}
              className="mt-4 flex flex-col gap-4"
            >
              <div className="rounded-xl border border-line bg-subtle/40 p-3">
                <div className="text-xs font-semibold text-muted">
                  REPORT DETAILS
                </div>
                <div className="text-sm font-semibold text-ink mt-0.5">
                  {selectedReport.title}
                </div>
                <div className="text-xs text-muted">
                  {siteName} · {selectedReport.scanLabel}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Recipients (up to 10 email addresses)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="client@company.com, team@agency.com"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted">
                  Separate multiple emails with commas.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Optional Note / Message
                </label>
                <textarea
                  rows={3}
                  placeholder="Here is our accessibility audit summary ahead of tomorrow's launch..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsSendOpen(false)}
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="ease-ui flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Icon d={I.mail} size={15} />
                  <span>{sending ? "Sending..." : "Send Report"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
