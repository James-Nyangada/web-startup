"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { StaffShell, btn, th, td } from "@/components/staff/staff-shell";
import { staffApi, formatMoney } from "@/lib/admin-api";

type BusinessInsights = Awaited<ReturnType<typeof staffApi.businessInsights>>;
import {
  AccessibleChart,
  LineChart,
  BarChart,
  StackedBars,
  DateRangeControl,
  type DatePreset,
} from "@/components/staff/charts";

export default function BusinessAnalyticsPage() {
  const [preset, setPreset] = useState<DatePreset>("12m");
  const [compare, setCompare] = useState(true);
  const [loading, setLoading] = useState(true);

  type Point = { date: string; value: number; label: string };
  const [mrrData, setMrrData] = useState<Point[]>([]);
  const [mrrComparison, setMrrComparison] = useState<Point[]>([]);
  const [movementData, setMovementData] = useState<
    { label: string; positive: { category: string; value: number; color: string }[]; negative: { category: string; value: number; color: string }[] }[]
  >([]);
  const [planMix, setPlanMix] = useState<{ label: string; value: number; count: number }[]>([]);
  const [cancelReasons, setCancelReasons] = useState<{ label: string; value: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<BusinessInsights["topCustomers"]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const days = preset === "7d" ? 6 : preset === "30d" ? 29 : preset === "90d" ? 89 : 364;
      const range = {
        from: new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
      };
      const toPoints = (pts: { date: string; value: number }[]): Point[] =>
        pts.map((p) => ({ date: p.date, value: Math.round(p.value / 100), label: p.date }));

      const [mrrRes, newRes, expRes, contRes, churnRes, insights] = await Promise.all([
        staffApi.metrics({ metric: "mrr", ...range, granularity: days > 100 ? "month" : "week", compare }),
        staffApi.metrics({ metric: "new_mrr", ...range, granularity: "month" }),
        staffApi.metrics({ metric: "expansion_mrr", ...range, granularity: "month" }),
        staffApi.metrics({ metric: "contraction_mrr", ...range, granularity: "month" }),
        staffApi.metrics({ metric: "churned_mrr", ...range, granularity: "month" }),
        staffApi.businessInsights(range),
      ]);

      setMrrData(toPoints(mrrRes.points));
      setMrrComparison(mrrRes.comparison ? toPoints(mrrRes.comparison) : []);

      const months = [...new Set([...newRes.points, ...expRes.points, ...contRes.points, ...churnRes.points].map((p) => p.date))].sort();
      const dollars = (pts: { date: string; value: number }[], m: string) =>
        Math.round((pts.find((p) => p.date === m)?.value ?? 0) / 100);
      setMovementData(
        months.map((m) => ({
          label: m.slice(0, 7),
          positive: [
            { category: "New MRR", value: dollars(newRes.points, m), color: "#10b981" },
            { category: "Expansion", value: dollars(expRes.points, m), color: "#6366f1" },
          ],
          negative: [
            { category: "Contraction", value: dollars(contRes.points, m), color: "#f59e0b" },
            { category: "Churned", value: dollars(churnRes.points, m), color: "#ef4444" },
          ],
        })),
      );

      setPlanMix(
        insights.plans.map((p) => ({
          label: p.plan.replace("_", " ").toUpperCase(),
          value: Math.round(p.mrrCents / 100),
          count: p.count,
        })),
      );
      setCancelReasons(insights.cancellations);
      setTopCustomers(insights.topCustomers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load business metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, [preset, compare]);

  return (
    <StaffShell title="Business & Revenue (S-91)">
      <div className="flex flex-col gap-6">
        {error && (
          <div role="alert" className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
            {error}
          </div>
        )}
        <DateRangeControl
          preset={preset}
          onPresetChange={setPreset}
          compare={compare}
          onCompareChange={setCompare}
          onRefresh={loadMetrics}
          refreshing={loading}
        />

        {/* MRR over time */}
        <AccessibleChart
          findingTitle={mrrData.length > 1 ? `MRR went from $${mrrData[0]!.value.toLocaleString()} to $${mrrData[mrrData.length - 1]!.value.toLocaleString()} over the period` : "MRR over time"}
          summaryText="Monthly recurring revenue from active and past-due subscriptions in USD (annual ÷ 12). History before the first daily snapshot is rebuilt from subscription dates, so it can overstate months where customers later cancelled."
          tableHeaders={["Period", "MRR (USD)"]}
          tableRows={mrrData.map((d) => [d.date, `$${d.value.toLocaleString()}`])}
        >
          <LineChart
            data={mrrData}
            comparisonData={compare ? mrrComparison : undefined}
            valueFormatter={(v) => `$${v.toLocaleString()}`}
            ariaLabel="MRR over time"
          />
        </AccessibleChart>

        {/* MRR Movement: New, Expansion, Churn */}
        <AccessibleChart
          findingTitle="Monthly MRR movement: new, expansion, contraction and churned"
          summaryText="New subscriptions and upgrades above the line, downgrades and cancellations below. Upgrades and downgrades are recorded from the day this tracking was added."
          tableHeaders={["Month", "New MRR", "Expansion", "Contraction", "Churned"]}
          tableRows={movementData.map((m) => [
            m.label,
            `+$${m.positive[0]?.value || 0}`,
            `+$${m.positive[1]?.value || 0}`,
            `-$${m.negative[0]?.value || 0}`,
            `-$${m.negative[1]?.value || 0}`,
          ])}
        >
          <StackedBars
            data={movementData}
            valueFormatter={(v) => `$${v.toLocaleString()}`}
            ariaLabel="MRR movement chart"
          />
        </AccessibleChart>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Plan mix */}
          <AccessibleChart
            findingTitle={planMix.length ? `${planMix[0]!.label} brings the most MRR ($${planMix[0]!.value.toLocaleString()})` : "No paying customers yet"}
            summaryText="Paying organisations and MRR per plan, today."
            tableHeaders={["Plan", "MRR (USD)", "Orgs"]}
            tableRows={planMix.map((p) => [p.label, `$${p.value.toLocaleString()}`, p.count])}
          >
            <BarChart
              data={planMix.map((p) => ({
                label: p.label,
                value: p.value,
              }))}
              horizontal
              valueFormatter={(v) => `$${v.toLocaleString()}`}
              ariaLabel="Plan mix revenue distribution"
            />
          </AccessibleChart>

          {/* Cancellation Reasons */}
          <AccessibleChart
            findingTitle={cancelReasons.length ? `"${cancelReasons[0]!.label}" is the top cancellation reason` : "No cancellation reasons recorded yet"}
            summaryText="Answers from the cancel survey in this period. Empty until the survey records responses."
            tableHeaders={["Reason", "Responses"]}
            tableRows={cancelReasons.map((r) => [r.label, r.value])}
          >
            <BarChart
              data={cancelReasons.map((r) => ({
                label: r.label,
                value: r.value,
                color: "#f59e0b",
              }))}
              horizontal
              valueFormatter={(v) => `${v} responses`}
              ariaLabel="Cancellation reasons breakdown"
            />
          </AccessibleChart>
        </div>

        {/* Top 10 Customers by MRR */}
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label="Top 10 customers">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="m-0 text-base font-semibold text-ink">Top 10 Customers by MRR</h3>
              <p className="mt-1 text-sm text-muted">Organisations contributing the highest monthly subscription value.</p>
            </div>
            <Link href="/staff/orgs" className={btn.secondary}>
              View all customers
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-subtle">
                <tr>
                  <th scope="col" className={th}>Organisation</th>
                  <th scope="col" className={th}>Plan</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {topCustomers.map((org) => (
                  <tr key={org.id} className="hover:bg-subtle/40">
                    <td className={td}>
                      <Link href={`/staff/orgs/${org.id}`} className="font-semibold text-ptext hover:underline">
                        {org.name}
                      </Link>
                      {org.slug && <span className="block text-xs text-muted">/{org.slug}</span>}
                    </td>
                    <td className={`${td} capitalize`}>{org.plan.replace("_", " ")}</td>
                    <td className={td}>
                      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok capitalize">
                        {org.billingStatus}
                      </span>
                    </td>
                    <td className={`${td} font-mono font-bold text-ink`}>{formatMoney(org.mrrCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </StaffShell>
  );
}
