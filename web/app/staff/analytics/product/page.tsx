"use client";

import React, { useEffect, useState } from "react";
import { StaffShell } from "@/components/staff/staff-shell";
import { staffApi } from "@/lib/admin-api";
import {
  AccessibleChart,
  LineChart,
  BarChart,
  DateRangeControl,
  type DatePreset,
} from "@/components/staff/charts";

export default function ProductUsagePage() {
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [compare, setCompare] = useState(false);
  const [loading, setLoading] = useState(true);

  type Series = { label: string; value: number; secondaryValue?: number }[];
  const [scansPerDay, setScansPerDay] = useState<Series>([]);
  const [failureRate, setFailureRate] = useState<{ date: string; value: number; label: string }[]>([]);
  const [issuesData, setIssuesData] = useState<Series>([]);
  const [waoData, setWaoData] = useState<{ date: string; value: number; label: string }[]>([]);
  const [featureAdoption, setFeatureAdoption] = useState<{ label: string; value: number }[]>([]);
  const [totalPaying, setTotalPaying] = useState(0);
  const [aiSuggestions, setAiSuggestions] = useState<Series>([]);
  const [error, setError] = useState<string | null>(null);

  const loadProductMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const past = new Date(now.getTime() - (preset === "7d" ? 6 : preset === "30d" ? 29 : 89) * 86_400_000);
      const range = { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };

      const [scansRes, failRes, waoRes, insights] = await Promise.all([
        staffApi.metrics({ metric: "scans_total", ...range, granularity: "day" }),
        staffApi.metrics({ metric: "scan_failure_rate", ...range, granularity: "day" }),
        staffApi.metrics({ metric: "weekly_active_orgs", ...range, granularity: "week" }),
        staffApi.productInsights(range),
      ]);

      setScansPerDay(scansRes.points.map((p) => ({ label: p.date.slice(5), value: p.value })));
      setFailureRate(
        failRes.points.map((p) => ({ date: p.date, value: Math.round(p.value * 1000) / 10, label: p.date.slice(5) })),
      );
      setWaoData(waoRes.points.map((p) => ({ date: p.date, value: p.value, label: p.date })));
      setIssuesData(insights.issueTrend.map((w) => ({ label: w.week, value: w.found, secondaryValue: w.fixed })));
      setFeatureAdoption(insights.adoption.items);
      setTotalPaying(insights.adoption.totalPaying);
      setAiSuggestions(insights.aiTrend.map((w) => ({ label: w.week, value: w.generated, secondaryValue: w.flagged })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load product usage.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProductMetrics();
  }, [preset, compare]);

  return (
    <StaffShell title="Product Usage (S-93)">
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
          onRefresh={loadProductMetrics}
          refreshing={loading}
        />

        {/* Scans per day */}
        <AccessibleChart
          findingTitle={`${scansPerDay.reduce((t, x) => t + x.value, 0).toLocaleString()} scans queued in this period`}
          summaryText="Scans queued per day across all customer sites (scheduled, manual and onboarding)."
          tableHeaders={["Day", "Scans"]}
          tableRows={scansPerDay.map((s) => [s.label, s.value])}
        >
          <BarChart
            data={scansPerDay}
            valueFormatter={(v) => `${v.toLocaleString()} scans`}
            ariaLabel="Daily scans completed"
          />
        </AccessibleChart>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Scan failure rate */}
          <AccessibleChart
            findingTitle="Scan failure rate"
            summaryText="Share of scans that failed or only partly completed, per day."
            tableHeaders={["Day", "Failure rate %"]}
            tableRows={failureRate.map((d) => [d.label, `${d.value}%`])}
          >
            <LineChart
              data={failureRate}
              valueFormatter={(v) => `${v}%`}
              unit="%"
              ariaLabel="Scan failure rate per day"
            />
          </AccessibleChart>

          {/* Weekly Active Organisations */}
          <AccessibleChart
            findingTitle="Weekly active organisations"
            summaryText="Organisations with a member signed in or a report generated in the 7 days to each date."
            tableHeaders={["Date", "Active orgs"]}
            tableRows={waoData.map((d) => [d.label, d.value])}
          >
            <LineChart
              data={waoData}
              valueFormatter={(v) => `${v} orgs`}
              unit="orgs"
              ariaLabel="Weekly active organisations"
            />
          </AccessibleChart>
        </div>

        {/* Issues found vs fixed per week */}
        <AccessibleChart
          findingTitle="Issues found vs fixed per week across all customers"
          summaryText="For each week, the first bar is issues found and the second is issues fixed. A rising fixed bar is the clearest sign customers get value."
          tableHeaders={["Week starting", "Found", "Fixed"]}
          tableRows={issuesData.map((d) => [d.label, d.value, d.secondaryValue ?? 0])}
        >
          <BarChart data={issuesData} valueFormatter={(v) => `${v.toLocaleString()} issues`} ariaLabel="Issues found and fixed per week" />
        </AccessibleChart>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Feature Adoption Breakdown */}
          <AccessibleChart
            findingTitle={totalPaying ? `Feature adoption across ${totalPaying} paying organisation${totalPaying === 1 ? "" : "s"}` : "No paying organisations yet"}
            summaryText="Percentage of paying organisations with at least one report, schedule, webhook, API key, manual check or statement."
            tableHeaders={["Feature", "Adoption %"]}
            tableRows={featureAdoption.map((f) => [f.label, `${f.value}%`])}
          >
            <BarChart
              data={featureAdoption}
              horizontal
              valueFormatter={(v) => `${v}%`}
              ariaLabel="Feature adoption rates"
            />
          </AccessibleChart>

          {/* AI Suggestions Generated & Reviewed */}
          <AccessibleChart
            findingTitle="AI suggestions generated and flagged per week"
            summaryText="For each week, the first bar is suggestions generated and the second is suggestions customers flagged."
            tableHeaders={["Week", "Generated", "Flagged for review"]}
            tableRows={aiSuggestions.map((a) => [a.label, a.value, a.secondaryValue ?? 0])}
          >
            <BarChart
              data={aiSuggestions}
              valueFormatter={(v) => `${v} suggestions`}
              ariaLabel="AI suggestions weekly volume"
            />
          </AccessibleChart>
        </div>
      </div>
    </StaffShell>
  );
}
