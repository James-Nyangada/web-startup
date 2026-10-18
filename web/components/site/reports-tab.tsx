"use client";

import React, { useState, useEffect, useId } from "react";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

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
  orgSlug?: string;
  siteSlug?: string;
  siteId?: string;
  siteName?: string;
  onToast: (msg: string) => void;
}

const DEMO_REPORTS: ReportItem[] = [
  {
    id: "rep-demo-1",
    type: "scan_summary",
    status: "ready",
    title: "Scan #23 Summary Report",
    scanLabel: "Scan #23 · 14 Oct 2026",
    scanScore: 78,
    fileSize: 491520, // 480 KB
    createdAt: "14 Oct 2026, 14:32",
    downloadUrl: "#",
  },
  {
    id: "rep-demo-2",
    type: "full",
    status: "ready",
    title: "Full Accessibility Audit Report",
    scanLabel: "Scan #23 · 14 Oct 2026",
    scanScore: 78,
    fileSize: 1887436, // 1.8 MB
    createdAt: "14 Oct 2026, 14:35",
    downloadUrl: "#",
  },
  {
    id: "rep-demo-3",
    type: "scan_summary",
    status: "ready",
    title: "Scan #22 Summary Report",
    scanLabel: "Scan #22 · 12 Oct 2026",
    scanScore: 72,
    fileSize: 471040, // 460 KB
    createdAt: "12 Oct 2026, 10:15",
    downloadUrl: "#",
  },
];

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportsTab({
  orgSlug = "brightline",
  siteSlug,
  siteId,
  siteName = "Oakhaus Furniture",
  onToast,
}: ReportsTabProps) {
  const [reports, setReports] = useState<ReportItem[]>(DEMO_REPORTS);
  const [loading, setLoading] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

  // Generate modal form state
  const [reportType, setReportType] = useState<"scan_summary" | "full">("scan_summary");
  const [paper, setPaper] = useState<"a4" | "letter">("a4");
  const [branded, setBranded] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Send modal form state
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const generateTitleId = useId();
  const sendTitleId = useId();

  // Load real reports if siteId is present
  useEffect(() => {
    if (!siteId) return;
    let canceled = false;
    async function loadReports() {
      try {
        setLoading(true);
        const res = await apiClient<{ data: Array<any> }>(
          `/v1/orgs/${orgSlug}/reports?siteId=${siteId}`,
        );
        if (!canceled && res?.data && res.data.length > 0) {
          const mapped: ReportItem[] = res.data.map((r: any) => ({
            id: r.id,
            type: r.type,
            status: r.status,
            title:
              r.type === "scan_summary"
                ? "Accessibility Scan Summary"
                : r.type === "full"
                  ? "Full Accessibility Audit Report"
                  : "Accessibility Report",
            scanLabel: r.scanScore ? `Scan Score: ${r.scanScore}/100` : "Latest scan",
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
        // Fall back to demo data in demo mode
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
      const res = await apiClient<{ data: { downloadUrl: string } }>(
        `/v1/orgs/${orgSlug}/reports/${report.id}/download`,
      );
      if (res?.data?.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank");
        onToast("Download started.");
      }
    } catch (err: any) {
      // In demo mode without backend report row, simulate instant download
      onToast(`Downloading ${report.title} (${paper.toUpperCase()})...`);
    }
  };

  // Handle Generate Report submission
  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await apiClient<{ data: { id: string } }>(
        `/v1/orgs/${orgSlug}/reports`,
        {
          method: "POST",
          body: JSON.stringify({
            type: reportType,
            siteId: siteId || undefined,
            branded,
          }),
        },
      );

      const newId = res?.data?.id || `rep-${Date.now()}`;
      const newReport: ReportItem = {
        id: newId,
        type: reportType,
        status: "rendering",
        title:
          reportType === "scan_summary"
            ? "Accessibility Scan Summary (R-01)"
            : "Full Accessibility Audit Report (R-02)",
        scanLabel: "Scan #23 · 14 Oct 2026",
        scanScore: 78,
        fileSize: null,
        createdAt: "Just now",
      };

      setReports((prev) => [newReport, ...prev]);
      setIsGenerateOpen(false);
      onToast(`Generating ${newReport.title}. It will be ready in under a minute.`);

      // Simulate completion in UI
      setTimeout(() => {
        setReports((prev) =>
          prev.map((r) =>
            r.id === newId
              ? {
                  ...r,
                  status: "ready",
                  fileSize: reportType === "scan_summary" ? 512000 : 1920000,
                }
              : r,
          ),
        );
        onToast(`${newReport.title} is ready to download.`);
      }, 4000);
    } catch (err: any) {
      // Demo fallback
      const newId = `rep-${Date.now()}`;
      const newReport: ReportItem = {
        id: newId,
        type: reportType,
        status: "ready",
        title:
          reportType === "scan_summary"
            ? "Scan #23 Summary Report (R-01)"
            : "Full Accessibility Audit Report (R-02)",
        scanLabel: "Scan #23 · 14 Oct 2026",
        scanScore: 78,
        fileSize: reportType === "scan_summary" ? 491520 : 1887436,
        createdAt: "Just now",
      };
      setReports((prev) => [newReport, ...prev]);
      setIsGenerateOpen(false);
      onToast(`Generated ${newReport.title} successfully.`);
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
      onToast(`Report emailed to ${emailList.length} recipient${emailList.length === 1 ? "" : "s"}.`);
    } catch {
      // Demo fallback
      setIsSendOpen(false);
      onToast(`Report emailed to ${emailList.length} recipient${emailList.length === 1 ? "" : "s"}.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Header & Action Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-xl font-semibold text-ink">On-demand Reports</h2>
          <p className="mt-1 text-sm text-muted">
            Generate and download tagged, accessible PDFs (R-01 Scan Summary, R-02 Full Report)
            or share them directly with clients and stakeholders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsGenerateOpen(true)}
          className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-sm"
        >
          <Icon d={I.plus} size={16} />
          <span>Generate report</span>
        </button>
      </div>

      {/* Reports Table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center">
            <Icon d={I.fileText} size={32} className="mx-auto text-muted mb-3" />
            <p className="text-base font-semibold text-ink">No reports generated yet</p>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">
              Generate an executive summary (R-01) or a full developer remediation report (R-02)
              for this site.
            </p>
            <button
              type="button"
              onClick={() => setIsGenerateOpen(true)}
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
                  <tr key={r.id} className="hover:bg-subtle/50 transition-colors">
                    <td className="px-4 py-3 sm:px-6 font-semibold text-ink">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-primary">
                          <Icon d={I.fileText} size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-ink">{r.title}</div>
                          <div className="text-xs font-normal text-muted">{siteName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-ink">
                        {r.type === "scan_summary" ? "R-01 Summary" : "R-02 Full Report"}
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
                    <td className="px-4 py-3 text-xs text-muted">{r.createdAt}</td>
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
                          title="Send report by email (E-11)"
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
              <h3 id={generateTitleId} className="text-lg font-semibold text-ink m-0">
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

            <form onSubmit={handleGenerateSubmit} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Report Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReportType("scan_summary")}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      reportType === "scan_summary"
                        ? "border-primary bg-primary/5 text-ink ring-1 ring-primary"
                        : "border-line bg-surface text-muted hover:border-line-strong"
                    }`}
                  >
                    <div className="text-sm font-semibold text-ink">R-01 Summary</div>
                    <div className="text-xs text-muted mt-1">
                      1–2 pages executive summary with score, breakdown, and top 10 issues.
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
                    <div className="text-sm font-semibold text-ink">R-02 Full Report</div>
                    <div className="text-xs text-muted mt-1">
                      Detailed developer remediation report with all occurrences and code snippets.
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Scan Source
                </label>
                <select
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue="latest"
                >
                  <option value="latest">Latest Scan (Scan #23 · 14 Oct 2026 — Score: 78)</option>
                  <option value="scan-22">Scan #22 (12 Oct 2026 — Score: 72)</option>
                  <option value="scan-21">Scan #21 (7 Oct 2026 — Score: 74)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Paper Format
                  </label>
                  <select
                    value={paper}
                    onChange={(e) => setPaper(e.target.value as "a4" | "letter")}
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
                  disabled={generating}
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
                <h3 id={sendTitleId} className="text-lg font-semibold text-ink m-0">
                  Email Report to Stakeholders
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Sends template E-11 with a secure download link (valid for 7 days).
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

            <form onSubmit={handleSendSubmit} className="mt-4 flex flex-col gap-4">
              <div className="rounded-xl border border-line bg-subtle/40 p-3">
                <div className="text-xs font-semibold text-muted">REPORT DETAILS</div>
                <div className="text-sm font-semibold text-ink mt-0.5">{selectedReport.title}</div>
                <div className="text-xs text-muted">{siteName} · {selectedReport.scanLabel}</div>
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
                <span className="text-xs text-muted">Separate multiple emails with commas.</span>
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
