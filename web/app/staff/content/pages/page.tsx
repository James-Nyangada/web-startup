"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StaffShell, card, formatDate, td, th } from "@/components/staff/staff-shell";
import { staffApi, type ContentPage } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

interface PageMeta {
  key: string;
  name: string;
  category: "homepage" | "site" | "legal";
  description: string;
}

const PAGES_CATALOG: PageMeta[] = [
  { key: "home.hero", name: "Homepage Hero", category: "homepage", description: "Headline, sub-headline, free-check button label and trust line." },
  { key: "home.facts", name: "Homepage Facts", category: "homepage", description: "Up to 3 business question statements with required source citation." },
  { key: "home.howItWorks", name: "How It Works", category: "homepage", description: "4 sequential steps with screenshots and required alt text." },
  { key: "home.agency", name: "Agency Section", category: "homepage", description: "Agency-focused headline, 3 value bullets, and feature image." },
  { key: "home.overlayComparison", name: "Overlay Comparison Table", category: "homepage", description: "Feature comparison rows vs accessibility overlay widgets." },
  { key: "home.faq", name: "Frequently Asked Questions", category: "site", description: "Managed FAQ list shared across homepage and pricing pages." },
  { key: "pricing.copy", name: "Pricing Page Copy", category: "site", description: "Plan descriptions & popular badge (pricing numbers read from plans.ts)." },
  { key: "footer", name: "Site Footer", category: "site", description: "Footer tagline and structured navigation link groups." },
  { key: "legal.terms", name: "Terms of Service", category: "legal", description: "Platform terms of service agreement (Owner only)." },
  { key: "legal.privacy", name: "Privacy Policy", category: "legal", description: "Cookie-less privacy policy & data practices (Owner only)." },
  { key: "legal.refunds", name: "Refund Policy", category: "legal", description: "Subscription cancellation and refund policy (Owner only)." },
  { key: "legal.dpa", name: "Data Processing Agreement (DPA)", category: "legal", description: "GDPR/UK DPA terms for European customers (Owner only)." },
  { key: "legal.subprocessors", name: "Subprocessors", category: "legal", description: "List of third-party infrastructure and providers (Owner only)." },
  { key: "legal.bot", name: "Scanner Bot & Crawler Info", category: "legal", description: "EveryVisitor scanner IP addresses and user-agent policy." },
  { key: "legal.accessibility", name: "Accessibility Statement", category: "legal", description: "Our commitment and VPAT/WCAG conformance statement." },
];

export default function StaffContentPagesList() {
  const [pages, setPages] = useState<Record<string, ContentPage>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const list = await staffApi.listPages();
      const map: Record<string, ContentPage> = {};
      for (const p of list) {
        map[p.pageKey] = p;
      }
      setPages(map);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = [
    { id: "homepage", label: "Homepage Sections" },
    { id: "site", label: "General Site Copy" },
    { id: "legal", label: "Legal Pages (Owner Only)" },
  ];

  return (
    <StaffShell title="Site Pages">
      <div className="mb-6">
        <p className="m-0 text-sm text-muted">
          Structured site copy and legal agreements. Content is stored as typed JSON schema blocks,
          ensuring layout, accessibility tokens, and pricing consistency cannot break when updated.
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((cat) => {
          const catPages = PAGES_CATALOG.filter((p) => p.category === cat.id);
          return (
            <div key={cat.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="border-b border-line bg-subtle px-5 py-3">
                <h2 className="m-0 text-sm font-bold text-ink">{cat.label}</h2>
              </div>
              <table className="w-full border-collapse">
                <caption className="sr-only">{cat.label}</caption>
                <thead className="border-b border-line bg-subtle/50">
                  <tr>
                    <th scope="col" className={th}>Section / Page</th>
                    <th scope="col" className={th}>Key</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={th}>Last Updated</th>
                    <th scope="col" className={`${th} text-right`}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {catPages.map((item) => {
                    const pageData = pages[item.key];
                    const status = pageData?.status ?? "draft";
                    return (
                      <tr key={item.key} className="hover:bg-subtle/40">
                        <td className={td}>
                          <Link
                            href={`/staff/content/pages/${encodeURIComponent(item.key)}`}
                            className="font-semibold text-ink hover:text-ptext"
                          >
                            {item.name}
                          </Link>
                          <div className="text-xs text-muted mt-0.5">{item.description}</div>
                        </td>
                        <td className={`${td} font-mono text-xs text-muted whitespace-nowrap`}>
                          {item.key}
                        </td>
                        <td className={td}>
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              status === "published"
                                ? "bg-ok-soft text-ok border border-ok/20"
                                : "bg-subtle text-muted border border-line"
                            }`}
                          >
                            {status === "published" ? "Published" : "Draft"}
                          </span>
                        </td>
                        <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                          {pageData ? formatDate(pageData.updatedAt, true) : "Not yet initialized"}
                        </td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          <Link
                            href={`/staff/content/pages/${encodeURIComponent(item.key)}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink hover:bg-subtle"
                          >
                            <Icon d={I.pencil} size={13} />
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </StaffShell>
  );
}
