"use client";

import React, { useEffect, useState } from "react";
import { StaffShell, card, th, td } from "@/components/staff/staff-shell";
import { staffApi, type FunnelData } from "@/lib/admin-api";
import {
  AccessibleChart,
  FunnelChart,
  CohortTable,
  BarChart,
  DateRangeControl,
  type DatePreset,
} from "@/components/staff/charts";

export default function FunnelRetentionPage() {
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [compare, setCompare] = useState(false);
  const [loading, setLoading] = useState(true);

  const [funnelSteps, setFunnelSteps] = useState<FunnelData["steps"]>([]);
  const [sourceBreakdown, setSourceBreakdown] = useState<FunnelData["bySource"]>([]);
  const [cohorts, setCohorts] = useState<{ cohort: string; size: number; retention: number[] }[]>([]);
  const [activationDistribution, setActivationDistribution] = useState<{ label: string; value: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const past = new Date(now.getTime() - (preset === "7d" ? 6 : preset === "30d" ? 29 : 89) * 86_400_000);
      const range = { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };

      const [funnelRes, cohortsRes, activationRes] = await Promise.all([
        staffApi.funnel(range),
        staffApi.cohorts(),
        staffApi.activationDistribution(range),
      ]);
      setFunnelSteps(funnelRes.steps);
      setSourceBreakdown(funnelRes.bySource);
      setCohorts(cohortsRes.cohorts);
      setActivationDistribution(activationRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load funnel data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [preset, compare]);

  return (
    <StaffShell title="Funnel & Retention (S-94)">
      <div className="flex flex-col gap-6">
        <DateRangeControl
          preset={preset}
          onPresetChange={setPreset}
          compare={compare}
          onCompareChange={setCompare}
          onRefresh={loadData}
          refreshing={loading}
        />

        {error && (
          <div role="alert" className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
            {error}
          </div>
        )}

        {/* Funnel for selected period */}
        <AccessibleChart
          findingTitle={funnelSteps.length > 1 ? `${funnelSteps[funnelSteps.length - 1]!.count.toLocaleString()} paid from ${funnelSteps[0]!.count.toLocaleString()} ${funnelSteps[0]!.name.toLowerCase()}` : "Conversion funnel"}
          summaryText="Counts for the period, with the share that moves on from each step to the next. Website visitors appear only when Umami is connected."
          tableHeaders={["Step", "Count", "Conversion %"]}
          tableRows={funnelSteps.map((s) => [s.name, s.count.toLocaleString(), `${s.conversionPct}%`])}
        >
          <FunnelChart steps={funnelSteps} ariaLabel="Customer conversion funnel" />
        </AccessibleChart>

        {/* Funnel breakdown by first-touch source */}
        <section className={card} aria-label="Funnel by first touch source">
          <div className="mb-4">
            <h3 className="m-0 text-base font-semibold text-ink">Funnel by First-Touch Source (orgs.first_utm)</h3>
            <p className="mt-1 text-xs text-muted">
              Sign-ups with no recorded UTM source are counted as "direct". Visitor and check counts per source are not available because the website does not record them per source.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-subtle">
                <tr>
                  <th scope="col" className={th}>First-touch source</th>
                  <th scope="col" className={th}>Signups</th>
                  <th scope="col" className={th}>Activated</th>
                  <th scope="col" className={th}>Paid</th>
                  <th scope="col" className={th}>Sign-up → paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {sourceBreakdown.map((row) => (
                  <tr key={row.source} className="hover:bg-subtle/40">
                    <td className={`${td} font-semibold text-ink`}>{row.source}</td>
                    <td className={`${td} font-mono`}>{row.signups.toLocaleString()}</td>
                    <td className={`${td} font-mono`}>{row.activated.toLocaleString()}</td>
                    <td className={`${td} font-mono font-bold text-ok`}>{row.paid.toLocaleString()}</td>
                    <td className={`${td} font-mono`}>
                      {row.signups > 0 ? `${Math.round((row.paid / row.signups) * 1000) / 10}%` : "—"}
                    </td>
                  </tr>
                ))}
                {sourceBreakdown.length === 0 && (
                  <tr><td className={td} colSpan={5}>No sign-ups in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Retention Cohorts Matrix */}
        <AccessibleChart
          findingTitle={cohorts.length ? `${cohorts.length} paying cohort${cohorts.length === 1 ? "" : "s"}, grouped by month of first payment` : "No paying cohorts yet"}
          summaryText="Share of each month's first-time paying customers still paying N months later. A cancellation is dated by when the subscription last changed."
          tableHeaders={["Cohort", "Size", "M0", "M1", "M2", "M3", "M6", "M12"]}
          tableRows={cohorts.map((c) => [
            c.cohort,
            c.size,
            `${c.retention[0] || 0}%`,
            `${c.retention[1] || 0}%`,
            `${c.retention[2] || 0}%`,
            `${c.retention[3] || 0}%`,
            `${c.retention[6] || 0}%`,
            `${c.retention[11] || 0}%`,
          ])}
        >
          <CohortTable cohorts={cohorts} ariaLabel="Retention cohort heatmap table" />
        </AccessibleChart>

        {/* Time to activate distribution */}
        <AccessibleChart
          findingTitle="Time to activate (days from sign-up)"
          summaryText="Number of organisations that completed activation, by how many days after sign-up they did it."
          tableHeaders={["Time window", "Organisations"]}
          tableRows={activationDistribution.map((a) => [a.label, a.value])}
        >
          <BarChart
            data={activationDistribution}
            horizontal
            valueFormatter={(v) => `${v} orgs`}
            ariaLabel="Time to activate distribution"
          />
        </AccessibleChart>
      </div>
    </StaffShell>
  );
}
