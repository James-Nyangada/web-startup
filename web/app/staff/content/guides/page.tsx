"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { StaffShell, btn, input, card, th, td } from "@/components/staff/staff-shell";
import { staffApi, type ContentPost } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

export default function FixGuidesListPage() {
  const [guides, setGuides] = useState<ContentPost[]>([]);
  const [coverage, setCoverage] = useState<Awaited<ReturnType<typeof staffApi.coverage>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<"list" | "coverage">("list");
  const [q, setQ] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [guidesRes, covRes] = await Promise.all([
        staffApi.listPosts({ type: "guide", q: q || undefined }),
        staffApi.coverage(),
      ]);
      setGuides(guidesRes.data || []);
      setCoverage(covRes);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [q]);

  const PLATFORMS = ["shopify", "wordpress", "custom"] as const;
  const PLATFORM_NAME: Record<string, string> = { shopify: "Shopify", wordpress: "WordPress", custom: "Custom code", generic: "Custom code" };

  return (
    <StaffShell
      title="Fix Guides (S-95 / S-96)"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/staff/content/guides/new" className={btn.primary}>
            <Icon d={I.plus} size={15} />
            Create fix guide
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* View toggle */}
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewTab("list")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewTab === "list" ? "bg-primary text-on-primary" : "text-muted hover:text-ink"
              }`}
            >
              All Guides ({guides.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab("coverage")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewTab === "coverage" ? "bg-primary text-on-primary" : "text-muted hover:text-ink"
              }`}
            >
              Top 50 Rules Coverage Matrix
            </button>
          </div>

          <div className="text-xs text-muted">
            Published guides update the in-app fix drawer instantly without deploying.
          </div>
        </div>

        {viewTab === "list" && (
          <div className="flex flex-col gap-4">
            <div className={`${card} p-3`}>
              <input
                type="search"
                placeholder="Search fix guides by rule ID or title…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={`${input} max-w-sm`}
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
              <table className="w-full text-left text-sm">
                <thead className="bg-subtle">
                  <tr>
                    <th scope="col" className={th}>Rule ID & Title</th>
                    <th scope="col" className={th}>Platform</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={th}>Review status</th>
                    <th scope="col" className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {guides.map((g) => {
                    const isReviewed = Boolean(g.reviewedAt);
                    return (
                      <tr key={g.id} className="hover:bg-subtle/40">
                        <td className={td}>
                          <Link
                            href={`/staff/content/guides/${g.id}`}
                            className="font-semibold text-ink hover:text-primary hover:underline block"
                          >
                            {g.title}
                          </Link>
                          <span className="block text-xs font-mono text-muted">
                            Rule: {g.ruleId || "none"} · /fix/{g.platform === "custom" || g.platform === "generic" ? "custom-code" : g.platform}/{g.slug}
                          </span>
                        </td>
                        <td className={td}>{PLATFORM_NAME[g.platform ?? ""] ?? g.platform ?? "Custom code"}</td>
                        <td className={td}>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              g.status === "published"
                                ? "bg-ok-soft text-ok border border-ok/20"
                                : "bg-primary-soft text-primary"
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                        <td className={td}>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isReviewed
                                ? "bg-ok-soft text-ok border border-ok/20"
                                : "bg-warn-soft text-warn border border-warn/20"
                            }`}
                          >
                            {isReviewed ? "Reviewed" : "Not yet reviewed"}
                          </span>
                        </td>
                        <td className={`${td} text-right`}>
                          <Link
                            href={`/staff/content/guides/${g.id}`}
                            className={`${btn.secondary} !py-1 !text-xs`}
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {guides.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm text-muted">
                        No guides found. Click "Create fix guide" to write one!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewTab === "coverage" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-line bg-subtle p-4 text-xs text-ink">
              <strong>Coverage Matrix:</strong> The most common scan rules across customer websites, with a guide column per
              platform: Shopify, WordPress and Custom code.
              Missing guides are highlighted in amber so writers know exactly what to produce next.
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-subtle">
                  <tr>
                    <th scope="col" className={th}>Rule ID & Description</th>
                    <th scope="col" className={`${th} text-right`}>Occurrences</th>
                    {PLATFORMS.map((p) => (
                      <th key={p} scope="col" className={`${th} text-center`}>
                        {PLATFORM_NAME[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(coverage || []).map((r) => (
                    <tr key={r.ruleId} className="hover:bg-subtle/30">
                      <td className={td}>
                        <div className="font-semibold text-ink">{r.ruleId}</div>
                        <div className="text-muted text-[11px] truncate max-w-sm">{r.title}</div>
                      </td>
                      <td className={`${td} text-right font-mono font-semibold`}>
                        {r.occurrences.toLocaleString()}
                      </td>
                      {PLATFORMS.map((p) => {
                        const guide = r.platforms?.[p];
                        return (
                          <td key={p} className={`${td} text-center`}>
                            {guide ? (
                              <span
                                className={`inline-block rounded-md font-semibold px-2 py-0.5 text-[11px] border ${
                                  guide.status === "published"
                                    ? "bg-ok-soft text-ok border-ok/20"
                                    : "bg-subtle text-muted border-line"
                                }`}
                              >
                                {guide.status === "published" ? "✓ Published" : guide.status}
                              </span>
                            ) : (
                              <Link
                                href={`/staff/content/guides/new?ruleId=${r.ruleId}&platform=${p}`}
                                className="inline-block rounded-md bg-warn-soft text-warn font-semibold px-2 py-0.5 text-[11px] border border-warn/20 hover:bg-warn hover:text-on-primary transition-colors"
                              >
                                + Write
                              </Link>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </StaffShell>
  );
}
