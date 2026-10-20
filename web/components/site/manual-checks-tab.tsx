"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

export type ManualCheckType =
  | "keyboard"
  | "screen_reader"
  | "zoom_reflow"
  | "color_contrast_manual"
  | "captions"
  | "forms"
  | "other";

export type ManualCheckResult = "pass" | "issues_found" | "partial";

export interface ManualCheckItem {
  id: string;
  orgId: string;
  siteId: string;
  checkType: ManualCheckType;
  performedAt: string;
  performedByName: string;
  tool: string;
  result: ManualCheckResult;
  notes: string;
  attachmentKey: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualChecksTabProps {
  orgSlug: string;
  siteId: string;
  siteName?: string;
  onToast?: (msg: string) => void;
}

export interface CheckTypeGuidance {
  id: ManualCheckType;
  label: string;
  duration: string;
  summary: string;
  whatToTest: string[];
}

export const CHECK_TYPE_GUIDANCE: Record<ManualCheckType, CheckTypeGuidance> = {
  keyboard: {
    id: "keyboard",
    label: "Keyboard navigation",
    duration: "15–20 min",
    summary:
      "Ensure every interactive control can be navigated and activated using only the keyboard.",
    whatToTest: [
      "Use Tab and Shift+Tab to verify all interactive elements are reachable.",
      "Check that the focus indicator is always clearly visible and not obscured.",
      "Confirm focus order follows a logical reading sequence without unexpected jumps.",
      "Ensure modal dialogs and dropdown menus trap focus properly when open and release it on close.",
      "Activate buttons and links with Enter or Space, and close overlays with Escape.",
    ],
  },
  screen_reader: {
    id: "screen_reader",
    label: "Screen reader testing",
    duration: "25–30 min",
    summary:
      "Verify page structure, headings, landmarks, and interactive widgets announce accurately.",
    whatToTest: [
      "Navigate with NVDA (Windows), VoiceOver (macOS/iOS), or TalkBack (Android).",
      "Confirm page landmarks (main, nav, banner, contentinfo) are distinct and properly announced.",
      "Verify heading levels (h1 through h6) provide a logical hierarchical outline.",
      "Check that images have meaningful alt text and decorative images are ignored.",
      "Confirm dynamic updates (alerts, error messages, toast popups) announce via live regions.",
    ],
  },
  zoom_reflow: {
    id: "zoom_reflow",
    label: "400% Zoom & reflow",
    duration: "10–15 min",
    summary:
      "Test that content scales up to 400% without horizontal scrolling or overlapping text (WCAG 1.4.10).",
    whatToTest: [
      "Set browser window width to 1280px and increase browser zoom to 400%.",
      "Verify content reflows into a single vertical column without two-dimensional scrolling.",
      "Ensure text does not truncate, clip, or overlap adjacent containers.",
      "Check that navigation menus collapse into an accessible mobile hamburger drawer.",
    ],
  },
  color_contrast_manual: {
    id: "color_contrast_manual",
    label: "Manual color contrast",
    duration: "10–15 min",
    summary:
      "Evaluate contrast ratios for text over images, gradients, placeholders, and interactive states.",
    whatToTest: [
      "Sample text and background colors with a color dropper tool.",
      "Verify normal text achieves at least 4.5:1 contrast against its background.",
      "Verify large text (18pt+ or 14pt+ bold) and essential graphical icons achieve at least 3:1.",
      "Check text placed over background hero photos, banners, and subtle gradient fills.",
      "Confirm focus rings and button border states meet the 3:1 non-text contrast requirement.",
    ],
  },
  captions: {
    id: "captions",
    label: "Captions & transcripts",
    duration: "15–20 min",
    summary:
      "Confirm all multimedia elements include accurate synchronized captions and written transcripts.",
    whatToTest: [
      "Play video media and verify closed captions or open subtitles are available.",
      "Check caption synchronization with speech and identify speaker names where appropriate.",
      "Confirm audio-only podcasts or clips provide a complete descriptive transcript.",
    ],
  },
  forms: {
    id: "forms",
    label: "Form validation & errors",
    duration: "15–20 min",
    summary:
      "Test form fields, input error handling, and recovery instructions for assistive technology.",
    whatToTest: [
      "Submit empty and incorrectly formatted inputs across all forms.",
      "Check that every input has an explicit programmatic label (label for or aria-label).",
      "Confirm error messages describe what went wrong and provide specific correction guidance.",
      "Verify error announcements move focus directly to the first erroneous input or error summary.",
      "Ensure required fields are programmatically identified (aria-required='true').",
    ],
  },
  other: {
    id: "other",
    label: "Other accessibility check",
    duration: "10–30 min",
    summary:
      "Custom manual verification for target sizes, animations, orientation, or specialized devices.",
    whatToTest: [
      "Document the specific device, assistive technology, or test condition evaluated.",
      "Verify touch targets meet the minimum 24x24px (WCAG 2.5.8) or 44x44px recommendation.",
      "Ensure animations respect the prefers-reduced-motion media query.",
      "Note any usability observations or user feedback.",
    ],
  },
};

const COMMON_TOOLS = [
  "NVDA 2026.2 + Firefox",
  "VoiceOver + Safari",
  "Keyboard only (Chrome)",
  "Chrome 130 + DevTools",
  "TalkBack + Chrome Android",
  "Colour Contrast Analyser (CCA)",
];

export function ManualChecksTab({
  orgSlug,
  siteId,
  siteName = "Website",
  onToast,
}: ManualChecksTabProps) {
  const [checks, setChecks] = useState<ManualCheckItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterResult, setFilterResult] = useState<string>("all");

