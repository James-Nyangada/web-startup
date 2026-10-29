"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { staffApi, type AuditEntry } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

export default function StaffAuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [staffOnly, setStaffOnly] = useState(true);
  const [actorType, setActorType] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [q, setQ] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const load = useCallback(
    async (append: string | null = null) => {
      setState("loading");
      try {
        const page = await staffApi.auditLog({
          staffOnly: staffOnly || undefined,
          actorType: !staffOnly && actorType ? actorType : undefined,
          action: action.trim() || undefined,
          q: q.trim() || undefined,
          cursor: append,
        });
        setEntries((prev) => (append ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [staffOnly, actorType, action, q],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const csvUrl = staffApi.auditCsvPath({
    staffOnly: staffOnly || undefined,
    actorType: !staffOnly && actorType ? actorType : undefined,
    action: action.trim() || undefined,
    q: q.trim() || undefined,
  });

  return (
    <StaffShell
      title="Global Audit Log"
      actions={
        <a
          href={csvUrl}
          download
          className={btn.secondary}
          aria-label="Export audit entries to CSV"
        >
          <Icon d={I.download} size={15} />
          Export CSV
        </a>
      }
    >
      <div className="mb-6">
        <p className="m-0 text-sm text-muted">
          Immutable audit log of all system, user, and staff actor actions across organisations.
          Every privileged administrative change, content publish, and billing override is permanently recorded.
        </p>
      </div>

      {/* Filter controls */}
      <div className={`${card} mb-6 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center`}>
        <div>
          <label htmlFor="audit-q" className="sr-only">Search audit log</label>
          <input
            id="audit-q"
            type="search"
            placeholder="Search action, actor email, target…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={input}
          />
        </div>

        <div>
          <label htmlFor="audit-action" className="sr-only">Filter action</label>
          <input
            id="audit-action"
            type="text"
            placeholder="Filter action (e.g. staff., content.)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={input}
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={staffOnly}
            onChange={(e) => setStaffOnly(e.target.checked)}
            className="size-4 rounded text-primary focus:ring-primary"
          />
          <span>Staff actors only</span>
        </label>

        {!staffOnly && (
          <div>
            <select
              value={actorType}
              onChange={(e) => setActorType(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink"
            >
              <option value="">All actor types</option>
              <option value="user">User</option>
              <option value="staff">Staff</option>
              <option value="system">System</option>
              <option value="api_key">API Key</option>
            </select>
          </div>
        )}
      </div>

      {/* Audit table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Audit log records</caption>
            <thead className="border-b border-line bg-subtle">
              <tr>
                <th scope="col" className={th}>Timestamp</th>
                <th scope="col" className={th}>Actor</th>
                <th scope="col" className={th}>Action</th>
                <th scope="col" className={th}>Target</th>
                <th scope="col" className={th}>Client IP</th>
                <th scope="col" className={`${th} text-right`}>Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => {
                const isExpanded = expandedEntry === entry.id;
                return (
                  <React.Fragment key={entry.id}>
                    <tr className="hover:bg-subtle/50">
                      <td className={`${td} whitespace-nowrap text-xs text-muted font-mono`}>
                        {formatDate(entry.createdAt, true)}
                      </td>
                      <td className={td}>
                        <div className="font-semibold text-ink text-xs">
                          {entry.actorEmail || entry.actorName || entry.actorId || "System"}
                        </div>
                        <div className="text-[10px] text-muted capitalize">
                          Type: <span className="font-medium text-ink">{entry.actorType}</span>
                        </div>
                      </td>
                      <td className={td}>
                        <code className="rounded bg-subtle px-1.5 py-0.5 text-xs font-mono font-semibold text-ptext">
                          {entry.action}
                        </code>
                      </td>
                      <td className={`${td} text-xs text-muted`}>
                        {entry.targetType ? (
                          <div>
                            <span className="font-semibold text-ink">{entry.targetType}</span>
                            {entry.targetId && <span className="font-mono text-[10px] block">{entry.targetId}</span>}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={`${td} text-xs font-mono text-muted whitespace-nowrap`}>
                        {entry.ip || "-"}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        {entry.data && Object.keys(entry.data).length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                            className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted hover:text-ink hover:bg-subtle"
                          >
                            {isExpanded ? "Hide data" : "View data"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted">-</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && entry.data && (
                      <tr className="bg-subtle/30">
                        <td colSpan={6} className="p-4 border-t border-line/60">
                          <pre className="m-0 max-h-60 overflow-auto rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink">
                            {JSON.stringify(entry.data, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {state === "ready" && entries.length === 0 && (
          <p className="m-0 p-8 text-center text-sm text-muted">
            No audit records match your filters.
          </p>
        )}
      </div>

      {cursor && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className={btn.secondary}
            onClick={() => void load(cursor)}
            disabled={state === "loading"}
          >
            Load more audit entries
          </button>
        </div>
      )}
    </StaffShell>
  );
}
