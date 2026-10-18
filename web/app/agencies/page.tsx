"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Collapse } from "@/components/disclosure";
import { Icon } from "@/components/icons";

const H2 = "m-0 font-serif text-[38px] leading-[42px] font-normal sm:text-[48px] sm:leading-[52px]";

const AGENCY_FAQS = [
  {
    q: "Can our clients see our other clients' sites or data?",
    a: "Never. Multitenant isolation is enforced at the database and API levels with strict tenant scoping. When you invite a client viewer, they only see the specific site or sites you explicitly assign, with zero access to your other clients, org settings, or billing details.",
  },
  {
    q: "Can we add our own agency logo and brand colors to reports?",
    a: "Yes. In your Organization Settings, you can upload your agency logo, specify your primary brand color, and configure custom report headers. All generated PDFs and client-facing summaries will be fully white-labeled.",
  },
  {
    q: "What is the difference between a team member and a client viewer?",
    a: "Team members are your internal agency staff (designers, developers, project managers) who have full or admin access to all client sites. Client viewers are external contacts with read-only access to their specific client portal view.",
  },
  {
    q: "Does Plainsight replace our manual audit services?",
    a: "No, and we are completely transparent about that. Automated scans catch 30% to 50% of WCAG violations (contrast, missing labels, missing alt text, duplicate IDs). Plainsight handles continuous weekly regression monitoring, freeing your agency to sell high-value manual assistive tech audits on top.",
  },
  {
    q: "How does Plainsight detect theme-wide issues across multiple sites?",
    a: "Our Cross-Site View aggregates rule failures across all client stores. If 8 of your Shopify clients share the same Dawn theme variant with an unlabeled mobile menu button, you can fix it once in your theme repository and verify the fix across all 8 stores simultaneously.",
  },
];