  // Modal states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState<ManualCheckItem | null>(
    null,
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedGuidanceType, setSelectedGuidanceType] =
    useState<ManualCheckType>("keyboard");

  // Form states
  const [formCheckType, setFormCheckType] =
    useState<ManualCheckType>("keyboard");
  const [formPerformedAt, setFormPerformedAt] = useState<string>(
    new Date().toISOString().split("T")[0]!,
  );
  const [formPerformedByName, setFormPerformedByName] = useState<string>("");
  const [formTool, setFormTool] = useState<string>("");
  const [formResult, setFormResult] = useState<ManualCheckResult>("pass");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [removeExistingAttachment, setRemoveExistingAttachment] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalCloseBtnRef = useRef<HTMLButtonElement | null>(null);

  const loadChecks = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filterType !== "all") params.set("checkType", filterType);
      if (filterResult !== "all") params.set("result", filterResult);
      params.set("limit", "100");

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient<{ data: ManualCheckItem[]; total: number }>(
        `/v1/orgs/${orgSlug}/sites/${siteId}/manual-checks${queryStr}`,
      );

      if (res?.data) {
        setChecks(res.data);
        setTotal(res.total ?? res.data.length);
      } else {
        setChecks([]);
        setTotal(0);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load manual checks.");
      setChecks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChecks();
  }, [orgSlug, siteId, filterType, filterResult]);

  // Handle open create modal
  const openCreateModal = (presetType?: ManualCheckType) => {
    const typeToUse = presetType || "keyboard";
    setEditingCheck(null);
    setFormCheckType(typeToUse);
    setSelectedGuidanceType(typeToUse);
    setFormPerformedAt(new Date().toISOString().split("T")[0]!);
    setFormPerformedByName("");
    setFormTool(COMMON_TOOLS[0]!);
    setFormResult("pass");
    setFormNotes("");
    setFormFile(null);
    setRemoveExistingAttachment(false);
    setFormError(null);
    setDialogOpen(true);
  };

  // Handle open edit modal
  const openEditModal = (check: ManualCheckItem) => {
    setEditingCheck(check);
    setFormCheckType(check.checkType);
    setSelectedGuidanceType(check.checkType);
    setFormPerformedAt(check.performedAt);
    setFormPerformedByName(check.performedByName);
    setFormTool(check.tool);
    setFormResult(check.result);
    setFormNotes(check.notes);
    setFormFile(null);
    setRemoveExistingAttachment(false);
    setFormError(null);
    setDialogOpen(true);
  };

  // Focus modal close button on mount
  useEffect(() => {
    if (dialogOpen) {
      setTimeout(() => modalCloseBtnRef.current?.focus(), 50);
    }
  }, [dialogOpen]);

  // Handle form submission (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formPerformedByName.trim()) {
      setFormError("Tester name is required.");
      return;
    }
    if (!formTool.trim()) {
      setFormError("Testing tool or method is required.");
      return;
    }

    try {
      setSaving(true);

      const formData = new FormData();
      formData.append("checkType", formCheckType);
      formData.append("performedAt", formPerformedAt);
      formData.append("performedByName", formPerformedByName.trim());
      formData.append("tool", formTool.trim());
      formData.append("result", formResult);
      formData.append("notes", formNotes.trim());

      if (formFile) {
        formData.append("attachment", formFile);
      }
      if (removeExistingAttachment) {
        formData.append("removeAttachment", "true");
      }

      if (editingCheck) {
        // PATCH /v1/orgs/:orgId/manual-checks/:id
        await apiClient(
          `/v1/orgs/${orgSlug}/manual-checks/${editingCheck.id}`,
          {
            method: "PATCH",
            body: formData,
          },
        );
        onToast?.("Manual check updated successfully.");
      } else {
        // POST /v1/orgs/:orgId/sites/:siteId/manual-checks
        await apiClient(`/v1/orgs/${orgSlug}/sites/${siteId}/manual-checks`, {
          method: "POST",
          body: formData,
        });
        onToast?.("Manual check recorded and logged to audit trail.");
      }

      setDialogOpen(false);
      loadChecks();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save manual check.");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (checkId: string) => {
    try {
      await apiClient(`/v1/orgs/${orgSlug}/manual-checks/${checkId}`, {
        method: "DELETE",
      });
      onToast?.("Manual check deleted.");
      setDeleteConfirmId(null);
      loadChecks();
    } catch (err: any) {
      onToast?.(err?.message || "Could not delete manual check.");
    }
  };

  // Handle download attachment
  const handleDownloadAttachment = async (check: ManualCheckItem) => {
    try {
      const res = await apiClient<{
        data: { downloadUrl: string; expiresAt: string };
      }>(`/v1/orgs/${orgSlug}/manual-checks/${check.id}/attachment`);
      if (res?.data?.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank");
      }
    } catch (err: any) {
      onToast?.(err?.message || "Could not generate attachment download link.");
    }
  };

  const activeGuidance = CHECK_TYPE_GUIDANCE[selectedGuidanceType];

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon d={I.audit} className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-ink">Manual Checks</h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Record human-evaluated assistive technology audits for {siteName}{" "}
              to verify criteria beyond automated scans.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="ease-ui flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <Icon d={I.plus} className="h-4 w-4" />
            <span>Log manual check</span>
          </button>
        </div>

        {/* Quick Guidance Selector Pills */}
        <div className="mt-6 border-t border-line/60 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Testing Guidance & Methodologies:
            </span>
            <span className="text-xs text-muted">
              Estimated: {activeGuidance.duration}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(CHECK_TYPE_GUIDANCE) as ManualCheckType[]).map(
              (typeKey) => {
                const guide = CHECK_TYPE_GUIDANCE[typeKey];
                const isSelected = selectedGuidanceType === typeKey;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => setSelectedGuidanceType(typeKey)}
                    className={`ease-ui rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface-subtle text-muted hover:bg-surface-hover hover:text-ink"
                    }`}
                  >
                    {guide.label}
                  </button>
                );
              },
            )}
          </div>

          {/* Active Guidance Box */}
          <div className="mt-3 rounded-lg border border-line-subtle bg-surface-subtle/50 p-3.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{activeGuidance.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {activeGuidance.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCreateModal(activeGuidance.id)}
                className="ease-ui shrink-0 rounded border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Log {activeGuidance.label}
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted list-disc list-inside">
              {activeGuidance.whatToTest.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Check Type Filter */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-type"
              className="text-xs font-semibold text-muted"
            >
              Check type:
            </label>
            <select
              id="filter-type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-primary focus:outline-none"
            >
              <option value="all">All check types</option>
              {(Object.keys(CHECK_TYPE_GUIDANCE) as ManualCheckType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {CHECK_TYPE_GUIDANCE[t].label}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* Result Filter */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-result"
              className="text-xs font-semibold text-muted"
            >
              Result:
            </label>
            <select
              id="filter-result"
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-primary focus:outline-none"
            >
              <option value="all">All results</option>
              <option value="pass">Passed</option>
              <option value="issues_found">Issues found</option>
              <option value="partial">Partially passed</option>
            </select>
          </div>

          {(filterType !== "all" || filterResult !== "all") && (
            <button
              type="button"
              onClick={() => {
                setFilterType("all");
                setFilterResult("all");
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="text-xs text-muted">
          Showing {checks.length} of {total} {total === 1 ? "check" : "checks"}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-line bg-surface p-5"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-40 rounded bg-line" />
                <div className="h-6 w-20 rounded-full bg-line" />
              </div>
              <div className="mt-3 h-4 w-64 rounded bg-line/60" />
              <div className="mt-2 h-4 w-full rounded bg-line/40" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger">
          <div className="flex items-center gap-2 font-semibold">
            <Icon d={I.close} className="h-5 w-5" />
            <span>Could not load manual checks</span>
          </div>
          <p className="mt-1 text-xs text-muted">{error}</p>
          <button
            type="button"
            onClick={loadChecks}
            className="mt-3 rounded border border-danger/40 bg-surface px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && checks.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-muted">
            <Icon d={I.audit} className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">
            No manual checks recorded
          </h3>
          <p className="mt-1 text-sm text-muted max-w-md mx-auto">
            Automated scans catch up to 40% of accessibility issues. Record
            manual keyboard tests, screen reader audits, and zoom verifications
            to complete your evaluation.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => openCreateModal("keyboard")}
              className="ease-ui rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-xs"
            >
              Log keyboard check
            </button>
            <button
              type="button"
              onClick={() => openCreateModal("screen_reader")}
              className="ease-ui rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
            >
              Log screen reader audit
            </button>
          </div>
        </div>
      )}

      {/* List of Manual Checks */}
      {!loading && !error && checks.length > 0 && (
        <div className="space-y-4">
          {checks.map((check) => {
            const guidance =
              CHECK_TYPE_GUIDANCE[check.checkType] || CHECK_TYPE_GUIDANCE.other;
            return (
              <div
                key={check.id}
                className="group relative rounded-xl border border-line bg-surface p-5 shadow-xs transition hover:border-line-strong"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-ink">
                        {guidance.label}
                      </h3>
                      {/* Result Badge */}
                      {check.result === "pass" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                          <Icon d={I.check} className="h-3 w-3" />
                          Passed
                        </span>
                      )}
                      {check.result === "issues_found" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          <Icon d={I.close} className="h-3 w-3" />
                          Issues found
                        </span>
                      )}
                      {check.result === "partial" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-semibold text-ink">
                          <span className="h-2 w-2 rounded-full bg-warn" />
                          Partially passed
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>
                        Tested by{" "}
                        <strong className="font-semibold text-ink">
                          {check.performedByName}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Tool:{" "}
                        <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-ink">
                          {check.tool}
                        </code>
                      </span>
                      <span>•</span>
                      <span>
                        Date:{" "}
                        <time dateTime={check.performedAt}>
                          {check.performedAt}
                        </time>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {check.attachmentKey && (
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(check)}
                        className="ease-ui flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-hover"
                        title="Download verified attachment"
                      >
                        <Icon
                          d={I.download}
                          className="h-3.5 w-3.5 text-muted"
                        />
                        <span>Attachment</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(check)}
                      className="ease-ui rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-ink"
                      title="Edit check details"
                      aria-label={`Edit ${guidance.label} check`}
                    >
                      <Icon d={I.settings} className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(check.id)}
                      className="ease-ui rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      title="Delete check"
                      aria-label={`Delete ${guidance.label} check`}
                    >
                      <Icon d={I.trash} className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Notes & Findings */}
                {check.notes && (
                  <div className="mt-3.5 rounded-lg bg-surface-subtle/50 p-3 text-sm text-ink leading-relaxed whitespace-pre-wrap">
                    {check.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log / Edit Dialog Modal */}
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-check-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs"
        >
          <div
            className="ease-ui relative w-full max-w-xl rounded-xl border border-line bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3
                id="manual-check-dialog-title"
                className="text-lg font-bold text-ink"
              >
                {editingCheck
                  ? "Edit Manual Check"
                  : "Log Manual Accessibility Check"}
              </h3>
              <button
                ref={modalCloseBtnRef}
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Close dialog"
              >
                <Icon d={I.close} className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Check Type */}
              <div>
                <label
                  htmlFor="form-check-type"
                  className="block text-sm font-semibold text-ink"
                >
                  Check type
                </label>
                <select
                  id="form-check-type"
                  value={formCheckType}
                  onChange={(e) => {
                    const val = e.target.value as ManualCheckType;
                    setFormCheckType(val);
                    setSelectedGuidanceType(val);
                  }}
                  className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {(Object.keys(CHECK_TYPE_GUIDANCE) as ManualCheckType[]).map(
                    (t) => (
                      <option key={t} value={t}>
                        {CHECK_TYPE_GUIDANCE[t].label} (
                        {CHECK_TYPE_GUIDANCE[t].duration})
                      </option>
                    ),
                  )}
                </select>
                <p className="mt-1 text-xs text-muted">
                  {CHECK_TYPE_GUIDANCE[formCheckType]?.summary}
                </p>
              </div>

              {/* Performed Date & Tester Name in 2 columns */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="form-performed-at"
                    className="block text-sm font-semibold text-ink"
                  >
                    Date performed
                  </label>
                  <input
                    id="form-performed-at"
                    type="date"
                    required
                    value={formPerformedAt}
                    onChange={(e) => setFormPerformedAt(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="form-performed-by"
                    className="block text-sm font-semibold text-ink"
                  >
                    Tester name
                  </label>
                  <input
                    id="form-performed-by"
                    type="text"
                    required
                    placeholder="e.g. Alex Smith"
                    value={formPerformedByName}
                    onChange={(e) => setFormPerformedByName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Tool / Environment */}
              <div>
                <label
                  htmlFor="form-tool"
                  className="block text-sm font-semibold text-ink"
                >
                  Testing tool & environment
                </label>
                <input
                  id="form-tool"
                  type="text"
                  required
                  placeholder="e.g. NVDA 2026.2 + Firefox 132"
                  value={formTool}
                  onChange={(e) => setFormTool(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted">Presets:</span>
                  {COMMON_TOOLS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormTool(t)}
                      className="rounded bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface-hover"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Result */}
              <div>
                <span className="block text-sm font-semibold text-ink">
                  Result
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <label
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition ${
                      formResult === "pass"
                        ? "border-success bg-success/10 text-success"
                        : "border-line bg-surface text-muted hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="check-result"
                      value="pass"
                      checked={formResult === "pass"}
                      onChange={() => setFormResult("pass")}
                      className="sr-only"
                    />
                    <Icon d={I.check} className="h-3.5 w-3.5" />
                    <span>Passed</span>
                  </label>

                  <label
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition ${
                      formResult === "issues_found"
                        ? "border-danger bg-danger/10 text-danger"
                        : "border-line bg-surface text-muted hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="check-result"
                      value="issues_found"
                      checked={formResult === "issues_found"}
                      onChange={() => setFormResult("issues_found")}
                      className="sr-only"
                    />
                    <Icon d={I.close} className="h-3.5 w-3.5" />
                    <span>Issues found</span>
                  </label>

                  <label
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition ${
                      formResult === "partial"
                        ? "border-warn bg-warn/15 text-ink"
                        : "border-line bg-surface text-muted hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="check-result"
                      value="partial"
                      checked={formResult === "partial"}
                      onChange={() => setFormResult("partial")}
                      className="sr-only"
                    />
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span>Partial</span>
                  </label>
                </div>
              </div>

              {/* Notes & Findings */}
              <div>
                <label
                  htmlFor="form-notes"
                  className="block text-sm font-semibold text-ink"
                >
                  Observations & notes
                </label>
                <textarea
                  id="form-notes"
                  rows={3}
                  placeholder="Describe your findings, steps followed, and any barriers identified..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-line bg-surface p-2.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              {/* Attachment Upload (PDF, PNG, JPG <= 10MB) */}
              <div>
                <label className="block text-sm font-semibold text-ink">
                  Evidence attachment (optional)
                </label>
                <p className="text-xs text-muted">
                  Screenshots, test notes, or audit PDFs (PDF, PNG, JPG, up to
                  10 MB).
                </p>

                {editingCheck?.attachmentKey &&
                  !removeExistingAttachment &&
                  !formFile && (
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-surface-subtle p-2.5 text-xs">
                      <span className="font-medium text-ink">
                        Existing attachment preserved
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemoveExistingAttachment(true)}
                        className="text-danger hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                <div className="mt-2">
                  <input
                    ref={fileInputRef}
                    id="form-attachment"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFormFile(f);
                      if (f) setRemoveExistingAttachment(false);
                    }}
                    className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-subtle file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:bg-surface-hover"
                  />
                  {formFile && (
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                      <span>
                        Selected: {formFile.name} (
                        {(formFile.size / 1024).toFixed(1)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormFile(null);
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                        }}
                        className="text-danger hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="ease-ui flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {saving && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
                  )}
                  <span>
                    {editingCheck ? "Save changes" : "Log manual check"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs"
        >
          <div className="ease-ui relative w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
            <h3 id="delete-dialog-title" className="text-lg font-bold text-ink">
              Delete Manual Check?
            </h3>
            <p className="mt-2 text-sm text-muted">
              This will remove the manual check record. An entry will be
              documented in the audit log, and your evidence timeline will
              record the deletion.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
