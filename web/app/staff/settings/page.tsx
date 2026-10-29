"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { staffApi, type SiteSettings, type SiteDeploy } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

const STATUS_PILLS: Record<string, string> = {
  live: "bg-ok-soft text-ok border-ok/20",
  building: "bg-primary-soft text-ptext border-primary/20 animate-pulse",
  queued: "bg-ser-soft text-ser border-ser/20",
  failed: "bg-crit-soft text-crit border-crit/20",
};

export default function StaffSiteSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [deploys, setDeploys] = useState<SiteDeploy[]>([]);
  const [supportEmail, setSupportEmail] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [wordInput, setWordInput] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [savingSettings, setSavingSettings] = useState(false);
  const [triggeringDeploy, setTriggeringDeploy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [s, d] = await Promise.all([staffApi.getSettings(), staffApi.listDeploys(20)]);
      setSettings(s);
      setSupportEmail(s.supportEmail || "support@everyvisitor.com");
      setMaintenanceMode(s.maintenanceMode || false);
      setBannedWords(s.bannedWords || []);
      setDeploys(d);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setNotice(null);
    try {
      const updated = await staffApi.updateSettings({
        supportEmail: supportEmail.trim(),
        maintenanceMode,
        bannedWords,
      });
      setSettings(updated);
      setNotice({ type: "success", text: "Site settings updated successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddWord = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ("key" in e && e.key !== "Enter") return;
    e.preventDefault();
    const word = wordInput.trim().toLowerCase();
    if (word && !bannedWords.includes(word)) {
      setBannedWords([...bannedWords, word]);
      setWordInput("");
    }
  };

  const handleRemoveWord = (word: string) => {
    setBannedWords(bannedWords.filter((w) => w !== word));
  };

  const handleTriggerRebuild = async () => {
    if (!confirm("Trigger a manual Cloudflare Pages site rebuild? This will generate static pages and fetch published CMS content.")) {
      return;
    }
    setTriggeringDeploy(true);
    try {
      await staffApi.triggerDeploy();
      setNotice({ type: "success", text: "Site rebuild queued." });
      await load();
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Failed to trigger rebuild." });
    } finally {
      setTriggeringDeploy(false);
    }
  };

  const latestDeploy = deploys[0];

  return (
    <StaffShell
      title="Site Settings &amp; Deploys"
      actions={
        <button
          type="button"
          className={btn.primary}
          onClick={handleTriggerRebuild}
          disabled={triggeringDeploy}
        >
          <Icon d={I.refresh} size={15} />
          {triggeringDeploy ? "Queueing…" : "Rebuild site"}
        </button>
      }
    >
      <div className="mb-6">
        <p className="m-0 text-sm text-muted">
          Global platform settings and Cloudflare Pages static marketing site deployment pipeline.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-6 rounded-xl border p-4 text-sm font-medium ${
            notice.type === "success" ? "border-ok/30 bg-ok-soft text-ok" : "border-crit/30 bg-crit-soft text-crit"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Deployment status card */}
      <section aria-labelledby="deploy-h" className="mb-8">
        <div className={`${card} border-line`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
            <div>
              <h2 id="deploy-h" className="m-0 text-base font-bold text-ink flex items-center gap-2">
                <Icon d={I.globe} size={18} />
                Cloudflare Pages Deployment Pipeline
              </h2>
              <p className="text-xs text-muted m-0 mt-0.5">
                Builds static marketing pages at edge. Automatic triggers on published CMS articles and guides (debounced 2m).
              </p>
            </div>
            <div className="flex items-center gap-3">
              {latestDeploy && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted font-medium">Current status:</span>
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 font-bold uppercase tracking-wider text-[11px] ${
                      STATUS_PILLS[latestDeploy.status] || "bg-subtle text-muted"
                    }`}
                  >
                    {latestDeploy.status}
                  </span>
                </div>
              )}
              <button
                type="button"
                className={btn.secondary}
                onClick={() => void load()}
                title="Refresh deployment history"
              >
                <Icon d={I.refresh} size={14} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-subtle p-3">
              <span className="text-xs font-semibold text-muted block">Deploy Webhook Hook</span>
              <span className="text-sm font-bold text-ink mt-1 flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${settings?.deployHookConfigured ? "bg-ok" : "bg-muted"}`} />
                {settings?.deployHookConfigured ? "Configured" : "Simulated (Local)"}
              </span>
            </div>
            <div className="rounded-xl border border-line bg-subtle p-3">
              <span className="text-xs font-semibold text-muted block">Last Deployed</span>
              <span className="text-sm font-bold text-ink mt-1 block">
                {latestDeploy?.finishedAt ? formatDate(latestDeploy.finishedAt, true) : latestDeploy ? formatDate(latestDeploy.startedAt, true) : "-"}
              </span>
            </div>
            <div className="rounded-xl border border-line bg-subtle p-3">
              <span className="text-xs font-semibold text-muted block">Trigger Mode</span>
              <span className="text-sm font-bold text-ink mt-1 capitalize block">
                {latestDeploy?.trigger || "None"}
              </span>
            </div>
          </div>

          {/* Deployment log history table */}
          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            <table className="w-full border-collapse">
              <caption className="sr-only">Recent deployments</caption>
              <thead className="border-b border-line bg-subtle/50">
                <tr>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Trigger</th>
                  <th scope="col" className={th}>Started</th>
                  <th scope="col" className={th}>Finished</th>
                  <th scope="col" className={th}>Error / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {deploys.map((dep) => (
                  <tr key={dep.id} className="hover:bg-subtle/40">
                    <td className={td}>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-[10px] ${
                          STATUS_PILLS[dep.status] || "bg-subtle text-muted"
                        }`}
                      >
                        {dep.status}
                      </span>
                    </td>
                    <td className={`${td} capitalize text-xs font-medium text-ink`}>
                      {dep.trigger}
                    </td>
                    <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                      {formatDate(dep.startedAt, true)}
                    </td>
                    <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                      {dep.finishedAt ? formatDate(dep.finishedAt, true) : "-"}
                    </td>
                    <td className={`${td} text-xs ${dep.error ? "text-crit font-semibold" : "text-muted"}`}>
                      {dep.error || "Completed successfully"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deploys.length === 0 && (
              <p className="m-0 p-4 text-center text-xs text-muted">No deployment history recorded yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Global settings form */}
      <section aria-labelledby="settings-h">
        <div className={`${card} border-line`}>
          <h2 id="settings-h" className="m-0 mb-4 text-base font-bold text-ink flex items-center gap-2">
            <Icon d={I.settings} size={18} />
            General Site Configuration
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div>
              <label htmlFor="support-email" className="mb-1 block text-xs font-semibold text-muted">
                Public Support Email
              </label>
              <input
                id="support-email"
                type="email"
                required
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className={input}
              />
              <p className="mt-1 text-xs text-muted">
                Displayed on marketing footer, transactional emails, and contact pages.
              </p>
            </div>

            {/* Maintenance Mode */}
            <div className="rounded-xl border border-line bg-subtle p-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm font-semibold text-ink block">Platform Maintenance Mode</span>
                  <span className="text-xs text-muted block mt-0.5">
                    When enabled, background worker crawlers pause and public pages display a polite maintenance alert.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  className="size-5 rounded text-primary focus:ring-primary"
                />
              </label>
            </div>

            {/* Banned Words */}
            <div>
              <label htmlFor="banned-words-input" className="mb-1 block text-xs font-semibold text-muted">
                Banned Words &amp; Prohibited Content Terms
              </label>
              <div className="flex gap-2">
                <input
                  id="banned-words-input"
                  type="text"
                  placeholder="Type term and press Enter to add…"
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                  onKeyDown={handleAddWord}
                  className={input}
                />
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={handleAddWord}
                >
                  Add
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">
                Used to filter free-check submissions, scanner domain inputs, and staff content previews.
              </p>

              {bannedWords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bannedWords.map((word) => (
                    <span
                      key={word}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink shadow-sm"
                    >
                      <span>{word}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveWord(word)}
                        className="rounded-full p-0.5 text-muted hover:text-crit"
                        aria-label={`Remove ${word}`}
                      >
                        <Icon d={I.x} size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className={btn.primary}
                disabled={savingSettings}
              >
                {savingSettings ? "Saving settings…" : "Save site settings"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </StaffShell>
  );
}