export default function AgenciesPage() {
  const [clientCount, setClientCount] = useState(15);
  const [pricePerClient, setPricePerClient] = useState(249);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const agencySoftwareCost = clientCount <= 25 ? 149 : 299;
  const monthlyRevenue = clientCount * pricePerClient;
  const netMonthlyProfit = monthlyRevenue - agencySoftwareCost;
  const annualProfit = netMonthlyProfit * 12;

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        {/* Hero Section */}
        <section aria-labelledby="agency-hero-h" className="mx-auto max-w-[1280px] px-4 pt-16 pb-20 sm:px-8">
          <div className="flex flex-col gap-6 max-w-[880px]">
            <span className="text-xs font-bold tracking-[0.14em] uppercase text-primary">
              Built for Agencies & Freelancers
            </span>
            <h1
              id="agency-hero-h"
              className="m-0 font-serif text-[48px] leading-[52px] font-normal sm:text-[68px] sm:leading-[72px] text-pretty"
            >
              Turn accessibility into a <em>monthly care plan</em> your clients value.
            </h1>
            <p className="m-0 max-w-[700px] text-lg leading-7 sm:text-xl sm:leading-8 text-muted">
              Stop running one-off manual audits that go stale. Monitor all your client Shopify and WordPress
              stores from one screen, deliver branded white-label monthly reports, and create high-margin recurring revenue.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up?plan=agency"
                className="ease-ui flex h-12 items-center rounded-full bg-primary px-6 text-base font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary"
              >
                Start 14-day agency trial
              </Link>
              <a
                href="#calculator"
                className="ease-ui flex h-12 items-center rounded-full border border-line bg-surface px-6 text-base font-semibold text-ink no-underline hover:border-primary hover:text-primary"
              >
                Calculate your care plan revenue ↓
              </a>
            </div>
            <span className="text-xs text-muted">
              ✓ 14-day trial on Agency tier · No credit card required · Up to 25 client sites
            </span>
          </div>
        </section>

        {/* 4 Pillars Section */}
        <section aria-labelledby="pillars-h" className="border-y border-line bg-subtle py-20">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <div className="max-w-[720px] mb-12">
              <h2 id="pillars-h" className={H2}>
                Everything your agency needs to deliver <em>ongoing compliance</em>
              </h2>
              <p className="mt-3 text-lg text-muted">
                Designed specifically for digital studios, web agencies, and e-commerce consultants managing multiple client properties.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name="layout" size={20} />
                </div>
                <h3 className="m-0 text-lg font-semibold">Worst-First Portfolio View</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">
                  See every client site on a single screen ranked by WCAG score, open critical bugs, and regressions. Instantly spot which client needs attention before they email you.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name="fileText" size={20} />
                </div>
                <h3 className="m-0 text-lg font-semibold">White-Label Client Reports</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">
                  Send automated monthly PDF reports (R-04/R-05) complete with your agency logo, brand colors, executive summaries, and dated proof of continuous improvement.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name="shield" size={20} />
                </div>
                <h3 className="m-0 text-lg font-semibold">Calm Client Portal</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">
                  Give clients their own read-only portal view with simple dials and plain-English summaries. No cryptic axe rule IDs, git diffs, or engineering jargon.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name="refresh" size={20} />
                </div>
                <h3 className="m-0 text-lg font-semibold">Cross-Theme Bug Fixing</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">
                  Discover shared code issues across 10+ client stores built on the same theme framework. Patch the theme once in your codebase, recheck, and verify all sites in one go.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Calculator Section */}
        <section id="calculator" aria-labelledby="calc-h" className="py-20">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-12 items-center">
              <div className="lg:col-span-6 flex flex-col gap-6">
                <span className="text-xs font-bold tracking-wider uppercase text-primary">
                  Care Plan Economics
                </span>
                <h2 id="calc-h" className={H2}>
                  Calculate your agency’s <em>care plan profit</em>
                </h2>
                <p className="m-0 text-base text-muted">
                  Most e-commerce agencies charge clients between $150 and $400 per month for accessibility monitoring, monthly report delivery, and small theme tweaks.
                </p>

                <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="client-count" className="text-sm font-semibold">
                        Number of client stores:
                      </label>
                      <span className="text-lg font-bold text-primary tnum">{clientCount} sites</span>
                    </div>
                    <input
                      id="client-count"
                      type="range"
                      min={1}
                      max={75}
                      step={1}
                      value={clientCount}
                      onChange={(e) => setClientCount(Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted mt-1">
                      <span>1 site</span>
                      <span>25 (Agency)</span>
                      <span>75 (Agency Pro)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="price-per-client" className="text-sm font-semibold">
                        Monthly fee you charge each client:
                      </label>
                      <span className="text-lg font-bold text-primary tnum">${pricePerClient} / mo</span>
                    </div>
                    <input
                      id="price-per-client"
                      type="range"
                      min={99}
                      max={599}
                      step={25}
                      value={pricePerClient}
                      onChange={(e) => setPricePerClient(Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted mt-1">
                      <span>$99 (Light)</span>
                      <span>$249 (Standard)</span>
                      <span>$599 (Full)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="flex flex-col gap-6 rounded-2xl border-2 border-primary/30 bg-surface p-8 shadow-card">
                  <span className="text-xs font-bold tracking-wider uppercase text-primary">
                    Projected Care Plan Return
                  </span>

                  <div className="grid grid-cols-2 gap-4 pb-6 border-b border-line">
                    <div>
                      <span className="text-xs text-muted">Monthly Gross Revenue</span>
                      <div className="text-3xl font-extrabold text-ink tnum">
                        ${monthlyRevenue.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted">Plainsight Software Fee</span>
                      <div className="text-3xl font-extrabold text-muted tnum">
                        ${agencySoftwareCost}
                        <span className="text-xs font-normal"> / mo</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-muted">Net Monthly Agency Profit:</span>
                    <div className="text-4xl sm:text-5xl font-extrabold text-primary tnum">
                      ${netMonthlyProfit.toLocaleString()}
                      <span className="text-base font-normal text-muted"> / month</span>
                    </div>
                    <span className="text-sm font-medium text-ok">
                      ${annualProfit.toLocaleString()} annual net recurring profit margin (~{Math.round((netMonthlyProfit / (monthlyRevenue || 1)) * 100)}%)
                    </span>
                  </div>

                  <div className="rounded-xl bg-subtle p-4 text-xs text-muted leading-relaxed">
                    💡 <strong>Agency tip:</strong> Bundle Plainsight weekly monitoring into your standard maintenance retainer. Clients appreciate automated compliance defense, and you gain reliable recurring cash flow without extra manual hours.
                  </div>

                  <Link
                    href={`/sign-up?plan=${clientCount <= 25 ? "agency" : "agency_pro"}`}
                    className="ease-ui flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary"
                  >
                    Start your care plan with {clientCount} sites →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agency Care Plan Models */}
        <section aria-labelledby="packages-h" className="border-t border-line bg-subtle py-20">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <div className="max-w-[700px] mb-12">
              <h2 id="packages-h" className={H2}>
                Three proven <em>care plan packages</em>
              </h2>
              <p className="mt-3 text-lg text-muted">
                Here is how top Shopify and WordPress digital agencies package and price Plainsight for their client base.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="flex flex-col gap-4">
                  <span className="text-xs font-bold tracking-wider uppercase text-muted">Package 1</span>
                  <h3 className="m-0 text-xl font-bold">Continuous Defense</h3>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-3xl font-extrabold tnum">$149–$199</strong>
                    <span className="text-sm text-muted">/ month</span>
                  </div>
                  <p className="m-0 text-sm text-muted">
                    Ideal for small stores wanting ongoing compliance protection without retainers.
                  </p>
                  <ul className="m-0 flex flex-col gap-2 p-0 text-sm list-none border-t border-line pt-4">
                    <li className="flex items-center gap-2">✓ Weekly automated scan (150 pages)</li>
                    <li className="flex items-center gap-2">✓ Instant email regression alerts</li>
                    <li className="flex items-center gap-2">✓ Branded monthly executive PDF</li>
                    <li className="flex items-center gap-2">✓ Read-only client portal view</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border-2 border-primary bg-surface p-6 shadow-card relative">
                <div className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-on-primary">
                  Most Popular
                </div>
                <div className="flex flex-col gap-4">
                  <span className="text-xs font-bold tracking-wider uppercase text-primary">Package 2</span>
                  <h3 className="m-0 text-xl font-bold">Active Remediation</h3>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-3xl font-extrabold tnum">$349–$499</strong>
                    <span className="text-sm text-muted">/ month</span>
                  </div>
                  <p className="m-0 text-sm text-muted">
                    For growing direct-to-consumer brands that frequently add new products and campaign pages.
                  </p>
                  <ul className="m-0 flex flex-col gap-2 p-0 text-sm list-none border-t border-line pt-4">
                    <li className="flex items-center gap-2">✓ Everything in Continuous Defense</li>
                    <li className="flex items-center gap-2">✓ 2 hours developer theme fixes / mo</li>
                    <li className="flex items-center gap-2">✓ High-priority issue resolution SLA</li>
                    <li className="flex items-center gap-2">✓ Content team alt-text review</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="flex flex-col gap-4">
                  <span className="text-xs font-bold tracking-wider uppercase text-muted">Package 3</span>
                  <h3 className="m-0 text-xl font-bold">Compliance Partner</h3>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-3xl font-extrabold tnum">$799–$1,200</strong>
                    <span className="text-sm text-muted">/ month</span>
                  </div>
                  <p className="m-0 text-sm text-muted">
                    For enterprise brands requiring formal legal evidence and manual screen reader audits.
                  </p>
                  <ul className="m-0 flex flex-col gap-2 p-0 text-sm list-none border-t border-line pt-4">
                    <li className="flex items-center gap-2">✓ Everything in Active Remediation</li>
                    <li className="flex items-center gap-2">✓ Quarterly manual assistive tech audit</li>
                    <li className="flex items-center gap-2">✓ Dated legal evidence pack generation</li>
                    <li className="flex items-center gap-2">✓ Custom domain portal (yourbrand.com)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agency FAQ Section */}
        <section aria-labelledby="agency-faq-h" className="py-20">
          <div className="mx-auto max-w-[800px] px-4 sm:px-8">
            <h2 id="agency-faq-h" className={H2}>
              Frequently asked <em>agency questions</em>
            </h2>
            <div className="mt-8 flex flex-col border-t border-line">
              {AGENCY_FAQS.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={faq.q} className="border-b border-line">
                    <h3 className="m-0">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : index)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-semibold text-ink"
                      >
                        <span>{faq.q}</span>
                        <span aria-hidden="true" className="text-xl text-muted font-mono">
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>
                    </h3>
                    <Collapse open={isOpen}>
                      <p className="mt-0 mb-5 text-base leading-relaxed text-muted">
                        {faq.a}
                      </p>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Agency Final CTA */}
        <section className="border-t border-line bg-page py-20 text-center">
          <div className="mx-auto max-w-[700px] px-4 flex flex-col items-center gap-6">
            <h2 className={H2}>
              Ready to launch your agency’s <em>accessibility care plan?</em>
            </h2>
            <p className="m-0 text-lg text-muted">
              Start your 14-day free trial on the Agency tier. Onboard your first client site in under 3 minutes.
            </p>
            <Link
              href="/sign-up?plan=agency"
              className="ease-ui flex h-12 items-center rounded-full bg-primary px-8 text-base font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary"
            >
              Start 14-day agency trial →
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
