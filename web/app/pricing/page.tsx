"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Collapse } from "@/components/disclosure";
import { COMPARISON_CATEGORIES, PRICING_FAQS } from "@/lib/pricing-data";
import { appApi, planFrequencyLabel } from "@/lib/app-api";
import { openPaddleCheckout } from "@/lib/paddle";
import { apiClient } from "@/lib/api";

const H2 = "m-0 font-serif text-[38px] leading-[42px] font-normal sm:text-[48px] sm:leading-[52px]";

interface PlanItem {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  currency: string;
  tag?: string;
  who: string;
  maxSites: number;
  maxPagesPerScan: number;
  scheduledFrequency: string;
}

const DEFAULT_PLANS: PlanItem[] = [
  {
    id: "store",
    name: "Store",
    priceMonthly: 29,
    priceAnnual: 290,
    currency: "USD",
    who: "One store owner, 1 site",
    maxSites: 1,
    maxPagesPerScan: 250,
    scheduledFrequency: "Weekly",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 79,
    priceAnnual: 790,
    currency: "USD",
    tag: "Popular for brands",
    who: "Growing brands, 3 sites",
    maxSites: 3,
    maxPagesPerScan: 500,
    scheduledFrequency: "Daily",
  },
  {
    id: "agency",
    name: "Agency",
    priceMonthly: 199,
    priceAnnual: 1990,
    currency: "USD",
    tag: "Most popular for agencies",
    who: "Up to 25 client sites",
    maxSites: 25,
    maxPagesPerScan: 250,
    scheduledFrequency: "Weekly (5 daily)",
  },
  {
    id: "agency_pro",
    name: "Agency Pro",
    priceMonthly: 399,
    priceAnnual: 3990,
    currency: "USD",
    who: "Up to 75 sites, custom domain & API",
    maxSites: 75,
    maxPagesPerScan: 500,
    scheduledFrequency: "Daily",
  },
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [plans, setPlans] = useState<PlanItem[]>(DEFAULT_PLANS);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [userOrg, setUserOrg] = useState<{ id: string; slug: string } | null>(null);

  useEffect(() => {
    // Attempt to fetch fresh plan table from API
    appApi
      .getPublicPlans()
      .then((apiPlans) => {
        if (apiPlans.length) {
          setPlans(apiPlans.map((p) => ({ ...p, scheduledFrequency: planFrequencyLabel(p) })));
        }
      })
      .catch(() => {
        // Fallback to static defaults
      });

    // Detect if user is signed in to open Paddle checkout directly
    apiClient<{ user: any; orgs: Array<{ id: string; slug: string }> }>("/v1/me")
      .then((data) => {
        if (data?.orgs?.length && data.orgs[0]?.slug) {
          setUserOrg(data.orgs[0]);
        }
      })
      .catch(() => {});
  }, []);

  const handlePricingCheckout = async (planId: string) => {
    if (!userOrg) return;
    try {
      const checkoutSettings = await appApi.createCheckoutSession(userOrg.slug, {
        plan: planId,
        interval: billingCycle === "annual" ? "year" : "month",
      });
      await openPaddleCheckout({
        priceId: checkoutSettings.priceId,
        customerEmail: checkoutSettings.customerEmail,
        customData: checkoutSettings.customData,
        paddleEnvironment: checkoutSettings.paddleEnvironment,
        clientToken: checkoutSettings.clientToken,
        onSuccess: () => {
          window.location.href = "/settings/billing";
        },
      });
    } catch (err: any) {
      console.error("Pricing checkout failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        {/* Header & Billing Cycle Toggle */}
        <section aria-labelledby="pricing-hero-h" className="mx-auto max-w-[1280px] px-4 pt-16 pb-12 sm:px-8 text-center">
          <div className="mx-auto max-w-[760px] flex flex-col items-center gap-4">
            <span className="text-xs font-bold tracking-[0.14em] uppercase text-primary">
              Simple, Transparent Pricing
            </span>
            <h1 id="pricing-hero-h" className="m-0 font-serif text-[44px] leading-[48px] font-normal sm:text-[60px] sm:leading-[64px]">
              Predictable plans for <em>stores and agencies</em>
            </h1>
            <p className="m-0 text-lg text-muted max-w-[600px]">
              Every plan includes weekly WCAG 2.2 Level AA scanning, template grouping, and plain-English fix guides. Start with a 14-day free trial.
            </p>

            {/* Billing cycle radio toggle */}
            <div className="mt-6 inline-flex items-center rounded-full border border-line bg-surface p-1.5 shadow-sm">
              <button
                type="button"
                role="radio"
                aria-checked={billingCycle === "monthly"}
                onClick={() => setBillingCycle("monthly")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                  billingCycle === "monthly"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                Monthly billing
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={billingCycle === "annual"}
                onClick={() => setBillingCycle("annual")}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                  billingCycle === "annual"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                <span>Annual billing</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    billingCycle === "annual"
                      ? "bg-on-primary text-primary"
                      : "bg-okS text-ok"
                  }`}
                >
                  Save 2 months
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Pricing Cards Grid */}
        <section aria-label="Available subscription tiers" className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
            {plans.map((p) => {
              const price = billingCycle === "annual" ? Math.round(p.priceAnnual / 12) : p.priceMonthly;
              const isAgency = p.id === "agency";

              return (
                <div
                  key={p.id}
                  className={`flex flex-col justify-between rounded-2xl bg-surface p-6 sm:p-7 shadow-card transition-all hover:-translate-y-1 ${
                    isAgency
                      ? "border-2 border-primary relative ring-4 ring-primary/10"
                      : "border border-line"
                  }`}
                >
                  <div>
                    {/* Header badge */}
                    <div className="min-h-6 flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">
                        {p.who}
                      </span>
                      {p.tag && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {p.tag}
                        </span>
                      )}
                    </div>

                    <h2 className="m-0 text-2xl font-bold text-ink">{p.name}</h2>

                    {/* Price display */}
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="text-4xl sm:text-5xl font-extrabold text-ink tnum">
                        ${price}
                      </span>
                      <span className="text-sm text-muted">/ month</span>
                    </div>

                    <div className="text-xs text-muted mt-1 min-h-4">
                      {billingCycle === "annual" ? (
                        <span>${p.priceAnnual} billed annually</span>
                      ) : (
                        <span>Billed monthly</span>
                      )}
                    </div>

                    {/* Key limits breakdown */}
                    <ul className="mt-6 flex flex-col gap-3 border-t border-line pt-6 text-sm list-none p-0">
                      <li className="flex items-center gap-2">
                        <span className="text-ok font-bold">✓</span>
                        <span><strong>{p.maxSites}</strong> {p.maxSites === 1 ? "monitored site" : "monitored sites"}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-ok font-bold">✓</span>
                        <span><strong>{p.maxPagesPerScan}</strong> pages / scan / site</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-ok font-bold">✓</span>
                        <span><strong>{p.scheduledFrequency}</strong> automated scans</span>
                      </li>
                      {p.id === "store" && (
                        <li className="flex items-center gap-2">
                          <span className="text-ok font-bold">✓</span>
                          <span>2 team seats</span>
                        </li>
                      )}
                      {p.id === "growth" && (
                        <li className="flex items-center gap-2">
                          <span className="text-ok font-bold">✓</span>
                          <span>Instant regression email alerts</span>
                        </li>
                      )}
                      {(p.id === "agency" || p.id === "agency_pro") && (
                        <>
                          <li className="flex items-center gap-2">
                            <span className="text-ok font-bold">✓</span>
                            <span>White-label branded PDF reports</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-ok font-bold">✓</span>
                            <span><strong>Unlimited</strong> client viewer seats</span>
                          </li>
                        </>
                      )}
                      {p.id === "agency_pro" && (
                        <li className="flex items-center gap-2">
                          <span className="text-ok font-bold">✓</span>
                          <span>Custom domain &amp; Public REST API</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Action CTA Button */}
                  <div className="mt-8 pt-4 border-t border-line">
                    {userOrg ? (
                      <button
                        type="button"
                        onClick={() => handlePricingCheckout(p.id)}
                        className={`ease-ui flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold cursor-pointer transition-colors ${
                          isAgency
                            ? "bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary shadow-card"
                            : "border border-line bg-surface text-ink hover:border-primary hover:text-primary"
                        }`}
                      >
                        Choose {p.name}
                      </button>
                    ) : (
                      <Link
                        href={`/sign-up?plan=${p.id}&billing=${billingCycle}`}
                        className={`ease-ui flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold no-underline transition-colors ${
                          isAgency
                            ? "bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary"
                            : "border border-line bg-surface text-ink hover:border-primary hover:text-primary"
                        }`}
                      >
                        Start 14-day free trial
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Feature Comparison Table Section */}
        <section aria-labelledby="comparison-h" className="border-t border-line bg-subtle py-20">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <div className="max-w-[700px] mb-12">
              <h2 id="comparison-h" className={H2}>
                Compare <em>all features</em>
              </h2>
              <p className="mt-2 text-base text-muted">
                Full breakdown of capacity limits, automated check capabilities, and agency features across all subscription plans.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle">
                    <th scope="col" className="p-4 sm:px-6 font-bold text-ink w-[34%]">
                      Feature / Capability
                    </th>
                    <th scope="col" className="p-4 text-center font-bold text-ink w-[16%]">
                      Store
                    </th>
                    <th scope="col" className="p-4 text-center font-bold text-ink w-[16%]">
                      Growth
                    </th>
                    <th scope="col" className="p-4 text-center font-bold text-primary w-[17%] bg-primary/5">
                      Agency
                    </th>
                    <th scope="col" className="p-4 text-center font-bold text-ink w-[17%]">
                      Agency Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_CATEGORIES.map((cat) => (
                    <Fragment key={cat.category}>
                      {/* Category Header Row */}
                      <tr>
                        <th
                          colSpan={5}
                          scope="colgroup"
                          className="border-b border-t border-line bg-subtle px-4 sm:px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted"
                        >
                          {cat.category}
                        </th>
                      </tr>

                      {/* Feature Item Rows */}
                      {cat.features.map((f, idx) => (
                        <tr
                          key={f.name}
                          className={`hover:bg-subtle/50 transition-colors ${
                            idx < cat.features.length - 1 ? "border-b border-line" : ""
                          }`}
                        >
                          <th scope="row" className="p-4 sm:px-6 font-medium text-ink align-middle">
                            <div>{f.name}</div>
                            {f.tooltip && (
                              <div className="text-xs text-muted font-normal mt-0.5">{f.tooltip}</div>
                            )}
                          </th>

                          {/* Store column */}
                          <td className="p-4 text-center text-muted align-middle">
                            {renderCell(f.store)}
                          </td>

                          {/* Growth column */}
                          <td className="p-4 text-center text-muted align-middle">
                            {renderCell(f.growth)}
                          </td>

                          {/* Agency column */}
                          <td className="p-4 text-center align-middle font-medium bg-primary/5">
                            {renderCell(f.agency)}
                          </td>

                          {/* Agency Pro column */}
                          <td className="p-4 text-center text-muted align-middle">
                            {renderCell(f.agencyPro)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Pricing FAQ Section */}
        <section aria-labelledby="pricing-faq-h" className="py-20">
          <div className="mx-auto max-w-[800px] px-4 sm:px-8">
            <h2 id="pricing-faq-h" className={H2}>
              Frequently asked <em>pricing questions</em>
            </h2>
            <div className="mt-8 flex flex-col border-t border-line">
              {PRICING_FAQS.map((faq, index) => {
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

        {/* Final CTA */}
        <section className="border-t border-line bg-page py-20 text-center">
          <div className="mx-auto max-w-[640px] px-4 flex flex-col items-center gap-6">
            <h2 className={H2}>
              Start with a <em>14-day free trial</em>
            </h2>
            <p className="m-0 text-lg text-muted">
              Audit your first storefront in under 3 minutes. Zero commitments, no credit card required.
            </p>
            <Link
              href="/sign-up"
              className="ease-ui flex h-12 items-center rounded-full bg-primary px-8 text-base font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary"
            >
              Start free trial →
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function renderCell(val: string | boolean) {
  if (typeof val === "boolean") {
    return val ? (
      <span className="text-ok font-bold text-base" title="Included">
        <span aria-hidden="true">✓</span>
        <span className="sr-only">Included</span>
      </span>
    ) : (
      <span className="text-muted/40 font-mono text-base" title="Not included">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className="text-ink font-medium">{val}</span>;
}
