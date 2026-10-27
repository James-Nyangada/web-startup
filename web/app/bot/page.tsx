import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: "EveryVisitorBot Crawler & Scanner",
  description: "Information about EveryVisitorBot, our polite web accessibility audit crawler.",
};

const H2 = "m-0 font-serif text-[32px] leading-[36px] font-normal sm:text-[40px] sm:leading-[44px]";

export default function BotPage() {
  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <div className="mx-auto max-w-[960px] px-4 py-16 sm:px-8">
          <div className="flex flex-col gap-4 border-b border-line pb-8 mb-10">
            <span className="text-xs font-bold tracking-[0.14em] uppercase text-primary">
              Web Crawler Specification
            </span>
            <h1 className="m-0 font-serif text-[42px] leading-[46px] font-normal sm:text-[56px] sm:leading-[60px]">
              About <em>EveryVisitorBot</em>
            </h1>
            <p className="m-0 max-w-[720px] text-lg text-muted">
              EveryVisitorBot is an automated web accessibility scanner operated by EveryVisitor.
              It verifies web pages against WCAG 2.2 Level AA accessibility standards on behalf of verified site owners and their digital agencies.
            </p>
          </div>

          <div className="flex flex-col gap-12 text-sm leading-relaxed text-ink/90">
            {/* User Agent Identification */}
            <section className="flex flex-col gap-4">
              <h2 className={H2}>User Agent Identification</h2>
              <p>
                Every HTTP request initiated by our scanner identifies itself using our standard user-agent string:
              </p>
              <div className="rounded-xl border border-line bg-subtle p-4 font-mono text-xs sm:text-sm text-ptext break-all">
                Mozilla/5.0 (compatible; EveryVisitorBot/1.0; +https://everyvisitor.app/bot)
              </div>
              <p className="text-muted text-xs">
                During headless browser rendering passes (via Chromium), the user agent additionally includes standard headless browser identification while preserving the <code>+https://everyvisitor.app/bot</code> token.
              </p>
            </section>

            {/* Politeness & Crawl Behavior */}
            <section className="flex flex-col gap-4">
              <h2 className={H2}>Politeness &amp; Crawl Frequency</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                  <span className="text-xs font-bold text-muted uppercase">Max Rate</span>
                  <div className="text-2xl font-bold mt-1 text-ink">1 req / sec</div>
                  <p className="text-xs text-muted mt-2">
                    Our scanner enforces a polite default cap of 1 request per second per host.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                  <span className="text-xs font-bold text-muted uppercase">Scope Cap</span>
                  <div className="text-2xl font-bold mt-1 text-ink">150–250 pages</div>
                  <p className="text-xs text-muted mt-2">
                    Scans only audit representative template samples, never recursive infinite crawls.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                  <span className="text-xs font-bold text-muted uppercase">Schedule</span>
                  <div className="text-2xl font-bold mt-1 text-ink">Weekly</div>
                  <p className="text-xs text-muted mt-2">
                    Scans run once per week during customer-configured off-peak hours.
                  </p>
                </div>
              </div>
            </section>

            {/* Respect for robots.txt */}
            <section className="flex flex-col gap-4">
              <h2 className={H2}>robots.txt Compliance</h2>
              <p>
                EveryVisitorBot strictly respects the standard Robots Exclusion Protocol (RFC 9309).
                Before crawling, our engine fetches and parses your <code>/robots.txt</code> file.
                Any path disallowed for <code>EveryVisitorBot</code> or for all robots (<code>*</code>) is immediately excluded from scanning.
              </p>
              <div className="rounded-xl border border-line bg-subtle p-4 font-mono text-xs text-ink">
                # Example: Disallow EveryVisitorBot from crawling admin and checkout paths<br />
                User-agent: EveryVisitorBot<br />
                Disallow: /checkout/<br />
                Disallow: /cart/<br />
                Disallow: /account/
              </div>
            </section>

            {/* Verification Requirement */}
            <section className="flex flex-col gap-4">
              <h2 className={H2}>Mandatory Domain Ownership Verification</h2>
              <p>
                EveryVisitorBot does <strong>not</strong> blindly scan arbitrary web properties on the internet.
                Before any weekly recurring scan or multi-page audit can proceed, the requesting organization must prove ownership through one of three verifiable methods:
              </p>
              <ol className="list-decimal pl-5 flex flex-col gap-2 text-muted">
                <li><strong className="text-ink">DNS TXT Record:</strong> Adding a unique verification token to the domain&apos;s DNS records.</li>
                <li><strong className="text-ink">Root Verification File:</strong> Placing a static <code>/.well-known/everyvisitor-verify.txt</code> file in the website root directory.</li>
                <li><strong className="text-ink">Platform App Install:</strong> Installing our verified Shopify App or WordPress Plugin with OAuth handshake.</li>
              </ol>
            </section>

            {/* Non-Destructive Scanning */}
            <section className="flex flex-col gap-4">
              <h2 className={H2}>Zero Form Submissions &amp; Safe Execution</h2>
              <p>
                EveryVisitorBot performs passive, non-destructive DOM analysis.
                It never submits forms, never adds items to payment gateways, never creates test orders, and never attempts vulnerability penetration testing.
                It purely extracts public HTML, executes client-side axe-core accessibility audits, and calculates contrast ratios.
              </p>
            </section>

            {/* How to Allow or Block */}
            <section className="flex flex-col gap-4 rounded-2xl border border-line bg-subtle p-6">
              <h2 className="text-xl font-bold text-ink">Need to Allowlist or Report an Issue?</h2>
              <p className="text-muted">
                If your Web Application Firewall (Cloudflare, AWS WAF, Fastly) is blocking EveryVisitorBot and preventing scheduled scans, or if you believe EveryVisitorBot is crawling your site in error, please reach out to our network team:
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <a
                  href="mailto:info@everyvisitor.app"
                  className="ease-ui flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
                >
                  Contact info@everyvisitor.app
                </a>
                <Link href="/agencies" className="text-sm font-semibold text-primary hover:underline">
                  Learn more about our agency platform →
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
