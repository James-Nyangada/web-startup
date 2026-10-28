"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useActiveOrg } from "@/lib/use-active-org";
import { useToast } from "@/components/shell/toast-context";
import {
  appApi,
  type ApiWebhook,
  type ApiWebhookDelivery,
  type ApiSite,
} from "@/lib/app-api";
import { apiClient } from "@/lib/api";

const AVAILABLE_EVENTS = [
  {
    id: "scan.completed",
    label: "Scan completed",
    desc: "Dispatched whenever a site scan finishes processing.",
  },
  {
    id: "issue.regressed",
    label: "Issue regressed",
    desc: "Dispatched when previously resolved issues reappear in a scan.",
  },
  {
    id: "issues.new_critical",
    label: "Critical issue spike",
    desc: "Dispatched when 10 or more new critical or serious issues are detected.",
  },
  {
    id: "site.verification_failed",
    label: "Site verification failed",
    desc: "Dispatched when domain ownership reverification fails.",
  },
];

export default function IntegrationsSettingsPage() {
  const { showToast } = useToast();
  const { slug, loading: orgLoading } = useActiveOrg();
  const orgSlug = slug ?? "";
  const [orgPlan, setOrgPlan] = useState<string>("trial");
  const [loading, setLoading] = useState(true);
  const [webhooks, setWebhooks] = useState<ApiWebhook[]>([]);
  const [sites, setSites] = useState<ApiSite[]>([]);

  // Add webhook modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formKind, setFormKind] = useState<"slack" | "generic">("slack");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([
    "scan.completed",
    "issue.regressed",
  ]);
  const [formSiteIds, setFormSiteIds] = useState<string[]>([]);
  const [formSecret, setFormSecret] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Signing secret returned once on create; never retrievable afterwards
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Deliveries log drawer
  const [selectedWebhook, setSelectedWebhook] = useState<ApiWebhook | null>(null);
  const [deliveries, setDeliveries] = useState<ApiWebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // Testing webhook state
  const [testingId, setTestingId] = useState<string | null>(null);

  const canUseWebhooks =
    orgPlan === "growth" || orgPlan === "agency" || orgPlan === "agency_pro";

  const loadData = useCallback(async (slug: string) => {
    try {
      setLoading(true);
      const [billingRes, webhooksRes, sitesRes] = await Promise.allSettled([
        appApi.getBilling(slug),
        appApi.listWebhooks(slug),
        appApi.listSites(slug),
      ]);

      if (billingRes.status === "fulfilled" && billingRes.value) {
        setOrgPlan(billingRes.value.plan || "trial");
      }
      if (webhooksRes.status === "fulfilled") {
        setWebhooks(webhooksRes.value);
      }
      if (sitesRes.status === "fulfilled") {
        setSites(sitesRes.value);
      }
    } catch {
      // Ignored for graceful degradation
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orgLoading) return;
    if (slug) loadData(slug);
    else setLoading(false);
  }, [slug, orgLoading, loadData]);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formUrl.trim()) {
      setFormError("Endpoint URL is required.");
      return;
    }

    if (formEvents.length === 0) {
      setFormError("Select at least one event subscription.");
      return;
    }

    try {
      setFormSubmitting(true);
      const created = await appApi.createWebhook(orgSlug, {
        kind: formKind,
        url: formUrl.trim(),
        events: formEvents,
        siteIds: formSiteIds.length > 0 ? formSiteIds : undefined,
        secret: formKind === "generic" && formSecret.trim() ? formSecret.trim() : undefined,
      });

      setWebhooks((prev) => [created, ...prev]);
      if (created.secret) setRevealedSecret(created.secret);
      setShowAddModal(false);
      setFormUrl("");
      setFormEvents(["scan.completed", "issue.regressed"]);
      setFormSiteIds([]);
      setFormSecret("");
      showToast("Webhook endpoint registered successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create webhook.";
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleTestWebhook = async (webhook: ApiWebhook) => {
    try {
      setTestingId(webhook.id);
      const res = await appApi.testWebhook(orgSlug, webhook.id);
      if (res.ok) {
        showToast(
          `Test succeeded: HTTP ${res.status ?? 200} (${res.durationMs}ms)`,
        );
      } else {
        showToast(
          `Test failed: ${res.error || `HTTP ${res.status}`} (${res.durationMs}ms)`,
          { type: "error" },
        );
      }
      // Refresh list to update status
      const updated = await appApi.listWebhooks(orgSlug);
      setWebhooks(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Test request failed.";
      showToast(msg, { type: "error" });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (webhook: ApiWebhook) => {
    try {
      const updated = await appApi.updateWebhook(orgSlug, webhook.id, {
        active: !webhook.active,
      });
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? updated : w)));
      showToast(
        updated.active ? "Webhook activated." : "Webhook paused.",
      );
    } catch {
      showToast("Could not update webhook status.", { type: "error" });
    }
  };

  const handleDeleteWebhook = async (webhook: ApiWebhook) => {
    if (!window.confirm("Are you sure you want to delete this webhook integration?")) {
      return;
    }
    try {
      await appApi.deleteWebhook(orgSlug, webhook.id);
      setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
      showToast("Webhook integration deleted.");
    } catch {
      showToast("Could not delete webhook.", { type: "error" });
    }
  };

  const handleOpenDeliveries = async (webhook: ApiWebhook) => {
    setSelectedWebhook(webhook);
    try {
      setLoadingDeliveries(true);
      const logs = await appApi.listWebhookDeliveries(orgSlug, webhook.id);
      setDeliveries(logs);
    } catch {
      showToast("Failed to load delivery logs.", { type: "error" });
    } finally {
      setLoadingDeliveries(false);
    }
  };

  return (
    <SettingsLayout
      title="Integrations & Webhooks"
      description="Connect Slack and custom webhook endpoints to receive instant alerts when scans complete or issues regress."
    >
      <div className="flex flex-col gap-6 max-w-4xl">
        {revealedSecret && (
          <div
            role="status"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col gap-3"
          >
            <span className="font-semibold text-ink text-base">Copy your signing secret now</span>
            <p className="text-xs text-muted m-0 leading-5">
              Use it to check the <code>X-Signature</code> header (HMAC-SHA256 of the request
              body). For security it won&apos;t be shown again.
            </p>
            <code className="block break-all rounded-xl bg-subtle px-3 py-2 text-sm text-ink">
              {revealedSecret}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(revealedSecret);
                  showToast("Signing secret copied.");
                }}
                className="ease-ui rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover"
              >
                Copy secret
              </button>
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
              >
                I&apos;ve saved it
              </button>
            </div>
          </div>
        )}

        {/* Plan Upgrade Banner if not allowed */}
        {!loading && !canUseWebhooks && (
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-ink text-base">
                Webhooks require a Growth or Agency plan
              </span>
              <p className="text-xs text-muted m-0 leading-5">
                Automated webhook delivery and Slack alerts are available on Growth, Agency, and Agency Pro plans.
              </p>
            </div>
            <Link
              href="/settings/billing"
              className="ease-ui rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover no-underline text-center whitespace-nowrap"
            >
              Upgrade plan
            </Link>
          </div>
        )}

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink m-0">Configured Webhooks</h2>
            <p className="text-xs text-muted m-0 mt-0.5">
              Payloads are delivered with a 10s timeout and automatic retry backoff.
            </p>
          </div>
          {canUseWebhooks && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setShowAddModal(true);
              }}
              className="ease-ui rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover shadow-xs flex items-center gap-1.5"
            >
              <span>+ Add webhook</span>
            </button>
          )}
        </div>

        {/* Webhooks list */}
        {loading ? (
          <div className="p-12 text-center text-sm text-muted rounded-2xl border border-line bg-surface">
            Loading integrations...
          </div>
        ) : webhooks.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card flex flex-col items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-subtle text-muted">
              <Icon d={I.link} size={20} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-ink text-sm">No webhooks configured yet</span>
              <p className="text-xs text-muted max-w-sm m-0">
                Add an incoming Slack webhook or a generic HTTP endpoint to stream scan results and regressions to your team.
              </p>
            </div>
            {canUseWebhooks && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="ease-ui mt-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
              >
                Create your first webhook
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col gap-3 hover:border-line-hover transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        wh.kind === "slack"
                          ? "bg-[#4A154B]/10 text-[#4A154B]"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {wh.kind === "slack" ? "Slack" : "Generic Webhook"}
                    </span>
                    <span className="font-mono text-xs text-ink font-medium">
                      {wh.urlMasked}
                    </span>
                    {wh.active ? (
                      <span className="rounded-full bg-emerald-500/10 text-emerald-700 text-[11px] font-semibold px-2 py-0.5">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 text-amber-700 text-[11px] font-semibold px-2 py-0.5">
                        {wh.failureCount >= 10 ? "Auto-disabled (10 failures)" : "Paused"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={testingId === wh.id}
                      onClick={() => handleTestWebhook(wh)}
                      className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle disabled:opacity-50"
                    >
                      {testingId === wh.id ? "Testing..." : "Test"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDeliveries(wh)}
                      className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
                    >
                      Deliveries
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(wh)}
                      className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
                    >
                      {wh.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWebhook(wh)}
                      className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Event tags & site filter */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted text-[11px]">Events:</span>
                  {wh.events.map((ev) => (
                    <span
                      key={ev}
                      className="rounded bg-subtle px-2 py-0.5 text-[11px] text-ink font-mono"
                    >
                      {ev}
                    </span>
                  ))}
                  <span className="text-muted text-[11px] ml-2">Sites:</span>
                  <span className="rounded bg-subtle px-2 py-0.5 text-[11px] text-muted">
                    {wh.siteIds && wh.siteIds.length > 0
                      ? `${wh.siteIds.length} site${wh.siteIds.length === 1 ? "" : "s"}`
                      : "All sites"}
                  </span>
                  {wh.lastStatus && (
                    <span
                      className={`ml-auto text-[11px] font-mono ${
                        wh.lastStatus >= 200 && wh.lastStatus < 300
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      Last status: {wh.lastStatus}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Webhook Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-modal flex flex-col gap-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 id="modal-title" className="text-base font-semibold text-ink m-0">
                Add webhook integration
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="grid size-7 place-items-center rounded-full hover:bg-subtle text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="flex flex-col gap-4">
              {formError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-700">
                  {formError}
                </div>
              )}

              {/* Kind Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormKind("slack")}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      formKind === "slack"
                        ? "border-primary bg-primary/5 font-semibold text-ink"
                        : "border-line bg-surface text-muted hover:bg-subtle"
                    }`}
                  >
                    <div className="text-xs font-semibold text-ink">Slack Incoming Webhook</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      Sends formatted cards directly to a Slack channel.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormKind("generic")}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      formKind === "generic"
                        ? "border-primary bg-primary/5 font-semibold text-ink"
                        : "border-line bg-surface text-muted hover:bg-subtle"
                    }`}
                  >
                    <div className="text-xs font-semibold text-ink">Generic Webhook</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      Sends raw JSON payloads signed with HMAC-SHA256.
                    </div>
                  </button>
                </div>
              </div>

              {/* Endpoint URL */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="webhook-url" className="text-xs font-medium text-ink">
                  Endpoint URL <span className="text-red-500">*</span>
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  required
                  placeholder={
                    formKind === "slack"
                      ? "https://hooks.slack.com/services/..."
                      : "https://api.yourdomain.com/webhooks/accessibility"
                  }
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                />
                <span className="text-[11px] text-muted">
                  Must be a publicly accessible HTTP/HTTPS URL (SSRF guard blocks private and loopback addresses).
                </span>
              </div>

              {/* Events checkboxes */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-ink">
                  Trigger Events <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col gap-2 border border-line rounded-xl p-3 bg-subtle/30">
                  {AVAILABLE_EVENTS.map((ev) => {
                    const checked = formEvents.includes(ev.id);
                    return (
                      <label key={ev.id} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormEvents((prev) => [...prev, ev.id]);
                            } else {
                              setFormEvents((prev) => prev.filter((x) => x !== ev.id));
                            }
                          }}
                          className="mt-0.5 rounded border-line text-primary focus:ring-primary"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-ink">{ev.label}</span>
                          <span className="text-[11px] text-muted">{ev.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Sites scope */}
              {sites.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-ink">Filter by site (optional)</label>
                  <select
                    multiple
                    value={formSiteIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                      setFormSiteIds(selected);
                    }}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none min-h-[70px]"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.rootUrl})
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-muted">
                    Hold Ctrl/Cmd to select specific sites. Leave empty to trigger for all sites in this organisation.
                  </span>
                </div>
              )}

              {/* Optional secret for generic webhooks */}
              {formKind === "generic" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-secret" className="text-xs font-medium text-ink">
                    HMAC Secret (optional)
                  </label>
                  <input
                    id="webhook-secret"
                    type="text"
                    placeholder="Auto-generated if left blank"
                    value={formSecret}
                    onChange={(e) => setFormSecret(e.target.value)}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink font-mono focus:border-primary focus:outline-none"
                  />
                  <span className="text-[11px] text-muted">
                    Used to sign requests via the <code>X-Signature</code> header.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="ease-ui rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover shadow-xs disabled:opacity-50"
                >
                  {formSubmitting ? "Registering..." : "Save webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deliveries Log Drawer */}
      {selectedWebhook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deliveries-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-modal flex flex-col gap-4 max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 id="deliveries-title" className="text-base font-semibold text-ink m-0">
                  Recent Deliveries
                </h3>
                <p className="text-xs text-muted m-0 mt-0.5 font-mono">
                  {selectedWebhook.urlMasked}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWebhook(null)}
                className="grid size-7 place-items-center rounded-full hover:bg-subtle text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 flex flex-col gap-2 pr-1">
              {loadingDeliveries ? (
                <div className="p-8 text-center text-xs text-muted">Loading delivery logs...</div>
              ) : deliveries.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  No deliveries recorded yet. Use the "Test" button to verify delivery.
                </div>
              ) : (
                <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                  {deliveries.map((d) => (
                    <div
                      key={d.id}
                      className="p-3.5 bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-subtle/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-mono font-semibold ${
                            d.status && d.status >= 200 && d.status < 300
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-red-500/10 text-red-700"
                          }`}
                        >
                          {d.status ? `HTTP ${d.status}` : "FAILED"}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-ink">{d.event}</span>
                          <span className="text-[11px] text-muted">
                            {new Date(d.createdAt).toLocaleString()} · {d.durationMs}ms
                          </span>
                        </div>
                      </div>

                      {d.error && (
                        <span className="text-[11px] text-red-600 font-mono truncate max-w-xs">
                          {d.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setSelectedWebhook(null)}
                className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
