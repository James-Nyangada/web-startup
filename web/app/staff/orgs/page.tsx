"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StaffShell, card, formatDate, input, th, td, btn } from "@/components/staff/staff-shell";
import { formatMoney, staffApi, type StaffOrgRow, type SavedSegment } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

const PLANS = ["trial", "store", "growth", "agency", "agency_pro"];
const STATUSES = ["trialing", "active", "past_due", "paused", "canceled", "read_only"];
const HEALTH_BANDS = [
  { id: "good", label: "Good" },
  { id: "at_risk", label: "At risk" },
  { id: "poor", label: "Poor" },
];

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const HEALTH_COLORS: Record<string, string> = {
  good: "bg-ok-soft text-ok border-ok/20",
  at_risk: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  poor: "bg-crit-soft text-crit border-crit/20",
};

/** S-70: find an organisation by name, slug or member email, health score and saved segments. */
export default function StaffOrgsPage() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [healthBand, setHealthBand] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [rows, setRows] = useState<StaffOrgRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Segments state
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("");
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);

  const loadSegments = useCallback(async () => {
    try {
      const segs = await staffApi.segments();
      setSegments(segs);
    } catch {}
  }, []);

  useEffect(() => {
    void loadSegments();
  }, [loadSegments]);

  const load = useCallback(
    async (append: string | null = null) => {
      setState("loading");
      try {
        const page = await staffApi.listOrgs({
          q: q || undefined,
          plan: plan || undefined,
          status: status || undefined,
          healthBand: healthBand || undefined,
          includeDeleted,
          cursor: append,
        });
        setRows((prev) => (append ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [q, plan, status, healthBand, includeDeleted],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleSelectSegment = (id: string) => {
    setSelectedSegmentId(id);
    if (!id) return;
    const seg = segments.find((s) => s.id === id);
    if (seg?.filterConfig) {
      if (seg.filterConfig.plan !== undefined) setPlan(seg.filterConfig.plan);
      if (seg.filterConfig.status !== undefined) setStatus(seg.filterConfig.status);
      if (seg.filterConfig.healthBand !== undefined) setHealthBand(seg.filterConfig.healthBand);
    }
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSegmentName.trim()) return;
    setSavingSegment(true);
    try {
      const created = await staffApi.saveSegment(newSegmentName.trim(), {
        plan: plan || undefined,
        status: status || undefined,
        healthBand: healthBand || undefined,
      });
      setSegments([...segments, created]);
      setSelectedSegmentId(created.id);
      setSaveSegmentOpen(false);
      setNewSegmentName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save segment.");
    } finally {
      setSavingSegment(false);
    }
  };

  return (
    <StaffShell
      title="Organisations"
      actions={
        <div className="flex items-center gap-2">
          {selectedSegmentId && (
            <a
              href={staffApi.segmentCsvPath(selectedSegmentId)}
              download
              className={btn.secondary}
              title="Export opted-in contacts for this segment"
            >
              <Icon d={I.download} size={15} />
              Export segment contacts
            </a>
          )}
          <button
            type="button"
            className={btn.secondary}
            onClick={() => setSaveSegmentOpen(true)}
          >
            <Icon d={I.plus} size={15} />
            Save as segment
          </button>
        </div>
      }
    >
      <div className="mb-6">
        <p className="m-0 text-sm text-muted">
          All customer organisations, subscription status, and computed health scores.
          Health scores are computed nightly based on login recency, scan volume, critical issues, and billing.
        </p>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className={`${card} mb-4 space-y-3`}>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          <div className="sm:col-span-2 md:col-span-1 lg:col-span-2">
            <label htmlFor="org-q" className="mb-1 block text-xs font-semibold text-muted">
              Search
            </label>
            <input
              id="org-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, slug or member email"
              className={input}
            />
          </div>
          <div>
            <label htmlFor="org-plan" className="mb-1 block text-xs font-semibold text-muted">
              Plan
            </label>
            <select id="org-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={input}>
              <option value="">All plans</option>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="org-status" className="mb-1 block text-xs font-semibold text-muted">
              Billing status
            </label>
            <select id="org-status" value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="org-health" className="mb-1 block text-xs font-semibold text-muted">
              Health score
            </label>
            <select id="org-health" value={healthBand} onChange={(e) => setHealthBand(e.target.value)} className={input}>
              <option value="">Any health band</option>
              {HEALTH_BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
          <div className="flex items-center gap-3">
            <label htmlFor="saved-segments" className="text-xs font-semibold text-muted whitespace-nowrap">
              Saved Segment:
            </label>
            <select
              id="saved-segments"
              value={selectedSegmentId}
              onChange={(e) => handleSelectSegment(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
            >
              <option value="">Custom filters</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="size-4 rounded text-primary focus:ring-primary"
            />
            Include deleted
          </label>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Organisations</caption>
            <thead className="border-b border-line bg-subtle">
              <tr>
                <th scope="col" className={th}>Organisation</th>
                <th scope="col" className={th}>Health</th>
                <th scope="col" className={th}>Plan</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={`${th} text-right`}>Sites</th>
                <th scope="col" className={`${th} text-right`}>MRR</th>
                <th scope="col" className={th}>Last activity</th>
                <th scope="col" className={th}>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-subtle/50">
                  <td className={td}>
                    <Link href={`/staff/orgs/${o.id}`} className="font-semibold text-ink hover:text-ptext">
                      {o.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {o.slug} · {o.type}
                      {o.deletedAt && <span className="ml-1 font-semibold text-crit">deleted</span>}
                    </div>
                  </td>
                  <td className={td}>
                    {o.health ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                          HEALTH_COLORS[o.health.band] || "bg-subtle text-muted"
                        }`}
                        title={`Health score: ${o.health.score}/100`}
                      >
                        <span>{o.health.score}</span>
                        <span className="capitalize font-normal text-[11px]">({o.health.band.replace("_", " ")})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Pending</span>
                    )}
                  </td>
                  <td className={td}>
                    {label(o.plan)}
                    {o.planOverride && (
                      <div className="text-xs text-ser">
                        Override: {label(o.planOverride)} until {formatDate(o.planOverrideExpiresAt)}
                      </div>
                    )}
                  </td>
                  <td className={td}>{label(o.billingStatus)}</td>
                  <td className={`${td} tnum text-right`}>{o.siteCount}</td>
                  <td className={`${td} tnum text-right font-semibold`}>{o.mrrCents ? formatMoney(o.mrrCents) : "-"}</td>
                  <td className={`${td} text-xs text-muted`}>{formatDate(o.lastActivityAt, true)}</td>
                  <td className={`${td} text-xs text-muted`}>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state === "ready" && rows.length === 0 && (
          <p className="m-0 p-8 text-center text-sm text-muted">No organisations match these filters.</p>
        )}
        {state === "error" && (
          <p role="alert" className="m-0 p-8 text-center text-sm text-crit">
            Organisations could not load.{" "}
            <button type="button" className="font-semibold text-ptext underline" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}
      </div>

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button type="button" className={btn.secondary} onClick={() => void load(cursor)} disabled={state === "loading"}>
            Load more
          </button>
        </div>
      )}

      {/* Save Segment Modal */}
      {saveSegmentOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-segment-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h2 id="save-segment-title" className="m-0 mb-3 text-lg font-bold text-ink">
              Save Segment
            </h2>
            <p className="text-xs text-muted mb-4">
              Save current filter criteria (Plan: {plan || "All"}, Status: {status || "Any"}, Health: {healthBand || "Any"})
              as a named segment for repeated monitoring and CSV export.
            </p>

            <form onSubmit={handleSaveSegment} className="space-y-4">
              <div>
                <label htmlFor="segment-name" className="mb-1 block text-xs font-semibold text-muted">
                  Segment Name
                </label>
                <input
                  id="segment-name"
                  type="text"
                  required
                  placeholder="e.g. Trialing, At risk, Day 5+"
                  value={newSegmentName}
                  onChange={(e) => setNewSegmentName(e.target.value)}
                  className={input}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setSaveSegmentOpen(false)}
                  disabled={savingSegment}
                >
                  Cancel
                </button>
                <button type="submit" className={btn.primary} disabled={savingSegment}>
                  {savingSegment ? "Saving…" : "Save segment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
