import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { CHANGELOG_ENTRIES } from "@/lib/blog-data";

export const metadata: Metadata = {
  title: "Product Changelog",
  description: "Recent product updates, improvements, and releases for Plainsight.",
};

const H2 = "m-0 font-serif text-[42px] leading-[46px] font-normal sm:text-[56px] sm:leading-[60px]";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <div className="mx-auto max-w-[960px] px-4 py-16 sm:px-8">
          <div className="flex flex-col gap-4 border-b border-line pb-8 mb-12">
            <span className="text-xs font-bold tracking-[0.14em] uppercase text-primary">
              What&apos;s New
            </span>
            <h1 className={H2}>
              Product <em>changelog</em>
            </h1>
            <p className="m-0 max-w-[640px] text-lg text-muted">
              Continuous improvements, accessibility rule additions, and platform releases shipped to Plainsight.
            </p>
          </div>

          <div className="flex flex-col gap-12 relative before:absolute before:top-2 before:bottom-2 before:left-[17px] sm:before:left-[147px] before:w-[2px] before:bg-line">
            {CHANGELOG_ENTRIES.map((entry) => (
              <div key={entry.version} className="relative flex flex-col sm:flex-row gap-6 sm:gap-10 items-start">
                {/* Date column (Desktop) */}
                <div className="hidden sm:flex flex-col items-end w-[120px] pt-1 text-right shrink-0">
                  <span className="text-xs font-mono font-semibold text-muted">{entry.date}</span>
                  <span className="text-sm font-bold text-ink mt-0.5">{entry.version}</span>
                </div>

                {/* Timeline node */}
                <div className="absolute left-2 sm:left-[140px] top-1.5 size-4 rounded-full border-2 border-primary bg-page z-10 shrink-0" />

                {/* Entry content card */}
                <div className="ml-8 sm:ml-0 flex-1 rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-card">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="sm:hidden text-xs font-mono font-semibold text-muted">{entry.date} · {entry.version}</span>
                    <span
                      className={`rounded px-2.5 py-0.5 text-xs font-semibold ${
                        entry.badge === "Major"
                          ? "bg-primary text-on-primary"
                          : entry.badge === "Security"
                          ? "bg-critS text-crit"
                          : "bg-subtle text-ptext"
                      }`}
                    >
                      {entry.badge}
                    </span>
                  </div>

                  <h2 className="m-0 text-xl font-bold text-ink mb-3">{entry.title}</h2>
                  <p className="m-0 text-sm leading-relaxed text-muted mb-4">{entry.summary}</p>

                  <div className="rounded-xl border border-line bg-subtle p-4">
                    <span className="text-xs font-bold tracking-wider uppercase text-muted block mb-2">
                      Key Highlights:
                    </span>
                    <ul className="m-0 flex flex-col gap-2 pl-4 text-xs sm:text-sm text-ink/90">
                      {entry.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center text-xs text-muted">
            Looking for earlier releases? Follow our git history on our open-source repositories or reach out to support.
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
