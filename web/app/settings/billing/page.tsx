"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { appApi, type ApiUsage } from "@/lib/app-api";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

const DEFAULT_USAGE: ApiUsage = {
  plan: "agency",
  planName: "Agency",
  limits: {
    maxSites: 25,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 3,
    scheduledFrequency: "weekly",
    maxDailySites: 5,
    teamMembers: 10,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
    aiSuggestionsMonthly: 500,
  },
  usage: {
    sites: 18,
    dailySites: 3,
    teamMembers: 4,
    clientViewers: 2,
    aiSuggestionsThisMonth: 84,
  },
  features: {
    regressionAlerts: true,
    slackWebhook: true,
    whiteLabel: true,
    customDomain: false,
    scheduledClientReports: true,
    evidencePack: true,
    publicApi: false,
  },
};

const PLAN_PRICES: Record<string, string> = {
  trial: "$0 (14-day trial)",
  store: "$29 / month",
  growth: "$79 / month",
  agency: "$199 / month",
  agency_pro: "$399 / month",
};

export default function BillingSettingsPage() {
  const { showToast } = useToast();
  const [usageData, setUsageData] = useState<ApiUsage>(DEFAULT_USAGE);
  const [loading, setLoading] = useState(true);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const orgSlug = "brightline";

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      const res = await appApi.getUsage(orgSlug);
      if (res?.limits && res?.usage) {
        setUsageData(res);
      }
    } catch {
      // Fallback to default state
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const { plan, planName, limits, usage, features } = usageData;

  const sitesPercent = limits.maxSites
    ? Math.min(100, Math.round((usage.sites / limits.maxSites) * 100))
    : 0;

  const membersPercent = Number.isFinite(limits.teamMembers)
    ? Math.min(100, Math.round((usage.teamMembers / limits.teamMembers) * 100))
    : 10;

  const aiPercent = limits.aiSuggestionsMonthly
    ? Math.min(100, Math.round((usage.aiSuggestionsThisMonth / limits.aiSuggestionsMonthly) * 100))
    : 0;

  return (
    <SettingsLayout
      title="Billing & Plans"
      description="Manage your subscription, plan limits, usage meters, and billing portal."
    >
      <div className="flex flex-col gap-6 max-w-4xl">
        {/* Current Plan Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Current Subscription
              </span>
              <h2 className="text-2xl font-serif font-normal m-0 mt-0.5 text-ink">
                {planName} Plan
              </h2>
              <p className="text-sm text-muted m-0 mt-1">
                {PLAN_PRICES[plan] || "$199 / month"} · Next period renewal active
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(true)}
                className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle cursor-pointer"
              >
                Change plan
              </button>
              <button
                type="button"
                onClick={() => showToast("Opening customer billing portal...", { type: "info" })}
                className="ease-ui rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-card cursor-pointer"
              >
                Manage subscription
              </button>
            </div>
          </div>

          <div className="my-1 h-px bg-line" />

          {/* Real Usage Meters (P4-01 & Section 1.4) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sites Meter */}
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Monitored sites</span>
                <span className="font-semibold text-ink">
                  {usage.sites} / {limits.maxSites}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={sitesPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Monitored sites usage">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${sitesPercent >= 90 ? "bg-warn" : "bg-primary"}`}
                  style={{ width: `${sitesPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">
                {Math.max(0, limits.maxSites - usage.sites)} sites remaining on this plan
              </span>
            </div>

            {/* Team Members Meter */}
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Team seats</span>
                <span className="font-semibold text-ink">
                  {usage.teamMembers} / {Number.isFinite(limits.teamMembers) ? limits.teamMembers : "Unlimited"}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={membersPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Team seats usage">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${membersPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">
                {Number.isFinite(limits.teamMembers)
                  ? `${Math.max(0, limits.teamMembers - usage.teamMembers)} team seats remaining`
                  : "Unlimited seats included"}
              </span>
            </div>

            {/* AI Suggestions Quota */}
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">AI fix suggestions</span>
                <span className="font-semibold text-ink">
                  {usage.aiSuggestionsThisMonth} / {limits.aiSuggestionsMonthly}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={aiPercent} aria-valuemin={0} aria-valuemax={100} aria-label="AI suggestions quota">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${aiPercent >= 90 ? "bg-warn" : "bg-ok"}`}
                  style={{ width: `${aiPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">
                {Math.max(0, limits.aiSuggestionsMonthly - usage.aiSuggestionsThisMonth)} requests remaining this month
              </span>
            </div>
          </div>
        </div>

        {/* Plan Capabilities & Features Checklist */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-4">
          <h3 className="text-base font-semibold m-0 text-ink">Plan Inclusions & Features</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-subtle/40">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${features.whiteLabel ? "bg-ok/10 text-ok" : "bg-line text-muted"}`}>
                {features.whiteLabel ? "✓" : "–"}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">White-label branding</span>
                <span className="text-[11px] text-muted">{features.whiteLabel ? "Custom logos & colors" : "Agency & Pro only"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-subtle/40">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${features.scheduledClientReports ? "bg-ok/10 text-ok" : "bg-line text-muted"}`}>
                {features.scheduledClientReports ? "✓" : "–"}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">Client monthly reports</span>
                <span className="text-[11px] text-muted">{features.scheduledClientReports ? "Automated delivery" : "Agency & Pro only"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-subtle/40">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${features.slackWebhook ? "bg-ok/10 text-ok" : "bg-line text-muted"}`}>
                {features.slackWebhook ? "✓" : "–"}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">Slack webhook alerts</span>
                <span className="text-[11px] text-muted">{features.slackWebhook ? "Real-time regression alerts" : "Growth & above"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-subtle/40">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${features.customDomain ? "bg-ok/10 text-ok" : "bg-line text-muted"}`}>
                {features.customDomain ? "✓" : "–"}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">Custom portal domain</span>
                <span className="text-[11px] text-muted">{features.customDomain ? "status.yourbrand.com" : "Agency Pro only"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-subtle/40">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${features.publicApi ? "bg-ok/10 text-ok" : "bg-line text-muted"}`}>
                {features.publicApi ? "✓" : "–"}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">REST API & API keys</span>
                <span className="text-[11px] text-muted">{features.publicApi ? "Full programmatic access" : "Agency Pro only"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-subtle/40">
              <span className="grid size-6 place-items-center rounded-full text-xs font-bold bg-ok/10 text-ok">
                ✓
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">Scan depth per site</span>
                <span className="text-[11px] text-muted">{limits.maxPagesPerScan} pages scanned</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold m-0 text-ink">Payment Method</h3>
            <button
              type="button"
              onClick={() => showToast("Opening card update modal...")}
              className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
            >
              Update card
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-line bg-subtle text-ink">
              <Icon d={I.creditCard} size={20} />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Card processed securely via Paddle</span>
              <span className="text-xs text-muted">Merchant of record for sales tax and compliance</span>
            </div>
          </div>
        </div>
      </div>

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        upgradeTo={plan === "trial" || plan === "store" ? "growth" : plan === "growth" ? "agency" : "agency_pro"}
        message={`Currently subscribed to the ${planName} Plan. Upgrade to unlock more monitored sites, team seats, and white-label features.`}
      />
    </SettingsLayout>
  );
}
