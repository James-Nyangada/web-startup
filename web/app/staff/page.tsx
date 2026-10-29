"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { StaffShell, btn, card } from "@/components/staff/staff-shell";
import { staffApi, type DashboardCard, type DashboardData, formatMoney } from "@/lib/admin-api";
import {
  StatCard,
  AccessibleChart,
  LineChart,
  BarChart,
} from "@/components/staff/charts";
import { Icon, I } from "@/components/icons";

const CARD_ORDER: { key: string; finding: string; changeLabel?: string }[] = [
  { key: "mrr", finding: "Annual ÷ 12, excl. tax" },
  { key: "payingCustomers", finding: "Active subscriptions" },
  { key: "trialsActive", finding: "Currently trialing" },
  { key: "trialConversion", finding: "Converted within 30d" },
  { key: "churn", finding: "Logo churn, 30d" },
  { key: "visitors", finding: "Unique visitors, from Umami" },
  { key: "freeChecks", finding: "Lead funnel top" },
  { key: "scanFailureRate", finding: "Failed or partial scans" },
];

function formatCard(card: DashboardCard | undefined): string {
  if (!card || card.value === null) return "—";
  if (card.format === "currency") return formatMoney(card.value);
  if (card.format === "percent") return `${Math.round(card.value * 10) / 10}%`;
  return Math.round(card.value).toLocaleString();
}

function trend(points: number[], noun: string): string {
  if (points.length < 2) return `Not enough ${noun} history yet`;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first === last) return `${noun} is unchanged over the period`;
  return `${noun} ${last > first ? "rose" : "fell"} from ${first.toLocaleString()} to ${last.toLocaleString()} over the period`;
}

