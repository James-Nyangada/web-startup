import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

const LEGAL_NAV = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/dpa", label: "Data Processing Agreement (DPA)" },
  { href: "/legal/subprocessors", label: "Subprocessors Registry" },
  { href: "/bot", label: "EveryVisitorBot Crawler" },
  { href: "/accessibility-notes", label: "Accessibility Statement" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-12 items-start">
            {/* Sidebar navigation */}
            <aside aria-label="Legal documents navigation" className="order-last lg:order-none lg:col-span-3 lg:sticky lg:top-24">
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
                <span className="text-xs font-bold tracking-wider uppercase text-muted">
                  Legal & Trust
                </span>
                <nav className="mt-4 flex flex-col gap-2">
                  {LEGAL_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-ink no-underline hover:bg-subtle hover:text-primary transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
                  Questions? Contact our legal team at{" "}
                  <a href="mailto:info@everyvisitor.app" className="text-primary hover:underline">
                    info@everyvisitor.app
                  </a>
                </div>
              </div>
            </aside>

            {/* Document body */}
            <article className="min-w-0 lg:col-span-9 max-w-[800px] rounded-2xl border border-line bg-surface p-8 sm:p-12 shadow-card">
              {children}
            </article>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
