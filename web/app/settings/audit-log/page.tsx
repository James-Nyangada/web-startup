"use client";

import React, { useCallback, useEffect, useState } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { apiBaseUrl, ApiException } from "@/lib/api";
import { useActiveOrg } from "@/lib/use-active-org";
import { orgSettingsApi, type AuditEntry, type AuditFilters } from "@/lib/admin-api";

const field =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const ACTOR_LABEL: Record<AuditEntry["actorType"], string> = {
  user: "Person",
  staff: "EveryVisitor staff",
  system: "System",
  api_key: "API key",
};

function actorOf(e: AuditEntry): string {
  if (e.actorType === "api_key") return `API key ${String(e.data?.apiKeyPrefix ?? "")}`.trim();
  if (e.actorType === "system") return "System";
  return e.actorName || e.actorEmail || ACTOR_LABEL[e.actorType];
}

function targetOf(e: AuditEntry): string {
  const d = e.data ?? {};
  const named = d.name ?? d.email ?? d.domain ?? d.key;
  if (typeof named === "string") return named;
  return e.targetType ? `${e.targetType}${e.targetId ? ` ${e.targetId.slice(0, 8)}` : ""}` : "-";
}

/** S-51: searchable, filterable audit log for owners and admins, with CSV export (P6-08). */
export default function AuditLogSettingsPage() {
  const { slug } = useActiveOrg();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [q, setQ] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");

  const load = useCallback(
    async (append: string | null = null) => {
      if (!slug) return;
      setState("loading");
      try {
        const res = await orgSettingsApi.auditLog(slug, filters, append);
        setEntries((prev) => (append ? [...prev, ...res.data.entries] : res.data.entries));
        setCursor(res.nextCursor);
        setState("ready");
      } catch (err) {
        setState(err instanceof ApiException && err.status === 403 ? "forbidden" : "error");
      }
    },
    [slug, filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (slug) orgSettingsApi.auditActions(slug).then(setActions).catch(() => setActions([]));
  }, [slug]);

  // Debounce free-text search into the filters.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: q.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [q]);

  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const exportHref = slug ? `${apiBaseUrl()}${orgSettingsApi.auditCsvPath(slug, filters)}` : undefined;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <SettingsLayout
      title="Audit Log"
      description="A permanent record of security and administrative actions in this organisation. Entries cannot be changed or deleted."
    >
      <div className="flex max-w-6xl flex-col gap-4">
        {state === "forbidden" ? (
          <p className="m-0 rounded-xl border border-line bg-subtle px-4 py-3 text-sm">
            Only owners and admins can see the audit log.
          </p>
        ) : (
          <>
            <form
              role="search"
              aria-label="Filter the audit log"
              onSubmit={(e) => e.preventDefault()}
              className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_1fr]"
            >
              <div>
                <label htmlFor="audit-q" className="mb-1 block text-xs font-semibold text-muted">
                  Search
                </label>
                <input
                  id="audit-q"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Person, email, action or target"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="audit-action" className="mb-1 block text-xs font-semibold text-muted">
                  Action
                </label>
                <select
                  id="audit-action"
                  value={filters.action ?? ""}
                  onChange={(e) => set({ action: e.target.value || undefined })}
                  className={field}
                >
                  <option value="">All actions</option>
                  {[...new Set(actions.map((a) => `${a.split(".")[0]}.`))].map((group) => (
                    <optgroup key={group} label={group.slice(0, -1)}>
                      <option value={group}>All {group.slice(0, -1)} actions</option>
                      {actions
                        .filter((a) => a.startsWith(group))
                        .map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="audit-actor" className="mb-1 block text-xs font-semibold text-muted">
                  Done by
                </label>
                <select
                  id="audit-actor"
                  value={filters.actorType ?? ""}
                  onChange={(e) => set({ actorType: e.target.value || undefined })}
                  className={field}
                >
                  <option value="">Anyone</option>
                  {Object.entries(ACTOR_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="audit-from" className="mb-1 block text-xs font-semibold text-muted">
                  From
                </label>
                <input
                  id="audit-from"
                  type="date"
                  value={filters.from ?? ""}
                  onChange={(e) => set({ from: e.target.value || undefined })}
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="audit-to" className="mb-1 block text-xs font-semibold text-muted">
                  Until
                </label>
                <input
                  id="audit-to"
                  type="date"
                  value={filters.to ?? ""}
                  onChange={(e) => set({ to: e.target.value || undefined })}
                  className={field}
                />
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="m-0 text-xs text-muted">
                {state === "loading"
                  ? "Loading…"
                  : `${entries.length}${cursor ? "+" : ""} entr${entries.length === 1 ? "y" : "ies"}${filtered ? " match your filters" : ""}`}
              </p>
              <div className="flex gap-2">
                {filtered && (
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setFilters({});
                    }}
                    className="ease-ui rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-subtle"
                  >
                    Clear filters
                  </button>
                )}
                <a
                  href={exportHref}
                  className="ease-ui rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink no-underline hover:bg-subtle"
                >
                  Export CSV
                </a>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Audit log entries, newest first</caption>
                  <thead>
                    <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                      <th scope="col" className="px-4 py-3">Time</th>
                      <th scope="col" className="px-4 py-3">Action</th>
                      <th scope="col" className="px-4 py-3">Done by</th>
                      <th scope="col" className="px-4 py-3">Target</th>
                      <th scope="col" className="px-4 py-3 text-right">IP address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-subtle/50">
                        <td className="whitespace-nowrap px-4 py-3 text-muted">
                          <time dateTime={e.createdAt}>
                            {new Intl.DateTimeFormat("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(e.createdAt))}
                          </time>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-ink">{e.action}</td>
                        <td className="px-4 py-3 text-ink">
                          {actorOf(e)}
                          {e.actorType === "staff" && (
                            <span className="ml-1 rounded-full bg-ser-soft px-1.5 py-0.5 text-[11px] font-semibold text-ser">staff</span>
                          )}
                          {typeof e.data?.reason === "string" && <span className="block text-muted">“{e.data.reason}”</span>}
                        </td>
                        <td className="px-4 py-3 text-muted">{targetOf(e)}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{e.ip ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state === "ready" && entries.length === 0 && (
                <p className="m-0 p-6 text-center text-sm text-muted">
                  {filtered ? "No entries match these filters." : "Nothing has been recorded yet."}
                </p>
              )}
              {state === "error" && (
                <p role="alert" className="m-0 p-6 text-center text-sm text-crit">
                  The audit log could not load.{" "}
                  <button type="button" className="font-semibold text-ptext underline" onClick={() => void load()}>
                    Try again
                  </button>
                </p>
              )}
            </div>

            {cursor && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void load(cursor)}
                  disabled={state === "loading"}
                  className="ease-ui rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50"
                >
                  Load older entries
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SettingsLayout>
  );
}
