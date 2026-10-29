"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Icon, I } from "@/components/icons";
import type { FixGuideItem } from "@/lib/fix-guides-data";

export function FixGuidesIndex({ allGuides }: { allGuides: FixGuideItem[] }) {

  const [platformFilter, setPlatformFilter] = useState<"all" | "shopify" | "wordpress">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGuides = useMemo(() => {
    return allGuides.filter((guide) => {
      if (platformFilter !== "all" && guide.platform !== platformFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          guide.title.toLowerCase().includes(q) ||
          guide.summary.toLowerCase().includes(q) ||
          guide.ruleId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allGuides, platformFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 py-12 sm:px-8 sm:py-16">
          {/* Header */}
          <div className="flex max-w-[800px] flex-col gap-4">
            <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
              Ecommerce Accessibility Fix Guides
            </span>
            <h1 className="m-0 font-serif text-[42px] leading-[46px] font-normal tracking-[-0.01em] sm:text-[54px] sm:leading-[58px]">
              Step-by-step fix guides for <em>Shopify</em> &amp; <em>WordPress</em>
            </h1>
            <p className="m-0 text-lg leading-7 text-pretty text-muted">
              Clear code changes and checking instructions for the top 25 accessibility rules. Written
              for store developers and agencies, with zero jargon.
            </p>
          </div>

          {/* Controls: Platform Tabs + Search Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-6">
            <div
              role="tablist"
              aria-label="Filter guides by platform"
              className="inline-flex overflow-hidden rounded-full border border-line-strong self-start"
            >
              {(
                [
                  ["all", `All (${allGuides.length})`],
                  ["shopify", `Shopify (${allGuides.filter((g) => g.platform === "shopify").length})`],
                  ["wordpress", `WordPress (${allGuides.filter((g) => g.platform === "wordpress").length})`],
                ] as const
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={platformFilter === p}
                  onClick={() => setPlatformFilter(p)}
                  className={`ease-ui h-9 px-4 text-sm font-semibold transition-colors ${
                    platformFilter === p
                      ? "bg-primary text-on-primary"
                      : "bg-surface text-ink hover:bg-subtle"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Live Search */}
            <div className="relative w-full sm:w-[320px]">
              <label htmlFor="search-guides" className="sr-only">
                Search fix guides
              </label>
              <input
                id="search-guides"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by rule, title, or keyword..."
                className="h-10 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                <Icon d={I.search} size={16} />
              </span>
            </div>
          </div>

          {/* Guides Grid */}
          {filteredGuides.length === 0 ? (
            <div className="rounded-2xl border border-line bg-subtle p-12 text-center">
              <p className="m-0 text-base font-semibold text-ink">No fix guides match your query.</p>
              <p className="mt-1 mb-0 text-sm text-muted">
                Try searching for a different keyword or switch the platform filter to All.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setPlatformFilter("all");
                }}
                className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGuides.map((guide: FixGuideItem) => (
                <Link
                  key={guide.slug}
                  href={`/fix/${guide.platform}/${guide.slug}`}
                  className="ease-ui group flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-card hover:-translate-y-1 hover:border-primary/50 no-underline"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          guide.platform === "shopify"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        }`}
                      >
                        {guide.platform}
                      </span>
                      <span className="font-mono text-xs text-muted">{guide.ruleId}</span>
                    </div>

                    <h2 className="m-0 text-xl font-semibold leading-7 text-ink group-hover:text-primary transition-colors">
                      {guide.title}
                    </h2>

                    <p className="m-0 line-clamp-3 text-sm leading-6 text-muted">
                      {guide.summary}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-primary group-hover:text-primary-hover pt-4 border-t border-line">
                    <span>Read fix guide</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Audit CTA banner */}
          <section className="mt-8 flex flex-col items-center justify-between gap-6 rounded-2xl bg-ink p-8 text-surface shadow-card sm:flex-row sm:p-10">
            <div className="flex max-w-[640px] flex-col gap-2">
              <h2 className="m-0 font-serif text-2xl font-normal leading-8 text-surface sm:text-3xl">
                Check your store for these 25 accessibility issues
              </h2>
              <p className="m-0 text-base leading-6 text-surface/80">
                Run a free, instant 30-second audit on any page. No installation or account required.
              </p>
            </div>
            <Link
              href="/check"
              className="ease-ui inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-7 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
            >
              Run free check
            </Link>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
