"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

export type EvidenceEventType =
  | "site_added"
  | "site_verified"
  | "scan_completed"
  | "issue_fixed"
  | "issue_regressed"
  | "issue_ignored"
  | "manual_check_logged"
  | "statement_published"
  | "report_generated"
  | "report_sent"
  | "plan_changed";

export interface EvidenceEventItem {
  id: string;
  orgId: string;
  siteId: string;
  type: EvidenceEventType;
  actorId: string | null;
  occurredAt: string;
  data: Record<string, any>;
}

export interface EvidenceTabProps {
  orgSlug: string;
  siteId: string;
  siteName?: string;
  onToast?: (msg: string) => void;
}

const TYPE_CATEGORIES: {
  id: string;
  label: string;
  types?: EvidenceEventType[];
}[] = [
  { id: "all", label: "All events" },
  { id: "scans", label: "Scans", types: ["scan_completed"] },
  {
    id: "issues",
    label: "Issues",
    types: ["issue_fixed", "issue_regressed", "issue_ignored"],
  },
  { id: "checks", label: "Manual checks", types: ["manual_check_logged"] },
  { id: "statements", label: "Statements", types: ["statement_published"] },
  { id: "reports", label: "Reports", types: ["report_generated", "report_sent"] },
  {
    id: "governance",
    label: "Site & Plan",
    types: ["site_added", "site_verified", "plan_changed"],
  },
];

const REPORT_NAMES: Record<string, string> = {
  scan_summary: "Scan summary",
  full: "Full audit report",
  evidence_pack: "Evidence pack",
  client_monthly: "Client monthly report",
  agency_overview: "Agency overview",
};

/** "wont_fix" → "wont fix" */
function humanize(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value.replace(/_/g, " ") : fallback;
}

