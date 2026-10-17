"use client";

import React from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";

export default function BillingSettingsPage() {
  const { showToast } = useToast();

  return (
    <SettingsLayout
      title="Billing & Plans"
      description="Manage your subscription, plan limits, payment method, and invoices."
    >
      <div className="flex flex-col gap-6 max-w-4xl">
        {/* Current Plan Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Current Subscription</span>
              <h2 className="text-2xl font-serif font-normal m-0 mt-0.5 text-ink">Agency Plan</h2>
              <p className="text-sm text-muted m-0 mt-1">$149 / month · Renews on 5 November 2026</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => showToast("Paddle billing portal opening...", { type: "info" })}
                className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle"
              >
                Change plan
              </button>
              <button
                type="button"
                onClick={() => showToast("Redirecting to customer billing portal...", { type: "info" })}
                className="ease-ui rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Manage subscription
              </button>
            </div>
          </div>

          <div className="my-1 h-px bg-line" />

          {/* Usage Meters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Monitored sites</span>
                <span className="font-semibold text-ink">18 / 25</span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: "72%" }} />
              </div>
              <span className="text-[11px] text-muted">7 sites remaining on this plan</span>
            </div>

            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Team seats</span>
                <span className="font-semibold text-ink">3 / 5</span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: "60%" }} />
              </div>
              <span className="text-[11px] text-muted">2 team seats remaining</span>
            </div>

            <div className="rounded-xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Monthly crawl quota</span>
                <span className="font-semibold text-ink">4,500 / 10,000</span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                <div className="h-full bg-ok rounded-full" style={{ width: "45%" }} />
              </div>
              <span className="text-[11px] text-muted">Resets in 18 days</span>
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
              <span className="text-sm font-semibold text-ink">Mastercard ending in 4242</span>
              <span className="text-xs text-muted">Expires 08/2028</span>
            </div>
          </div>
        </div>

        {/* Invoices */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-4">
          <h3 className="text-base font-semibold m-0 text-ink">Recent Invoices</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line text-xs font-semibold text-muted">
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Amount</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                <tr>
                  <td className="py-3 font-medium text-ink">5 Oct 2026</td>
                  <td className="py-3 text-ink">$149.00</td>
                  <td className="py-3"><span className="rounded-full bg-ok/10 text-ok px-2 py-0.5 font-semibold">Paid</span></td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => showToast("Downloading invoice PDF...")}
                      className="text-primary hover:underline border-0 bg-transparent p-0 cursor-pointer font-medium"
                    >
                      Download
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-medium text-ink">5 Sep 2026</td>
                  <td className="py-3 text-ink">$149.00</td>
                  <td className="py-3"><span className="rounded-full bg-ok/10 text-ok px-2 py-0.5 font-semibold">Paid</span></td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => showToast("Downloading invoice PDF...")}
                      className="text-primary hover:underline border-0 bg-transparent p-0 cursor-pointer font-medium"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
