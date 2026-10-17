"use client";

import React, { useState } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";

export default function GeneralSettingsPage() {
  const { showToast } = useToast();
  const [orgName, setOrgName] = useState("Brightline Studio");
  const [slug, setSlug] = useState("brightline");
  const [timeZone, setTimeZone] = useState("Africa/Nairobi");
  const [orgType, setOrgType] = useState<"agency" | "store">("agency");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("Organisation settings saved successfully.");
  };

  return (
    <SettingsLayout
      title="General Settings"
      description="Manage your organisation details, slug, and timezone."
    >
      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <h2 className="text-base font-semibold m-0 text-ink">Organisation Profile</h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="orgName" className="text-sm font-medium text-ink">
              Organisation Name
            </label>
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="slug" className="text-sm font-medium text-ink">
              URL Slug
            </label>
            <div className="flex items-center rounded-xl border border-line bg-surface px-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
              <span className="text-sm text-muted">plainsight.app/</span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="h-10 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
              />
            </div>
            <p className="text-xs text-muted m-0">Used in client portal URLs and API scopes.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="timeZone" className="text-sm font-medium text-ink">
              Time Zone
            </label>
            <select
              id="timeZone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="Africa/Nairobi">Africa/Nairobi (UTC+3)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Organisation Type</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                  orgType === "agency"
                    ? "border-primary bg-primary-soft text-ptext"
                    : "border-line bg-surface text-ink hover:bg-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="orgType"
                  value="agency"
                  checked={orgType === "agency"}
                  onChange={() => setOrgType("agency")}
                  className="mt-1"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Digital Agency</span>
                  <span className="text-xs text-muted">Monitors multiple client stores, client portal enabled.</span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                  orgType === "store"
                    ? "border-primary bg-primary-soft text-ptext"
                    : "border-line bg-surface text-ink hover:bg-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="orgType"
                  value="store"
                  checked={orgType === "store"}
                  onChange={() => setOrgType("store")}
                  className="mt-1"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Single Store Owner</span>
                  <span className="text-xs text-muted">Monitors your own e-commerce brand.</span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="ease-ui rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Save changes
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-2xl border border-red-500/20 bg-surface p-6 shadow-card flex flex-col gap-4">
          <h2 className="text-base font-semibold m-0 text-crit">Danger Zone</h2>
          <p className="text-xs text-muted m-0 leading-5">
            Deleting this organisation will delete all scan histories and revoke member access.
            This action cannot be undone after the 30-day grace period.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              <span className="text-sm font-medium text-ink block">Delete Organisation</span>
              <span className="text-xs text-muted">Permanently remove Brightline Studio</span>
            </div>
            <button
              type="button"
              onClick={() => showToast("Delete organisation dialog (requires typed confirmation)", { type: "warning" })}
              className="ease-ui rounded-full border border-red-500/30 px-4 py-2 text-xs font-semibold text-crit hover:bg-red-500/10"
            >
              Delete this organisation
            </button>
          </div>
        </div>
      </form>
    </SettingsLayout>
  );
}