export function EvidenceTab({ orgSlug, siteId, siteName = "Website", onToast }: EvidenceTabProps) {
  const [events, setEvents] = useState<EvidenceEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (fromDate) params.set("from", new Date(fromDate).toISOString());
      if (toDate) params.set("to", new Date(`${toDate}T23:59:59.999Z`).toISOString());
      params.set("limit", "100");

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient<{ events: EvidenceEventItem[]; total: number }>(
        `/v1/orgs/${orgSlug}/sites/${siteId}/evidence${queryStr}`,
      );

      setEvents(res?.events ?? []);
      setTotal(res?.total ?? 0);
    } catch {
      setEvents([]);
      setTotal(0);
      setError("The evidence timeline could not be loaded. Use Refresh to try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [siteId, orgSlug, fromDate, toDate]);

  // Client-side category filtering
  const filteredEvents = useMemo(() => {
    if (selectedCategory === "all") return events;
    const cat = TYPE_CATEGORIES.find((c) => c.id === selectedCategory);
    if (!cat?.types) return events;
    return events.filter((e) => cat.types!.includes(e.type));
  }, [events, selectedCategory]);

  const handlePreset = (days: number | null) => {
    if (days === null) {
      setFromDate("");
      setToDate("");
    } else {
      const now = new Date();
      const past = new Date(Date.now() - days * 86400000);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
    }
  };

  const getEventMeta = (event: EvidenceEventItem) => {
    switch (event.type) {
      case "site_added":
        return {
          title: "Site registered in workspace",
          detail: `Initial record established for ${event.data?.name || siteName}${event.data?.rootUrl ? ` (${event.data.rootUrl})` : ""}.`,
          icon: I.globe,
          badge: "Site",
          badgeColor: "bg-surface-sunken text-muted border-line",
          sourceHref: `/${orgSlug}/sites/${siteId}`,
          sourceLabel: "View site overview",
        };
      case "site_verified":
        return {
          title: "Domain ownership verified",
          detail: `Ownership verified via ${humanize(event.data?.method, "token")}.`,
          icon: I.fixed,
          badge: "Verification",
          badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
          sourceHref: `/${orgSlug}/sites/${siteId}`,
          sourceLabel: "View verification details",
        };
      case "scan_completed":
        return {
          title: `Automated scan completed (Score ${event.data?.score ?? "-"}/100)`,
          detail: `Scanned ${event.data?.pagesScanned ?? "all"} pages: ${event.data?.counts?.new ?? 0} new, ${event.data?.counts?.fixed ?? 0} fixed and ${event.data?.counts?.regressed ?? 0} regressed issues.`,
          icon: I.search,
          badge: "Scan",
          badgeColor: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
          sourceHref: event.data?.scanId
            ? `/${orgSlug}/sites/${siteId}/scans/${event.data.scanId}`
            : `/${orgSlug}/sites/${siteId}/scans`,
          sourceLabel: "View scan audit",
        };
      case "issue_fixed":
        return {
          title: `Remediation verified: ${event.data?.ruleId || "Issue"} resolved`,
          detail: "Accessibility defect fixed and confirmed by subsequent engine verification.",
          icon: I.fixed,
          badge: "Fixed",
          badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
          sourceHref: event.data?.issueId
            ? `/${orgSlug}/sites/${siteId}/issues/${event.data.issueId}`
            : `/${orgSlug}/sites/${siteId}/issues`,
          sourceLabel: "View issue details",
        };
      case "issue_regressed":
        return {
          title: `Regression detected: ${event.data?.ruleId || "Defect"} reopened`,
          detail: "Defect previously marked as fixed has reappeared on the monitored page.",
          icon: I.regressed,
          badge: "Regression",
          badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
          sourceHref: event.data?.issueId
            ? `/${orgSlug}/sites/${siteId}/issues/${event.data.issueId}`
            : `/${orgSlug}/sites/${siteId}/issues`,
          sourceLabel: "Inspect regression",
        };
      case "issue_ignored":
        return {
          title: `Issue ignored: ${humanize(event.data?.reason, "no reason given")}`,
          detail: event.data?.note || "Exception granted with justification recorded.",
          icon: I.shield,
          badge: "Ignored",
          badgeColor: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
          sourceHref: event.data?.issueId
            ? `/${orgSlug}/sites/${siteId}/issues/${event.data.issueId}`
            : `/${orgSlug}/sites/${siteId}/issues`,
          sourceLabel: "View justification",
        };
      case "manual_check_logged":
        return {
          title: event.data?.deleted
            ? `Manual check removed: ${humanize(event.data?.checkType, "manual check")}`
            : `Manual testing logged: ${humanize(event.data?.checkType, "manual check")}`,
          detail: event.data?.deleted
            ? "The check record was deleted; this entry preserves that it existed."
            : [
                `Result: ${humanize(event.data?.result, "recorded")}.`,
                event.data?.performedByName ? `Tester: ${event.data.performedByName}.` : null,
                event.data?.tool ? `Tool: ${event.data.tool}.` : null,
              ]
                .filter(Boolean)
                .join(" "),
          icon: I.users,
          badge: "Manual",
          badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
          sourceHref: `/${orgSlug}/sites/${siteId}/manual-checks`,
          sourceLabel: "View check report",
        };
      case "statement_published":
        return {
          title: `Accessibility statement published (v${event.data?.version ?? 1})`,
          detail: [
            "Accessibility statement published",
            event.data?.targetStandard ? `against ${humanize(event.data.targetStandard, "")}` : null,
            event.data?.conformanceStatus
              ? `with ${humanize(event.data.conformanceStatus, "")} conformance`
              : null,
          ]
            .filter(Boolean)
            .join(" ") + ".",
          icon: I.fileText,
          badge: "Statement",
          badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
          sourceHref: `/${orgSlug}/sites/${siteId}/statement`,
          sourceLabel: "View statement",
        };
      case "report_generated":
        return {
          title: `Report generated: ${REPORT_NAMES[event.data?.type] ?? "Audit report"}`,
          detail: "PDF report generated and stored.",
          icon: I.fileText,
          badge: "Report",
          badgeColor: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
          sourceHref: `/${orgSlug}/sites/${siteId}/reports`,
          sourceLabel: "Download report",
        };
      case "report_sent":
        return {
          title: `Report emailed: ${REPORT_NAMES[event.data?.type] ?? "Audit report"}`,
          detail: (() => {
            const count = Array.isArray(event.data?.recipients) ? event.data.recipients.length : 0;
            return count ? `Sent to ${count} ${count === 1 ? "recipient" : "recipients"}.` : "Sent by email.";
          })(),
          icon: I.external,
          badge: "Delivery",
          badgeColor: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
          sourceHref: `/${orgSlug}/sites/${siteId}/reports`,
          sourceLabel: "View sent reports",
        };
      case "plan_changed":
        return {
          title: `Plan update: ${humanize(event.data?.plan, "subscription")}${event.data?.interval ? ` (${event.data.interval})` : ""}`,
          detail: "Organisation subscription tier changed; monitoring limits adjusted.",
          icon: I.creditCard,
          badge: "Governance",
          badgeColor: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
          sourceHref: `/settings/billing`,
          sourceLabel: "View billing",
        };
      default:
        return {
          title: (event.type as string).replace(/_/g, " "),
          detail: "Compliance record entry.",
          icon: I.minor,
          badge: "Event",
          badgeColor: "bg-surface-sunken text-muted border-line",
          sourceHref: `/${orgSlug}/sites/${siteId}`,
          sourceLabel: "View details",
        };
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Evidence timeline
          </h2>
          <p className="mt-1 text-sm text-muted">
            Dated, append-only compliance record of scans, issue remediation, manual tests, and governance events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Append-only verified
          </span>
          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            aria-label="Refresh timeline"
            className="ease-ui inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-subtle"
          >
            <Icon d={I.refresh} className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-col gap-4">
          {/* Category Tabs */}
          <div
            role="tablist"
            aria-label="Filter events by category"
            className="flex flex-wrap gap-1.5 border-b border-line pb-3"
          >
            {TYPE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`ease-ui rounded-full px-3 py-1.5 text-xs font-medium ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "bg-surface-sunken text-muted hover:bg-subtle hover:text-ink"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Date Range Inputs & Presets */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="ev-from" className="text-xs font-medium text-muted">
                From:
              </label>
              <input
                id="ev-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="ease-ui rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
              />
              <label htmlFor="ev-to" className="text-xs font-medium text-muted">
                To:
              </label>
              <input
                id="ev-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="ease-ui rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
              />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => handlePreset(null)}
                  className="ease-ui rounded-lg px-2 py-1 text-xs text-muted hover:text-ink"
                >
                  Clear dates
                </button>
              )}
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handlePreset(7)}
                className="ease-ui rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted hover:bg-subtle hover:text-ink"
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => handlePreset(30)}
                className="ease-ui rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted hover:bg-subtle hover:text-ink"
              >
                30d
              </button>
              <button
                type="button"
                onClick={() => handlePreset(90)}
                className="ease-ui rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted hover:bg-subtle hover:text-ink"
              >
                90d
              </button>
              <button
                type="button"
                onClick={() => handlePreset(null)}
                className="ease-ui rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted hover:bg-subtle hover:text-ink"
              >
                All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      {error && !loading ? (
        <div
          role="alert"
          className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted shadow-card"
        >
          {error}
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-3 py-8" role="status" aria-label="Loading events">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-line bg-surface-sunken"
            />
          ))}
          <span className="sr-only">Loading evidence timeline...</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface p-12 text-center shadow-card">
          <div className="rounded-full bg-subtle p-3 text-muted">
            <Icon d={I.search} className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-ink">
            {events.length === 0 && !fromDate && !toDate ? "No evidence recorded yet" : "No evidence events found"}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {events.length === 0 && !fromDate && !toDate
              ? "Events are logged automatically as this site is verified, scanned, and remediated."
              : "No events matched your current category or date range filter. Try broadening your criteria."}
          </p>
          {(selectedCategory !== "all" || fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              handlePreset(null);
            }}
            className="ease-ui mt-4 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-medium text-ink hover:bg-subtle"
          >
            Reset all filters
          </button>
          )}
        </div>
      ) : (
        <div className="relative border-l border-line ml-4 md:ml-6 flex flex-col gap-6 pl-6 py-2">
          {filteredEvents.map((event) => {
            const meta = getEventMeta(event);
            const formattedDate = new Date(event.occurredAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            });
            const formattedTime = new Date(event.occurredAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "UTC",
            });

            return (
              <div
                key={event.id}
                className="relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong"
              >
                {/* Node on vertical timeline */}
                <span
                  aria-hidden="true"
                  className="absolute -left-[31px] top-5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-line bg-surface text-ink ring-4 ring-background"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                </span>

                {/* Event header row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeColor}`}
                    >
                      <Icon d={meta.icon} className="h-3 w-3" />
                      {meta.badge}
                    </span>
                    <h3 className="text-sm font-semibold text-ink">{meta.title}</h3>
                  </div>
                  <time
                    dateTime={event.occurredAt}
                    className="text-xs text-muted font-mono whitespace-nowrap"
                  >
                    {formattedDate} · {formattedTime} UTC
                  </time>
                </div>

                {/* Description */}
                <p className="text-xs text-muted leading-relaxed m-0">{meta.detail}</p>

                {/* Footer with deep link to source (Acceptance: every row links to its source) */}
                <div className="mt-1 flex items-center justify-between border-t border-line/60 pt-2 text-xs">
                  <span className="text-[11px] text-muted">
                    Logged by {event.actorId ? "team member" : "automated system"}
                  </span>
                  <Link
                    href={meta.sourceHref}
                    className="ease-ui inline-flex items-center gap-1 font-semibold text-ptext hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                  >
                    <span>{meta.sourceLabel}</span>
                    <Icon d={I.chevronRight} className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
          {total > events.length && (
            <p className="m-0 text-xs text-muted">
              Showing the latest {events.length} of {total} events. Narrow the date range to see older entries.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
