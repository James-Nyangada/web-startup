"use client";

import React, { useEffect, useState } from "react";
import { StaffShell, btn, input, card, th, td } from "@/components/staff/staff-shell";
import { staffApi, type TrafficReport } from "@/lib/admin-api";
import {
  AccessibleChart,
  LineChart,
  BarChart,
  DateRangeControl,
  type DatePreset,
} from "@/components/staff/charts";
import { Icon, I } from "@/components/icons";

export default function TrafficAnalyticsPage() {
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [compare, setCompare] = useState(true);
  const [loading, setLoading] = useState(true);

  // UTM Link Builder state
  const [utmUrl, setUtmUrl] = useState("https://everyvisitor.com/free-checker");
  const [utmSource, setUtmSource] = useState("linkedin");
  const [utmMedium, setUtmMedium] = useState("social");
  const [utmCampaign, setUtmCampaign] = useState("accessible-fonts-guide");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  const [report, setReport] = useState<TrafficReport | null>(null);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTraffic = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const past = new Date(now.getTime() - (preset === "7d" ? 6 : preset === "30d" ? 29 : 89) * 86_400_000);
      const res = await staffApi.traffic({
        from: past.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
      });
      if (res.configured === false) {
        setConnected(false);
        setReport(null);
      } else {
        setConnected(true);
        setReport(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load traffic.");
    } finally {
      setLoading(false);
    }
  };

  const visitorsData = (report?.daily ?? []).map((d) => ({ date: d.date, value: d.visitors, label: d.date.slice(5) }));
  const totalVisitors = report?.totals.visitors ?? 0;
  const share = (n: number) => (totalVisitors > 0 ? `${Math.round((n / totalVisitors) * 100)}%` : "—");
  const deviceTotal = (report?.devices ?? []).reduce((t, d) => t + d.visitors, 0);
  const devices = (report?.devices ?? []).map((d) => ({
    label: d.name.charAt(0).toUpperCase() + d.name.slice(1),
    value: deviceTotal > 0 ? Math.round((d.visitors / deviceTotal) * 100) : 0,
  }));
  const checker = report?.checker;
  const checkerUsage = checker
    ? [
        { label: "Checks run", value: checker.checks },
        { label: "Left an email", value: checker.withEmail },
        { label: "Started a trial", value: checker.startedTrial },
      ]
    : [];

  useEffect(() => {
    void loadTraffic();
  }, [preset, compare]);

  // Generate UTM link
  useEffect(() => {
    const u = new URL(utmUrl.startsWith("http") ? utmUrl : `https://${utmUrl}`);
    if (utmSource) u.searchParams.set("utm_source", utmSource);
    if (utmMedium) u.searchParams.set("utm_medium", utmMedium);
    if (utmCampaign) u.searchParams.set("utm_campaign", utmCampaign);
    if (utmTerm) u.searchParams.set("utm_term", utmTerm);
    if (utmContent) u.searchParams.set("utm_content", utmContent);
    setGeneratedLink(u.toString());
  }, [utmUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <StaffShell title="Website Traffic (S-92, Umami)">
      <div className="flex flex-col gap-6">
        <DateRangeControl
          preset={preset}
          onPresetChange={setPreset}
          compare={compare}
          onCompareChange={setCompare}
          onRefresh={loadTraffic}
          refreshing={loading}
        />

        {!connected && (
          <div role="status" className="rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-ink">
            Umami is not connected, so visitor numbers are not shown. Set <code>UMAMI_API_URL</code>,{" "}
            <code>UMAMI_API_TOKEN</code> and <code>UMAMI_WEBSITE_ID</code> on the API and the worker to turn this on.
            The UTM link builder below works without it.
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
            {error}
          </div>
        )}

        {/* Visitors & Pageviews Chart */}
        <AccessibleChart
          findingTitle={report ? `${totalVisitors.toLocaleString()} visitors and ${report.totals.pageViews.toLocaleString()} page views in this period` : "Unique website visitors"}
          summaryText="Unique visitors per day from your cookie-less Umami instance."
          tableHeaders={["Date", "Visitors"]}
          tableRows={visitorsData.map((d) => [d.date, d.value.toLocaleString()])}
        >
          <LineChart
            data={visitorsData}
            valueFormatter={(v) => v.toLocaleString()}
            unit="visitors"
            ariaLabel="Website visitors trend"
          />
        </AccessibleChart>

        {/* UTM Campaign Link Builder Card (Spec P8-14) */}
        <section className={card} aria-label="UTM Link Builder">
          <div className="mb-4">
            <h3 className="m-0 text-base font-semibold text-ink flex items-center gap-2">
              <Icon d={I.link} size={18} />
              UTM Campaign Link Builder
            </h3>
            <p className="mt-1 text-xs text-muted">
              Standardize trackable links for LinkedIn, Reddit, emails, and outreach. Conforms to spec P8-14 convention.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-ink">Target URL</label>
              <input
                type="url"
                value={utmUrl}
                onChange={(e) => setUtmUrl(e.target.value)}
                className={input}
                placeholder="https://everyvisitor.com/..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink">Source (utm_source)</label>
              <select
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                className={input}
              >
                <option value="linkedin">linkedin</option>
                <option value="reddit">reddit</option>
                <option value="facebook">facebook</option>
                <option value="tiktok">tiktok</option>
                <option value="email">email</option>
                <option value="outreach">outreach</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink">Medium (utm_medium)</label>
              <select
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                className={input}
              >
                <option value="social">social</option>
                <option value="community">community</option>
                <option value="outreach">outreach</option>
                <option value="newsletter">newsletter</option>
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-ink">Campaign name (slug)</label>
              <input
                type="text"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                className={input}
                placeholder="e.g. spring-fix-guides"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink">Term (optional)</label>
              <input
                type="text"
                value={utmTerm}
                onChange={(e) => setUtmTerm(e.target.value)}
                className={input}
                placeholder="e.g. contrast-keywords"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink">Content (optional)</label>
              <input
                type="text"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                className={input}
                placeholder="e.g. banner-v1"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center gap-2 rounded-xl border border-line bg-subtle p-2.5">
            <code className="flex-1 break-all font-mono text-xs text-ink">{generatedLink}</code>
            <button
              type="button"
              onClick={copyLink}
              className={`${btn.primary} !py-1.5 !text-xs shrink-0`}
            >
              <Icon d={copied ? I.check : I.copy} size={14} />
              {copied ? "Copied!" : "Copy tagged link"}
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top Pages Table */}
          <section className={card} aria-label="Top Pages">
            <h3 className="m-0 text-base font-semibold text-ink">Top Pages & Guides</h3>
            <p className="mt-1 text-xs text-muted">Pages with the most unique visitors. Includes fix guides and blog posts.</p>

            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-subtle">
                  <tr>
                    <th scope="col" className={th}>Page path</th>
                    <th scope="col" className={th}>Visitors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {(report?.pages ?? []).map((p) => (
                    <tr key={p.path} className="hover:bg-subtle/40">
                      <td className={`${td} font-medium text-ptext`}>{p.path}</td>
                      <td className={`${td} font-mono`}>{p.visitors.toLocaleString()}</td>
                    </tr>
                  ))}
                  {(report?.pages ?? []).length === 0 && (
                    <tr><td className={td} colSpan={2}>No data for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Referrers Table */}
          <section className={card} aria-label="Referrers">
            <h3 className="m-0 text-base font-semibold text-ink">Top Traffic Referrers</h3>
            <p className="mt-1 text-xs text-muted">Top origin domains and social channels.</p>

            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-subtle">
                  <tr>
                    <th scope="col" className={th}>Referrer</th>
                    <th scope="col" className={th}>Visitors</th>
                    <th scope="col" className={th}>Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {(report?.referrers ?? []).map((r) => (
                    <tr key={r.name} className="hover:bg-subtle/40">
                      <td className={`${td} font-semibold text-ink`}>{r.name}</td>
                      <td className={`${td} font-mono`}>{r.visitors.toLocaleString()}</td>
                      <td className={td}>{share(r.visitors)}</td>
                    </tr>
                  ))}
                  {(report?.referrers ?? []).length === 0 && (
                    <tr><td className={td} colSpan={3}>No data for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Device Breakdown */}
          <AccessibleChart
            findingTitle={devices.length ? `${devices[0]!.label} is the most used device (${devices[0]!.value}%)` : "Visitor device breakdown"}
            summaryText="Share of visitors by device type."
            tableHeaders={["Device", "Share %"]}
            tableRows={devices.map((d) => [d.label, `${d.value}%`])}
          >
            <BarChart
              data={devices}
              horizontal
              valueFormatter={(v) => `${v}%`}
              ariaLabel="Device breakdown"
            />
          </AccessibleChart>

          {/* Free Checker Usage Funnel */}
          <AccessibleChart
            findingTitle={checker ? `${checker.checks.toLocaleString()} free checks, ${checker.startedTrial.toLocaleString()} went on to start a trial` : "Free website checker usage"}
            summaryText="Free checks in this period, how many left an email, and how many became a trial."
            tableHeaders={["Funnel Step", "Count"]}
            tableRows={checkerUsage.map((c) => [c.label, c.value])}
          >
            <BarChart
              data={checkerUsage}
              horizontal
              valueFormatter={(v) => v.toLocaleString()}
              ariaLabel="Free checker conversions"
            />
          </AccessibleChart>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[
            { title: "Countries", rows: report?.countries ?? [], label: "Country" },
            { title: "UTM campaigns", rows: report?.campaigns ?? [], label: "Campaign" },
          ].map((t) => (
            <section key={t.title} className={card} aria-label={t.title}>
              <h3 className="m-0 text-base font-semibold text-ink">{t.title}</h3>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-subtle">
                    <tr>
                      <th scope="col" className={th}>{t.label}</th>
                      <th scope="col" className={th}>Visitors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-surface">
                    {t.rows.map((r) => (
                      <tr key={r.name}>
                        <td className={td}>{r.name}</td>
                        <td className={`${td} font-mono`}>{r.visitors.toLocaleString()}</td>
                      </tr>
                    ))}
                    {t.rows.length === 0 && (
                      <tr><td className={td} colSpan={2}>No data for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </StaffShell>
  );
}
