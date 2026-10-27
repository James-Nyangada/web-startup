"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { FreeCheck } from "./free-check";
import { Collapse } from "@/components/disclosure";
import { useReveal } from "@/components/reveal";
import { useTheme } from "@/components/theme";
import { COMPARE, FACTS, FAQ, HOW, PLANS } from "@/lib/home-data";

const H2 = "m-0 font-serif text-[40px] leading-[44px] font-normal sm:text-[52px] sm:leading-[56px]";

function Placeholder({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      className={`grid place-items-center border border-line bg-[repeating-linear-gradient(135deg,var(--bgs)_0_10px,var(--sunk)_10px_20px)] ${className}`}
    >
      <span className="rounded bg-surface px-2 py-0.5 font-mono text-xs text-muted">{label}</span>
    </div>
  );
}

export function HomePage() {
  const [faq, setFaq] = useState(0);
  const scope = useReveal<HTMLDivElement>();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div ref={scope} className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <FreeCheck />

        <section aria-labelledby="facts-h" className="border-y border-line bg-subtle">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-16 sm:px-8">
            <h2 id="facts-h" data-reveal className={`${H2} max-w-[720px]`}>
              Accessibility is now a <em>business</em> question, not just a technical one
            </h2>
            <div data-reveal="stagger" className="grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              {FACTS.map((f) => (
                <div key={f.fact} className="flex flex-col gap-2">
                  <strong className="text-xl leading-7">{f.fact}</strong>
                  <span className="text-sm text-muted">{f.source}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-20 sm:px-8">
          <h2 id="how-h" data-reveal className={H2}>
            How it <em>works</em>
          </h2>
          <ol data-reveal="stagger" className="m-0 grid list-none gap-6 p-0 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {HOW.map((h) => {
              const imageSrc = isDark ? h.imageDark : h.imageLight;
              return (
                <li key={h.t} className="flex flex-col gap-3">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-all duration-300 hover:shadow-lg">
                    <img
                      src={imageSrc}
                      alt={h.alt}
                      width={800}
                      height={600}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-sm font-semibold text-ptext">{h.n}</span>
                  <h3 className="m-0 text-xl leading-7 font-semibold">{h.t}</h3>
                  <p className="m-0 text-pretty text-muted">{h.d}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section id="agencies" aria-labelledby="ag-h" className="border-t border-line">
          <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-20 sm:px-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
            <div data-reveal className="flex flex-col gap-4">
              <h2 id="ag-h" className={H2}>
                Built for <em>agencies</em> and freelancers
              </h2>
              <p className="m-0 text-lg leading-7 text-muted">Turn accessibility into a monthly care plan your clients understand.</p>
              <ul className="m-0 flex flex-col gap-2 pl-5">
                <li>Every client site on one screen, worst first</li>
                <li>Monthly reports with your logo and colours</li>
                <li>A calm client portal, no rule IDs, no jargon</li>
              </ul>
              <Link href="/agencies" className="font-semibold text-primary hover:text-primary-hover no-underline">
                See agency plans →
              </Link>
            </div>
            <div data-reveal>
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-all duration-300 hover:shadow-lg">
                <picture>
                  <source srcSet="/screenshots/agency-composite.webp" type="image/webp" />
                  <img
                    src="/screenshots/agency-composite.png"
                    alt="Agency dashboard listing five client sites worst-first, with a client report in the agency’s own branding on top."
                    width={1600}
                    height={1000}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.01]"
                    loading="lazy"
                  />
                </picture>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="ov-h" className="border-y border-line bg-subtle">
          <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-16 sm:px-8">
            <h2 id="ov-h" data-reveal className={H2}>
              Why not an <em>overlay?</em>
            </h2>
            <div data-reveal className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="border-b border-line px-4 py-3">
                      <span className="sr-only">Question</span>
                    </th>
                    <th scope="col" className="border-b border-line px-4 py-3">
                      Overlay widget
                    </th>
                    <th scope="col" className="border-b border-line px-4 py-3 text-ptext">
                      EveryVisitor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((c, i) => (
                    <tr key={c.q}>
                      <th scope="row" className={`px-4 py-3 text-left font-medium ${i < COMPARE.length - 1 ? "border-b border-line" : ""}`}>
                        {c.q}
                      </th>
                      <td className={`px-4 py-3 text-muted ${i < COMPARE.length - 1 ? "border-b border-line" : ""}`}>{c.a}</td>
                      <td className={`px-4 py-3 ${i < COMPARE.length - 1 ? "border-b border-line" : ""}`}>{c.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pr-h" className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-20 sm:px-8">
          <h2 id="pr-h" data-reveal className={H2}>
            <em>Simple</em> pricing
          </h2>
          <div data-reveal="stagger" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`ease-ui flex flex-col gap-2 rounded-2xl bg-surface p-6 shadow-card hover:-translate-y-0.5 ${
                  p.tag ? "border-2 border-primary" : "border border-line"
                }`}
              >
                <span className="min-h-5 text-[13px] font-semibold text-ptext">{p.tag}</span>
                <h3 className="m-0 text-xl font-semibold">{p.name}</h3>
                <span>
                  <strong className="tnum text-[30px] leading-[38px]">{p.price}</strong>
                  <span className="text-muted"> / month</span>
                </span>
                <span className="text-sm text-muted">{p.who}</span>
                <div className="mt-4 pt-3 border-t border-line">
                  <Link
                    href="/sign-up"
                    className="ease-ui flex h-9 items-center justify-center rounded-lg bg-surface border border-line text-sm font-semibold text-ink no-underline hover:border-primary hover:text-primary"
                  >
                    Start 14-day trial
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="font-semibold text-primary hover:text-primary-hover no-underline">
            Compare all features and limits →
          </Link>
        </section>

        <section aria-labelledby="faq-h" className="border-t border-line">
          <div className="mx-auto flex max-w-[800px] flex-col gap-4 px-4 py-16 sm:px-8">
            <h2 id="faq-h" data-reveal className={H2}>
              <em>Questions</em>
            </h2>
            <div data-reveal="stagger">
              {FAQ.map((f, i) => {
                const open = faq === i;
                return (
                  <div key={f.q} className="border-b border-line">
                    <h3 className="m-0">
                      <button
                        type="button"
                        onClick={() => setFaq(open ? -1 : i)}
                        aria-expanded={open}
                        className="flex w-full justify-between gap-4 border-0 bg-transparent py-4 text-left text-lg font-semibold text-ink"
                      >
                        <span>{f.q}</span>
                        <span aria-hidden="true">{open ? "−" : "+"}</span>
                      </button>
                    </h3>
                    <Collapse open={open}>
                      <p className="mt-0 mb-4 text-pretty text-muted">{f.a}</p>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
