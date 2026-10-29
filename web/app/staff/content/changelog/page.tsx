"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { staffApi, type ChangelogEntry } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

const TYPE_COLORS: Record<string, string> = {
  new: "bg-primary-soft text-ptext border-primary/20",
  improved: "bg-ser-soft text-ser border-ser/20",
  fixed: "bg-ok-soft text-ok border-ok/20",
};

export default function StaffChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editingEntry, setEditingEntry] = useState<Partial<ChangelogEntry> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await staffApi.listChangelog(statusFilter ? { status: statusFilter } : undefined);
      setEntries(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenNew = () => {
    setIsNew(true);
    setEditingEntry({
      date: new Date().toISOString().split("T")[0],
      title: "",
      type: "new",
      bodyMd: "",
      showInApp: true,
      status: "draft",
    });
    setErrorMsg(null);
  };

  const handleOpenEdit = (entry: ChangelogEntry) => {
    setIsNew(false);
    setEditingEntry({ ...entry });
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    if (!editingEntry.title?.trim()) {
      setErrorMsg("Title is required.");
      return;
    }
    if (!editingEntry.bodyMd?.trim()) {
      setErrorMsg("Body content is required.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      if (isNew) {
        await staffApi.createChangelog(editingEntry);
      } else if (editingEntry.id) {
        await staffApi.updateChangelog(editingEntry.id, editingEntry);
      }
      setEditingEntry(null);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save changelog entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await staffApi.deleteChangelog(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete entry.");
    }
  };

  const handleTogglePublish = async (entry: ChangelogEntry) => {
    const nextStatus = entry.status === "published" ? "draft" : "published";
    try {
      await staffApi.updateChangelog(entry.id, { status: nextStatus });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.title.toLowerCase().includes(q) || e.bodyMd.toLowerCase().includes(q);
  });

  return (
    <StaffShell
      title="Changelog"
      actions={
        <button type="button" className={btn.primary} onClick={handleOpenNew}>
          <Icon d={I.plus} size={16} />
          New entry
        </button>
      }
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-sm text-muted">
          Published entries appear on <code className="text-xs bg-subtle px-1 py-0.5 rounded">/changelog</code> and in the monthly customer email digest.
          Entries with &quot;Show in app&quot; light up the &quot;What&apos;s new&quot; indicator for 14 days.
        </p>
      </div>

      <div className={`${card} mb-6 flex flex-wrap items-center gap-4`}>
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="changelog-search" className="sr-only">Search changelog</label>
          <input
            id="changelog-search"
            type="search"
            placeholder="Search entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="changelog-status" className="text-xs font-semibold text-muted">Status</label>
          <select
            id="changelog-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">All statuses</option>
            <option value="draft">Drafts only</option>
            <option value="published">Published only</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full border-collapse">
          <caption className="sr-only">Changelog entries</caption>
          <thead className="border-b border-line bg-subtle">
            <tr>
              <th scope="col" className={th}>Date</th>
              <th scope="col" className={th}>Type</th>
              <th scope="col" className={th}>Title</th>
              <th scope="col" className={th}>In-app badge</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-subtle/50">
                <td className={`${td} whitespace-nowrap text-xs font-mono text-muted`}>
                  {entry.date}
                </td>
                <td className={td}>
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                      TYPE_COLORS[entry.type] || "bg-subtle text-muted"
                    }`}
                  >
                    {entry.type}
                  </span>
                </td>
                <td className={td}>
                  <div className="font-semibold text-ink">{entry.title}</div>
                  <div className="line-clamp-2 text-xs text-muted mt-0.5 max-w-xl">
                    {entry.bodyMd}
                  </div>
                </td>
                <td className={td}>
                  {entry.showInApp ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <span className="size-2 rounded-full bg-primary animate-pulse" />
                      Active (14d)
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Off</span>
                  )}
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => void handleTogglePublish(entry)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      entry.status === "published"
                        ? "bg-ok-soft text-ok hover:bg-ok/20"
                        : "bg-subtle text-muted hover:bg-subtle/80"
                    }`}
                    title="Click to toggle publish status"
                  >
                    {entry.status === "published" ? "Published" : "Draft"}
                  </button>
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:text-ink hover:bg-subtle"
                      onClick={() => handleOpenEdit(entry)}
                      aria-label={`Edit ${entry.title}`}
                    >
                      <Icon d={I.pencil} size={15} />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-crit/70 hover:text-crit hover:bg-crit-soft"
                      onClick={() => void handleDelete(entry.id, entry.title)}
                      aria-label={`Delete ${entry.title}`}
                    >
                      <Icon d={I.trash} size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {state === "ready" && filtered.length === 0 && (
          <p className="m-0 p-8 text-center text-sm text-muted">
            {entries.length === 0 ? "No changelog entries yet. Create your first one!" : "No changelog entries match your search."}
          </p>
        )}
        {state === "error" && (
          <p role="alert" className="m-0 p-8 text-center text-sm text-crit">
            Could not load changelog entries.
          </p>
        )}
      </div>

      {/* Editor Modal */}
      {editingEntry && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="changelog-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h2 id="changelog-dialog-title" className="m-0 text-lg font-bold text-ink">
                {isNew ? "New changelog entry" : "Edit changelog entry"}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded p-1 text-muted hover:text-ink"
                aria-label="Close"
              >
                <Icon d={I.x} size={18} />
              </button>
            </div>

            {errorMsg && (
              <div role="alert" className="mb-4 rounded-xl border border-crit/30 bg-crit-soft p-3 text-sm text-crit">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="entry-date" className="mb-1 block text-xs font-semibold text-muted">
                    Release date
                  </label>
                  <input
                    id="entry-date"
                    type="date"
                    required
                    value={editingEntry.date || ""}
                    onChange={(e) => setEditingEntry({ ...editingEntry, date: e.target.value })}
                    className={input}
                  />
                </div>
                <div>
                  <label htmlFor="entry-type" className="mb-1 block text-xs font-semibold text-muted">
                    Entry type
                  </label>
                  <select
                    id="entry-type"
                    value={editingEntry.type || "new"}
                    onChange={(e) => setEditingEntry({ ...editingEntry, type: e.target.value as any })}
                    className={input}
                  >
                    <option value="new">New (Feature / capability)</option>
                    <option value="improved">Improved (Refinement / UX)</option>
                    <option value="fixed">Fixed (Bug fix / remediation)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="entry-title" className="mb-1 block text-xs font-semibold text-muted">
                  Title
                </label>
                <input
                  id="entry-title"
                  type="text"
                  required
                  placeholder="e.g. Export issues to GitHub and Jira"
                  value={editingEntry.title || ""}
                  onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="entry-body" className="mb-1 block text-xs font-semibold text-muted">
                  Body (Markdown)
                </label>
                <textarea
                  id="entry-body"
                  required
                  rows={6}
                  placeholder="Summarize the improvement, problem solved, or instructions on how to use it..."
                  value={editingEntry.bodyMd || ""}
                  onChange={(e) => setEditingEntry({ ...editingEntry, bodyMd: e.target.value })}
                  className={`${input} font-mono text-xs`}
                />
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-3.5">
                <label className="flex items-center gap-2.5 text-sm font-medium text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEntry.showInApp ?? false}
                    onChange={(e) => setEditingEntry({ ...editingEntry, showInApp: e.target.checked })}
                    className="size-4 rounded text-primary focus:ring-primary"
                  />
                  <span>Show &quot;What&apos;s new&quot; dot in app</span>
                </label>
                <p className="text-xs text-muted pl-6.5 m-0">
                  Displays an unobtrusive notification badge for logged-in users during the 14 days following release.
                </p>

                <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">Publish status</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingEntry({ ...editingEntry, status: "draft" })}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        editingEntry.status === "draft"
                          ? "bg-primary text-on-primary"
                          : "bg-surface border border-line text-muted"
                      }`}
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntry({ ...editingEntry, status: "published" })}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        editingEntry.status === "published"
                          ? "bg-ok text-on-primary"
                          : "bg-surface border border-line text-muted"
                      }`}
                    >
                      Publish now
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setEditingEntry(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={btn.primary}
                  disabled={saving}
                >
                  {saving ? "Saving…" : isNew ? "Create entry" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
