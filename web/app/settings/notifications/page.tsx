"use client";

import React, { useState } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";

export default function NotificationsSettingsPage() {
  const { showToast } = useToast();
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [regressionAlerts, setRegressionAlerts] = useState(true);
  const [scanFailures, setScanFailures] = useState(true);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("Notification preferences updated.");
  };

  return (
    <SettingsLayout
      title="Notification Preferences"
      description="Control email alerts, weekly summaries, and scan status notifications."
    >
      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <h2 className="text-base font-semibold m-0 text-ink">Email Alerts</h2>

          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Weekly portfolio digest (E-08)</span>
              <span className="text-xs text-muted">Sent every Monday morning summarizing all score changes across your sites.</span>
            </div>
            <input
              type="checkbox"
              checked={weeklyDigest}
              onChange={(e) => setWeeklyDigest(e.target.checked)}
              className="mt-1 size-4 rounded border-line text-primary focus:ring-primary"
            />
          </label>

          <div className="h-px bg-line" />

          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Regression alerts</span>
              <span className="text-xs text-muted">Instant notification when a previously fixed issue reappears.</span>
            </div>
            <input
              type="checkbox"
              checked={regressionAlerts}
              onChange={(e) => setRegressionAlerts(e.target.checked)}
              className="mt-1 size-4 rounded border-line text-primary focus:ring-primary"
            />
          </label>

          <div className="h-px bg-line" />

          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Scan failure warnings</span>
              <span className="text-xs text-muted">Notify when a scan cannot run due to HTTP 429/503 rate limiting or DNS errors.</span>
            </div>
            <input
              type="checkbox"
              checked={scanFailures}
              onChange={(e) => setScanFailures(e.target.checked)}
              className="mt-1 size-4 rounded border-line text-primary focus:ring-primary"
            />
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="ease-ui rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Save preferences
            </button>
          </div>
        </div>
      </form>
    </SettingsLayout>
  );
}
