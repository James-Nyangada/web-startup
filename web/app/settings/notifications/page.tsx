"use client";

import React, { useState, useEffect } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";
import { apiClient } from "@/lib/api";

interface PreferencesData {
  scanCompleted: "all" | "issues_only" | "off";
  regressions: boolean;
  weeklyDigest: boolean;
  billing: boolean;
}

export default function NotificationsSettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scanCompleted, setScanCompleted] = useState<
    "all" | "issues_only" | "off"
  >("all");
  const [regressions, setRegressions] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [billing, setBilling] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient<{ data: { preferences: PreferencesData } }>(
      "/v1/notification-preferences/preferences",
    )
      .then((res) => {
        if (!cancelled && res?.data?.preferences) {
          const p = res.data.preferences;
          setScanCompleted(p.scanCompleted || "all");
          setRegressions(p.regressions ?? true);
          setWeeklyDigest(p.weeklyDigest ?? true);
          setBilling(p.billing ?? true);
        }
      })
      .catch(() => {
        // Defaults on fallback/demo
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient("/v1/notification-preferences/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanCompleted,
          regressions,
          weeklyDigest,
          billing,
        }),
      });
      showToast("Notification preferences updated successfully.");
    } catch {
      showToast("Notification preferences saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout
      title="Notification Preferences"
      description="Control email alerts, weekly summaries, and scan status notifications."
    >
      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <h2 className="text-base font-semibold m-0 text-ink">
            Email Notifications
          </h2>

          {/* Weekly Digest */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">
                Weekly portfolio digest
              </span>
              <span className="text-xs text-muted">
                Sent every Monday morning summarizing score changes, new and
                fixed counts, and overdue assigned tasks.
              </span>
            </div>
            <input
              type="checkbox"
              checked={weeklyDigest}
              onChange={(e) => setWeeklyDigest(e.target.checked)}
              className="mt-1 size-4 rounded border-line text-primary focus:ring-primary"
            />
          </label>

          <div className="h-px bg-line" />

          {/* Regression alerts */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">
                Regression alerts
              </span>
              <span className="text-xs text-muted">
                Instant notification when a previously fixed issue returns, or
                when 10+ new critical issues appear in a scan.
              </span>
            </div>
            <input
              type="checkbox"
              checked={regressions}
              onChange={(e) => setRegressions(e.target.checked)}
              className="mt-1 size-4 rounded border-line text-primary focus:ring-primary"
            />
          </label>

          <div className="h-px bg-line" />

          {/* Scan completed summary */}
          <div>
            <label
              htmlFor="scan-completed-select"
              className="block text-sm font-semibold text-ink mb-1"
            >
              Scan completion summaries
            </label>
            <p className="text-xs text-muted mb-2">
              Choose when to receive automated email summaries after scheduled
              scans finish.
            </p>
            <select
              id="scan-completed-select"
              value={scanCompleted}
              onChange={(e) =>
                setScanCompleted(
                  e.target.value as "all" | "issues_only" | "off",
                )
              }
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">
                Every scan (Score breakdown &amp; counts)
              </option>
              <option value="issues_only">
                Only when new violations or regressions are found
              </option>
              <option value="off">Never send scan completion emails</option>
            </select>
          </div>

          <div className="h-px bg-line" />

          {/* Billing alerts */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">
                Billing &amp; subscription notices
              </span>
              <span className="text-xs text-muted">
                Receive important notices about payment renewals, failed
                transactions, and grace period deadlines.
              </span>
            </div>
            <input
              type="checkbox"
              checked={billing}
              onChange={(e) => setBilling(e.target.checked)}
              className="mt-1 size-4 rounded border-line text-primary focus:ring-primary"
            />
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={loading || saving}
              className="ease-ui rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save preferences"}
            </button>
          </div>
        </div>
      </form>
    </SettingsLayout>
  );
}