export default function StaffDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await staffApi.dashboard();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <StaffShell title="Dashboard">
        <div className="flex h-64 items-center justify-center text-sm text-muted">
          Loading business and operations metrics…
        </div>
      </StaffShell>
    );
  }

  if (error || !data) {
    return (
      <StaffShell title="Dashboard">
        <div className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
          {error || "Could not load dashboard data."}
          <button type="button" onClick={loadData} className={`${btn.secondary} mt-3 block`}>
            Try again
          </button>
        </div>
      </StaffShell>
    );
  }

  const cards = data.statCards || {};

  return (
    <StaffShell
      title="Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/staff/analytics/business" className={btn.secondary}>
            Full business analytics
          </Link>
          <button type="button" onClick={loadData} className={btn.secondary}>
            <Icon d={I.refresh} size={14} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        {/* Stat cards grid (S-90) */}
        <div>
          <h2 className="sr-only">Key Performance Metrics</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CARD_ORDER.map(({ key, finding, changeLabel }) => {
              const c = cards[key];
              return (
                <StatCard
                  key={key}
                  label={c?.label ?? key}
                  value={formatCard(c)}
                  changePct={c?.changePct ?? undefined}
                  changeLabel={changeLabel}
                  finding={c?.value === null || c === undefined ? "No data yet" : finding}
                />
              );
            })}
          </div>
        </div>

        {/* Charts row: MRR over last 12 months & Signups / Conversions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* MRR Trend */}
          <AccessibleChart
            findingTitle={trend((data.mrrMonthly || []).map((m) => Math.round(m.mrrCents / 100)), "MRR (USD)")}
            summaryText="Monthly recurring revenue from active and past-due subscriptions, one point per month from the daily snapshot. History starts when snapshots started (run the backfill for earlier months)."
            tableHeaders={["Month", "MRR (USD)"]}
            tableRows={(data.mrrMonthly || []).map((m) => [m.month, formatMoney(m.mrrCents)])}
          >
            <LineChart
              data={(data.mrrMonthly || []).map((m) => ({
                date: m.month,
                value: Math.round(m.mrrCents / 100),
                label: m.month,
              }))}
              valueFormatter={(v) => `$${v.toLocaleString()}`}
              ariaLabel="Monthly Recurring Revenue trend"
            />
          </AccessibleChart>

          {/* New signups per week with paid conversions */}
          <AccessibleChart
            findingTitle={trend((data.signupsWeekly || []).map((x) => x.signups), "Weekly sign-ups")}
            summaryText="Weekly new organization signups and resulting paid customers."
            tableHeaders={["Week", "Signups", "Converted"]}
            tableRows={(data.signupsWeekly || []).map((s) => [s.week, s.signups, s.converted])}
          >
            <BarChart
              data={(data.signupsWeekly || []).map((s) => ({
                label: s.week,
                value: s.signups,
                secondaryValue: s.converted,
              }))}
              valueFormatter={(v) => `${v} orgs`}
              ariaLabel="Weekly signups chart"
            />
          </AccessibleChart>
        </div>

        {/* Website visitors trend line */}
        <AccessibleChart
          findingTitle={data.trafficConnected ? trend((data.visitorsDaily || []).map((v) => v.visitors), "Daily visitors") : "Website traffic is not connected"}
          summaryText={data.trafficConnected ? "Unique daily visitors recorded by Umami (cookie-less)." : "Set UMAMI_API_URL, UMAMI_API_TOKEN and UMAMI_WEBSITE_ID on the API to show visitor numbers."}
          tableHeaders={["Date", "Visitors"]}
          tableRows={(data.visitorsDaily || []).map((v) => [v.date, v.visitors])}
        >
          <LineChart
            data={(data.visitorsDaily || []).map((v) => ({
              date: v.date,
              value: v.visitors,
              label: v.date.slice(5),
            }))}
            valueFormatter={(v) => v.toLocaleString()}
            unit="visitors"
            ariaLabel="Daily website visitors"
          />
        </AccessibleChart>

        {/* Two columns: Needs Attention & Recent Activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Needs Attention */}
          <section className={card} aria-label="Needs attention list">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-ink flex items-center gap-2">
                <Icon d={I.alert} size={18} className="text-warn" />
                Needs attention
              </h3>
              <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn border border-warn/20">
                {(data.needsAttention || []).length} items
              </span>
            </div>

            <div className="divide-y divide-line">
              {(data.needsAttention || []).map((item) => {
                const isCrit = item.severity === "crit";
                return (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 size-2.5 rounded-full shrink-0 ${
                          isCrit ? "bg-crit" : "bg-warn"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-semibold text-ink">{item.title}</div>
                        <div className="text-xs text-muted">{item.description}</div>
                      </div>
                    </div>
                    {item.href && (
                      <Link
                        href={item.href}
                        className="text-xs font-semibold text-ptext hover:underline shrink-0"
                      >
                        Review
                      </Link>
                    )}
                  </div>
                );
              })}
              {(!data.needsAttention || data.needsAttention.length === 0) && (
                <div className="py-8 text-center text-sm text-muted">
                  No urgent alerts. System and customers are healthy!
                </div>
              )}
            </div>
          </section>

          {/* Recent Activity Feed */}
          <section className={card} aria-label="Recent activity feed">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-ink flex items-center gap-2">
                <Icon d={I.audit} size={18} />
                Recent activity
              </h3>
              <Link href="/staff/audit" className="text-xs font-semibold text-ptext hover:underline">
                View all logs
              </Link>
            </div>

            <div className="divide-y divide-line">
              {(data.recentActivity || []).map((act) => (
                <div key={act.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-medium text-ink">{act.text}</div>
                    <div className="text-muted mt-0.5">{act.date}</div>
                  </div>
                  {act.orgId && (
                    <Link
                      href={`/staff/orgs/${act.orgId}`}
                      className="text-ptext hover:underline shrink-0 font-semibold"
                    >
                      Org details
                    </Link>
                  )}
                </div>
              ))}
              {(!data.recentActivity || data.recentActivity.length === 0) && (
                <div className="py-8 text-center text-sm text-muted">No recent activity logged.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </StaffShell>
  );
}
