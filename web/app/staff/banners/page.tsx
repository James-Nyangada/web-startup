"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { staffApi, type Banner } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

const STYLE_BADGES: Record<string, string> = {
  info: "bg-primary-soft text-ptext border-primary/20",
  success: "bg-ok-soft text-ok border-ok/20",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export default function StaffBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [surfaceFilter, setSurfaceFilter] = useState<string>("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editingBanner, setEditingBanner] = useState<Partial<Banner> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audienceType, setAudienceType] = useState<string>("everyone");
  const [audiencePlans, setAudiencePlans] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await staffApi.listBanners(surfaceFilter || undefined);
      setBanners(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [surfaceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenNew = () => {
    setIsNew(true);
    setAudienceType("everyone");
    setEditingBanner({
      surface: "both",
      message: "",
      linkUrl: "",
      style: "info",
      audience: { type: "everyone" },
      startsAt: null,
      endsAt: null,
      dismissible: true,
      active: true,
    });
    setErrorMsg(null);
  };

  const handleOpenEdit = (b: Banner) => {
    setIsNew(false);
    setAudienceType(b.audience?.type || "everyone");
    setAudiencePlans(Array.isArray(b.audience?.plans) ? b.audience.plans : []);
    setEditingBanner({
      ...b,
      startsAt: b.startsAt ? new Date(b.startsAt).toISOString().slice(0, 16) : null,
      endsAt: b.endsAt ? new Date(b.endsAt).toISOString().slice(0, 16) : null,
    });
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBanner) return;
    if (!editingBanner.message?.trim()) {
      setErrorMsg("Message is required.");
      return;
    }
    if (editingBanner.message.length > 140) {
      setErrorMsg("Message must be 140 characters or fewer.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: Partial<Banner> = {
        ...editingBanner,
        message: editingBanner.message.trim(),
        linkUrl: editingBanner.linkUrl?.trim() || null,
        audience: audienceType === "specific_plans" && audiencePlans.length ? { type: audienceType, plans: audiencePlans } : { type: audienceType },
        startsAt: editingBanner.startsAt ? new Date(editingBanner.startsAt).toISOString() : null,
        endsAt: editingBanner.endsAt ? new Date(editingBanner.endsAt).toISOString() : null,
      };

      if (isNew) {
        await staffApi.createBanner(payload);
      } else if (editingBanner.id) {
        await staffApi.updateBanner(editingBanner.id, payload);
      }

      setEditingBanner(null);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save banner.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      await staffApi.updateBanner(banner.id, { active: !banner.active });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle active status.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement banner?")) return;
    try {
      await staffApi.deleteBanner(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete banner.");
    }
  };

  return (
    <StaffShell
      title="Announcement Banners"
      actions={
        <button type="button" className={btn.primary} onClick={handleOpenNew}>
          <Icon d={I.plus} size={16} />
          New banner
        </button>
      }
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-sm text-muted">
          Announcement banners displayed at the top of the marketing site, inside the customer dashboard, or both.
          Rendered using the accessible S-82 banner region with correct ARIA live priority.
        </p>
      </div>

      <div className={`${card} mb-6 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <label htmlFor="surface-filter" className="text-xs font-semibold text-muted">Surface</label>
          <select
            id="surface-filter"
            value={surfaceFilter}
            onChange={(e) => setSurfaceFilter(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">All surfaces</option>
            <option value="both">Both site &amp; app</option>
            <option value="site">Marketing site only</option>
            <option value="app">Customer app only</option>
          </select>
        </div>
      </div>

      {/* Banners List */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full border-collapse">
          <caption className="sr-only">Announcement banners</caption>
          <thead className="border-b border-line bg-subtle">
            <tr>
              <th scope="col" className={th}>Surface</th>
              <th scope="col" className={th}>Message &amp; Link</th>
              <th scope="col" className={th}>Style</th>
              <th scope="col" className={th}>Audience</th>
              <th scope="col" className={th}>Schedule</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {banners.map((b) => (
              <tr key={b.id} className="hover:bg-subtle/50">
                <td className={`${td} capitalize whitespace-nowrap text-xs font-semibold text-muted`}>
                  {b.surface}
                </td>
                <td className={td}>
                  <div className="font-semibold text-ink text-sm">{b.message}</div>
                  {b.linkUrl && (
                    <a
                      href={b.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <span>{b.linkUrl}</span>
                      <Icon d={I.arrowRight} size={11} />
                    </a>
                  )}
                  {b.dismissible && (
                    <span className="text-[11px] text-muted block mt-0.5">Dismissible by user</span>
                  )}
                </td>
                <td className={td}>
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      STYLE_BADGES[b.style] || "bg-subtle text-muted"
                    }`}
                  >
                    {b.style}
                  </span>
                </td>
                <td className={`${td} text-xs text-muted capitalize`}>
                  {b.audience?.type?.replace("_", " ") || "Everyone"}
                </td>
                <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                  {b.startsAt || b.endsAt ? (
                    <div>
                      {b.startsAt && <div>From {formatDate(b.startsAt, true)}</div>}
                      {b.endsAt && <div>Until {formatDate(b.endsAt, true)}</div>}
                    </div>
                  ) : (
                    "Always active"
                  )}
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(b)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      b.active
                        ? "bg-ok-soft text-ok hover:bg-ok/20"
                        : "bg-subtle text-muted hover:bg-subtle/80"
                    }`}
                    title="Click to toggle active status"
                  >
                    {b.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:text-ink hover:bg-subtle"
                      onClick={() => handleOpenEdit(b)}
                      title="Edit banner"
                    >
                      <Icon d={I.pencil} size={15} />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-crit/70 hover:text-crit hover:bg-crit-soft"
                      onClick={() => void handleDelete(b.id)}
                      title="Delete banner"
                    >
                      <Icon d={I.trash} size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {state === "ready" && banners.length === 0 && (
          <p className="m-0 p-8 text-center text-sm text-muted">
            No announcement banners configured. Create one above to display notices to visitors or users.
          </p>
        )}
      </div>

      {/* Banner Create / Edit Modal */}
      {editingBanner && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="banner-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h2 id="banner-dialog-title" className="m-0 text-lg font-bold text-ink">
                {isNew ? "Create announcement banner" : "Edit announcement banner"}
              </h2>
              <button
                type="button"
                onClick={() => setEditingBanner(null)}
                className="rounded p-1 text-muted hover:text-ink"
                aria-label="Close"
              >
                <Icon d={I.x} size={18} />
              </button>
            </div>

            {errorMsg && (
              <div role="alert" className="mb-4 rounded-xl border border-crit/30 bg-crit-soft p-3 text-xs text-crit">
                {errorMsg}
              </div>
            )}

            {/* Live Preview Bar */}
            <div className="mb-5">
              <span className="mb-1 block text-xs font-semibold text-muted">Live Preview (Accessible Banner)</span>
              <div
                role="region"
                aria-label="Announcement Preview"
                className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-xs font-medium transition ${
                  editingBanner.style === "success"
                    ? "bg-ok text-on-primary"
                    : editingBanner.style === "warning"
                    ? "bg-amber-500 text-ink"
                    : "bg-primary text-on-primary"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Icon d={I.info} size={14} />
                  <span className="truncate">{editingBanner.message || "Your announcement message will render here..."}</span>
                  {editingBanner.linkUrl && (
                    <span className="underline underline-offset-2 ml-1 cursor-pointer font-bold">Learn more</span>
                  )}
                </div>
                {editingBanner.dismissible && (
                  <span className="opacity-80 hover:opacity-100">
                    <Icon d={I.x} size={14} />
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="banner-message" className="text-xs font-semibold text-muted">
                    Message (≤ 140 chars)
                  </label>
                  <span className={`text-xs ${((editingBanner.message?.length || 0) > 140) ? "text-crit font-bold" : "text-muted"}`}>
                    {editingBanner.message?.length || 0} / 140
                  </span>
                </div>
                <input
                  id="banner-message"
                  type="text"
                  required
                  maxLength={140}
                  placeholder="e.g. Scheduled maintenance on Sunday 02:00 UTC."
                  value={editingBanner.message || ""}
                  onChange={(e) => setEditingBanner({ ...editingBanner, message: e.target.value })}
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="banner-url" className="mb-1 block text-xs font-semibold text-muted">
                  Link URL (Optional)
                </label>
                <input
                  id="banner-url"
                  type="url"
                  placeholder="https://status.everyvisitor.com/..."
                  value={editingBanner.linkUrl || ""}
                  onChange={(e) => setEditingBanner({ ...editingBanner, linkUrl: e.target.value })}
                  className={input}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="banner-surface" className="mb-1 block text-xs font-semibold text-muted">
                    Target surface
                  </label>
                  <select
                    id="banner-surface"
                    value={editingBanner.surface || "both"}
                    onChange={(e) => setEditingBanner({ ...editingBanner, surface: e.target.value as any })}
                    className={input}
                  >
                    <option value="both">Both marketing site &amp; app</option>
                    <option value="site">Marketing site only</option>
                    <option value="app">Customer app only</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="banner-style" className="mb-1 block text-xs font-semibold text-muted">
                    Visual style
                  </label>
                  <select
                    id="banner-style"
                    value={editingBanner.style || "info"}
                    onChange={(e) => setEditingBanner({ ...editingBanner, style: e.target.value as any })}
                    className={input}
                  >
                    <option value="info">Info (Blue brand tone)</option>
                    <option value="success">Success (Green celebrate)</option>
                    <option value="warning">Warning (Amber alert)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="banner-audience" className="mb-1 block text-xs font-semibold text-muted">
                  Audience targeting
                </label>
                <select
                  id="banner-audience"
                  value={audienceType}
                  onChange={(e) => setAudienceType(e.target.value)}
                  className={input}
                >
                  <option value="everyone">Everyone (All visitors)</option>
                  <option value="logged_in">Logged in users only</option>
                  <option value="trial">Active trial organisations only</option>
                  <option value="specific_plans">Paying customers (optionally specific plans)</option>
                </select>
                {audienceType === "specific_plans" && (
                  <fieldset className="mt-2 flex flex-wrap gap-4 border-0 p-0 text-sm">
                    <legend className="mb-1 text-xs text-muted">Only these plans (none ticked = all paying customers)</legend>
                    {["store", "growth", "agency", "agency_pro"].map((plan) => (
                      <label key={plan} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={audiencePlans.includes(plan)}
                          onChange={(e) =>
                            setAudiencePlans((cur) => (e.target.checked ? [...cur, plan] : cur.filter((p) => p !== plan)))
                          }
                        />
                        {plan.replace("_", " ")}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="banner-start" className="mb-1 block text-xs font-semibold text-muted">
                    Start time (Optional)
                  </label>
                  <input
                    id="banner-start"
                    type="datetime-local"
                    value={editingBanner.startsAt || ""}
                    onChange={(e) => setEditingBanner({ ...editingBanner, startsAt: e.target.value || null })}
                    className={input}
                  />
                </div>
                <div>
                  <label htmlFor="banner-end" className="mb-1 block text-xs font-semibold text-muted">
                    End time (Optional)
                  </label>
                  <input
                    id="banner-end"
                    type="datetime-local"
                    value={editingBanner.endsAt || ""}
                    onChange={(e) => setEditingBanner({ ...editingBanner, endsAt: e.target.value || null })}
                    className={input}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingBanner.dismissible ?? true}
                    onChange={(e) => setEditingBanner({ ...editingBanner, dismissible: e.target.checked })}
                    className="size-4 rounded text-primary focus:ring-primary"
                  />
                  <span>Dismissible (Visitor can close the banner)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingBanner.active ?? true}
                    onChange={(e) => setEditingBanner({ ...editingBanner, active: e.target.checked })}
                    className="size-4 rounded text-primary focus:ring-primary"
                  />
                  <span>Active (Immediately visible if within schedule)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setEditingBanner(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className={btn.primary} disabled={saving}>
                  {saving ? "Saving…" : isNew ? "Create banner" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
