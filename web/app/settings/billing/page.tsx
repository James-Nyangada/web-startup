"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import {
  appApi,
  type ApiBillingInfo,
  type ApiInvoice,
} from "@/lib/app-api";
import { openPaddleCheckout } from "@/lib/paddle";
import { useFocusTrap } from "@/components/use-focus-trap";
import { apiClient } from "@/lib/api";

const DEFAULT_BILLING: ApiBillingInfo = {
  plan: "trial",
  planName: "14-Day Trial",
  billingStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  paddleCustomerId: null,
  subscription: null,
  period: {
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  cancelAtPeriodEnd: false,
  usage: {
    sites: { current: 1, limit: 3 },
    teamMembers: { current: 1, limit: 3 },
    aiSuggestions: { current: 0, limit: 20 },
  },
  customerPortalUrl: "https://sandbox-customer-portal.paddle.com",
  invoices: [],
};

const PLANS_CONFIG = [
  {
    id: "store",
    name: "Store",
    priceMonthly: 29,
    priceAnnual: 290,
    sites: 1,
    pagesPerScan: 250,
    seats: 2,
    frequency: "Weekly automated scans",
    features: ["Single store owner", "WCAG 2.1 & 2.2 AA coverage", "2 team member seats"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 79,
    priceAnnual: 790,
    sites: 3,
    pagesPerScan: 500,
    seats: 5,
    tag: "Popular",
    frequency: "Daily automated scans",
    features: [
      "Up to 3 monitored sites",
      "Daily automated scans",
      "Instant regression email alerts",
      "Slack webhook integration",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    priceMonthly: 199,
    priceAnnual: 1990,
    sites: 25,
    pagesPerScan: 250,
    seats: 10,
    tag: "Most Popular",
    frequency: "Weekly (5 daily sites)",
    features: [
      "Up to 25 monitored sites",
      "White-label branding & PDF reports",
      "Unlimited client viewers",
      "Scheduled client monthly reports",
    ],
  },
  {
    id: "agency_pro",
    name: "Agency Pro",
    priceMonthly: 399,
    priceAnnual: 3990,
    sites: 75,
    pagesPerScan: 500,
    seats: 999,
    frequency: "Daily automated scans",
    features: [
      "Up to 75 monitored sites",
      "Custom portal domain",
      "Public REST API & API keys",
      "Unlimited team member seats",
    ],
  },
];

export default function BillingSettingsPage() {
  const { showToast } = useToast();
  const [billing, setBilling] = useState<ApiBillingInfo>(DEFAULT_BILLING);
  const [loading, setLoading] = useState(true);
  const [orgSlug, setOrgSlug] = useState<string>("brightline");
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [billingCycle, setBillingCycle] = useState<"month" | "year">("month");
  const [actionLoading, setActionLoading] = useState(false);

  // Focus traps for modals
  const changePlanDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(changePlanDialogRef, changePlanOpen);

  const cancelDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cancelDialogRef, cancelModalOpen);

  // Resolve current active organisation
  useEffect(() => {
    apiClient<{ user: any; orgs: Array<{ id: string; slug: string }> }>("/v1/me")
      .then((data) => {
        if (data?.orgs?.length && data.orgs[0]?.slug) {
          setOrgSlug(data.orgs[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  const fetchBilling = useCallback(async () => {
    try {
      setLoading(true);
      const res = await appApi.getBilling(orgSlug);
      if (res) {
        setBilling(res);
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const handleCheckout = async (planId: string) => {
    try {
      setActionLoading(true);
      const checkoutSettings = await appApi.createCheckoutSession(orgSlug, {
        plan: planId,
        interval: billingCycle,
      });

      await openPaddleCheckout({
        priceId: checkoutSettings.priceId,
        customerEmail: checkoutSettings.customerEmail,
        customData: checkoutSettings.customData,
        paddleEnvironment: checkoutSettings.paddleEnvironment,
        clientToken: checkoutSettings.clientToken,
        onSuccess: async () => {
          showToast("Payment confirmed! Your plan is now active.", { type: "info" });
          setChangePlanOpen(false);
          await fetchBilling();
        },
        onClose: () => {
          setActionLoading(false);
        },
      });
    } catch (err: any) {
      showToast(err?.message || "Failed to initiate checkout", { type: "warning" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setActionLoading(true);
      const res = await appApi.cancelSubscription(orgSlug, cancelReason);
      showToast(res.message || "Subscription scheduled for cancellation.", { type: "info" });
      setCancelModalOpen(false);
      await fetchBilling();
    } catch (err: any) {
      showToast(err?.message || "Failed to cancel subscription", { type: "warning" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    try {
      setActionLoading(true);
      const res = await appApi.resumeSubscription(orgSlug);
      showToast(res.message || "Subscription renewal resumed.", { type: "info" });
      await fetchBilling();
    } catch (err: any) {
      showToast(err?.message || "Failed to resume subscription", { type: "warning" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      const url = await appApi.getCustomerPortalUrl(orgSlug);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        showToast("Customer portal is currently unavailable", { type: "warning" });
      }
    } catch {
      showToast("Unable to reach customer portal. Try again later.", { type: "warning" });
    }
  };

  const { plan, planName, billingStatus, period, cancelAtPeriodEnd, usage, invoices } = billing;

  const sitesPercent = usage.sites.limit
    ? Math.min(100, Math.round((usage.sites.current / usage.sites.limit) * 100))
    : 0;

  const membersPercent = Number.isFinite(usage.teamMembers.limit)
    ? Math.min(100, Math.round((usage.teamMembers.current / usage.teamMembers.limit) * 100))
    : 10;

  const aiPercent = usage.aiSuggestions.limit
    ? Math.min(100, Math.round((usage.aiSuggestions.current / usage.aiSuggestions.limit) * 100))
    : 0;

  const formattedEndDate = period.currentPeriodEnd
    ? new Date(period.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <SettingsLayout
      title="Billing & Plans"
      description="Manage your subscription, plan limits, usage meters, and billing portal."
    >
      <div className="flex flex-col gap-6 max-w-4xl">
        {/* Scheduled Cancel Alert Banner */}
        {cancelAtPeriodEnd && (
          <div
            role="status"
            className="flex items-center justify-between gap-4 rounded-xl border border-warn/30 bg-warn/10 p-4 text-ink"
          >
            <div className="flex items-center gap-3">
              <span className="text-warn font-bold">⚠</span>
              <span className="text-sm font-medium">
                Your subscription is scheduled to cancel on <strong>{formattedEndDate}</strong>. Your account will enter read-only mode after this date.
              </span>
            </div>
            <button
              type="button"
              onClick={handleResumeSubscription}
              disabled={actionLoading}
              className="ease-ui rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover shadow-card cursor-pointer shrink-0"
            >
              Resume subscription
            </button>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Current Subscription
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    billingStatus === "active"
                      ? "bg-ok/10 text-ok"
                      : billingStatus === "past_due"
                        ? "bg-warn/10 text-warn"
                        : billingStatus === "canceled"
                          ? "bg-danger/10 text-danger"
                          : "bg-primary/10 text-primary"
                  }`}
                >
                  {billingStatus}
                </span>
              </div>
              <h2 className="text-2xl font-serif font-normal m-0 mt-1 text-ink">
                {planName} Plan
              </h2>
              <p className="text-sm text-muted m-0 mt-1">
                {formattedEndDate
                  ? cancelAtPeriodEnd
                    ? `Cancels at period end: ${formattedEndDate}`
                    : `Current period renews on ${formattedEndDate}`
                  : "Evaluation period"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setChangePlanOpen(true)}
                className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle cursor-pointer"
              >
                Change plan
              </button>
              <button
                type="button"
                onClick={handleOpenPortal}
                className="ease-ui rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-card cursor-pointer"
              >
                Manage in portal
              </button>
            </div>
          </div>

          <div className="my-1 h-px bg-line" />

          {/* Usage Meters (Spec Section 1.4) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sites Meter */}
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Monitored sites</span>
                <span className="font-semibold text-ink">
                  {usage.sites.current} / {usage.sites.limit}
                </span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-line overflow-hidden"
                role="progressbar"
                aria-valuenow={sitesPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Monitored sites usage"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${sitesPercent >= 90 ? "bg-warn" : "bg-primary"}`}
                  style={{ width: `${sitesPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">
                {Math.max(0, usage.sites.limit - usage.sites.current)} sites remaining
              </span>
            </div>

            {/* Team Members Meter */}
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Team seats</span>
                <span className="font-semibold text-ink">
                  {usage.teamMembers.current} /{" "}
                  {Number.isFinite(usage.teamMembers.limit) ? usage.teamMembers.limit : "Unlimited"}
                </span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-line overflow-hidden"
                role="progressbar"
                aria-valuenow={membersPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Team seats usage"
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${membersPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">
                {Number.isFinite(usage.teamMembers.limit)
                  ? `${Math.max(0, usage.teamMembers.limit - usage.teamMembers.current)} seats remaining`
                  : "Unlimited seats included"}
              </span>
            </div>

            {/* AI Suggestions Quota */}
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">AI fix suggestions</span>
                <span className="font-semibold text-ink">
                  {usage.aiSuggestions.current} / {usage.aiSuggestions.limit}
                </span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-line overflow-hidden"
                role="progressbar"
                aria-valuenow={aiPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="AI suggestions quota"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${aiPercent >= 90 ? "bg-warn" : "bg-ok"}`}
                  style={{ width: `${aiPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">
                {Math.max(0, usage.aiSuggestions.limit - usage.aiSuggestions.current)} requests remaining this month
              </span>
            </div>
          </div>
        </div>

        {/* Invoice History Section */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold m-0 text-ink">Invoice History</h3>
            <button
              type="button"
              onClick={handleOpenPortal}
              className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
            >
              Manage payment method &amp; tax details →
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-subtle mb-2">
                <Icon d={I.fileText} size={18} />
              </span>
              <p className="text-sm m-0 font-medium">No invoices yet</p>
              <p className="text-xs m-0 mt-1">Invoices appear here automatically when payments are processed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse" aria-label="Organization invoice history">
                <thead>
                  <tr className="border-b border-line text-xs font-semibold uppercase text-muted">
                    <th scope="col" className="pb-3 pr-4">Date</th>
                    <th scope="col" className="pb-3 px-4">Transaction</th>
                    <th scope="col" className="pb-3 px-4">Amount</th>
                    <th scope="col" className="pb-3 px-4">Status</th>
                    <th scope="col" className="pb-3 pl-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-subtle/50">
                      <td className="py-3 pr-4 font-medium text-ink">
                        {new Date(inv.billedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4 text-muted font-mono text-xs">
                        {inv.paddleTransactionId}
                      </td>
                      <td className="py-3 px-4 font-semibold text-ink">
                        ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok capitalize">
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right">
                        {inv.invoiceUrl ? (
                          <a
                            href={inv.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Download PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cancellation / Account Management */}
        {plan !== "trial" && !cancelAtPeriodEnd && (
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-3">
            <h3 className="text-base font-semibold m-0 text-ink">Cancel Subscription</h3>
            <p className="text-xs text-muted m-0">
              Need to pause or cancel? You will keep full access to your monitored sites and scan history until the end of the billing period.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className="ease-ui rounded-full border border-danger/30 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/10 cursor-pointer"
              >
                Cancel subscription
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Plan Modal */}
      {changePlanOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-plan-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in"
        >
          <div
            ref={changePlanDialogRef}
            className="w-full max-w-3xl rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-card flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 id="change-plan-title" className="text-xl font-bold m-0 text-ink">
                  Change Subscription Plan
                </h2>
                <p className="text-xs text-muted m-0 mt-1">
                  Choose the plan that fits your monitoring and client care requirements.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChangePlanOpen(false)}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink cursor-pointer"
                aria-label="Close dialog"
              >
                <Icon d={I.close} size={18} />
              </button>
            </div>

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center">
              <div
                role="radiogroup"
                aria-label="Billing cycle"
                className="flex items-center rounded-full border border-line bg-subtle p-1 text-xs"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={billingCycle === "month"}
                  onClick={() => setBillingCycle("month")}
                  className={`rounded-full px-4 py-1.5 font-medium transition-colors cursor-pointer ${
                    billingCycle === "month"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Monthly billing
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={billingCycle === "year"}
                  onClick={() => setBillingCycle("year")}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium transition-colors cursor-pointer ${
                    billingCycle === "year"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <span>Annual billing</span>
                  <span className="rounded-full bg-ok/10 px-1.5 py-0.2 text-[10px] font-bold text-ok">
                    Save ~17%
                  </span>
                </button>
              </div>
            </div>

            {/* Plan Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PLANS_CONFIG.map((p) => {
                const isCurrent = plan === p.id;
                const price = billingCycle === "year" ? Math.round(p.priceAnnual / 12) : p.priceMonthly;

                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                      isCurrent
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-line bg-surface hover:border-primary/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-ink">{p.name}</span>
                        {p.tag && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            {p.tag}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-bold text-ok">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-ink">${price}</span>
                        <span className="text-xs text-muted">/ month</span>
                      </div>
                      <p className="text-[11px] text-muted m-0 mt-0.5">
                        {billingCycle === "year" ? `$${p.priceAnnual} billed annually` : "Billed monthly"}
                      </p>

                      <ul className="mt-4 flex flex-col gap-2 list-none p-0 text-xs">
                        {p.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-ink">
                            <span className="text-ok font-bold">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      disabled={isCurrent || actionLoading}
                      onClick={() => handleCheckout(p.id)}
                      className={`ease-ui flex h-10 w-full items-center justify-center rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                        isCurrent
                          ? "bg-subtle text-muted cursor-not-allowed"
                          : "bg-primary text-on-primary hover:bg-primary-hover shadow-card"
                      }`}
                    >
                      {isCurrent ? "Current plan" : `Select ${p.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setChangePlanOpen(false)}
                className="ease-ui rounded-full border border-line px-5 py-2 text-xs font-semibold text-ink hover:bg-subtle cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in"
        >
          <div
            ref={cancelDialogRef}
            className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 sm:p-7 shadow-card flex flex-col gap-5"
          >
            <div className="flex items-center justify-between">
              <h2 id="cancel-dialog-title" className="text-lg font-bold text-ink m-0">
                Cancel Subscription?
              </h2>
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink cursor-pointer"
                aria-label="Close dialog"
              >
                <Icon d={I.close} size={18} />
              </button>
            </div>

            <p className="text-sm text-ink m-0">
              Your subscription will remain active until <strong>{formattedEndDate}</strong>. After this date, your organization will transition to read-only mode.
            </p>

            <div className="flex flex-col gap-2">
              <label htmlFor="cancel-reason" className="text-xs font-medium text-muted">
                Reason for canceling (optional)
              </label>
              <select
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="rounded-xl border border-line bg-subtle/50 px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
              >
                <option value="">Select a reason...</option>
                <option value="too_expensive">Too expensive / reduced budget</option>
                <option value="features_missing">Missing specific accessibility features</option>
                <option value="temporary">Temporary pause / switching client focus</option>
                <option value="other">Other reason</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle cursor-pointer"
              >
                Keep subscription
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleCancelSubscription}
                className="ease-ui rounded-full bg-danger px-4 py-2 text-xs font-semibold text-on-primary hover:bg-danger/90 cursor-pointer shadow-card"
              >
                {actionLoading ? "Canceling..." : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
