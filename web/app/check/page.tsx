import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { FreeCheckFlow } from "@/components/marketing/free-check-flow";
import { FaqJsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Free Website Accessibility Checker (WCAG 2.2 AA)",
  description:
    "Test any public web page against WCAG 2.2 AA in about 30 seconds. Free automated accessibility check with severity scores and plain-English fix guides. No sign-up.",
  path: "/check",
});

const H2 = "m-0 font-serif text-[32px] leading-[36px] font-normal sm:text-[40px] sm:leading-[44px]";

const CHECKS = [
  { t: "Colour contrast", d: "Text and controls that are too faint to read against their background." },
  { t: "Images and icons", d: "Product photos, logos and icon buttons with no text alternative for screen readers." },
  { t: "Forms", d: "Search boxes, newsletter sign-ups and checkout fields with no label." },
  { t: "Links and buttons", d: "Controls with no accessible name, such as an unlabelled menu or cart button." },
  { t: "Page structure", d: "Missing page language, skipped heading levels, duplicate IDs and missing landmarks." },
  { t: "ARIA", d: "ARIA roles and attributes that are invalid or contradict the HTML underneath." },
];

const FAQS = [
  {
    q: "What does the free accessibility check test?",
    a: "It loads one public page and runs 92 automated WCAG 2.2 Level AA checks against it, covering colour contrast, text alternatives, form labels, link and button names, page structure and ARIA. Each problem comes with its severity, who it affects and how to fix it.",
  },
  {
    q: "Is an automated check enough to make my site accessible?",
    a: "No. Automated tools find roughly 30% to 50% of WCAG problems. They cannot tell whether your site works with a keyboard alone, or whether your alt text and labels make sense. Use the results as a starting point, then test the key journeys yourself.",
  },
  {
    q: "Does the check prove my site complies with the EAA or the ADA?",
    a: "No automated tool can certify legal compliance, and we never claim to. The check shows you barriers you can fix today. Ongoing monitoring gives you a dated record of the work you have done.",
  },
  {
    q: "Do I need to install anything on my site?",
    a: "No. The check reads your page the way a visitor's browser would. Nothing is installed, and no cookies or scripts are placed on your site. Results are stored for 30 days.",
  },
  {
    q: "How is this different from monitoring?",
    a: "The free check looks at one page, once. Monitoring checks hundreds of pages on your website every week, whatever it is built with, groups problems by page type so you fix each one once, and alerts you when a theme, app or code update brings a problem back.",
  },
];

export default function CheckPage() {
  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />
      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <FreeCheckFlow />

        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-4 pb-20 sm:px-8">
          <section aria-labelledby="what-h" className="flex flex-col gap-6 border-t border-line pt-12">
            <h2 id="what-h" className={H2}>
              What the checker looks for
            </h2>
            <p className="m-0 max-w-[720px] text-lg leading-7 text-pretty text-muted">
              The checker runs the automated part of WCAG 2.2 Level AA, the standard behind the European Accessibility Act
              and most ADA website claims. It concentrates on the problems that stop shoppers finding, understanding and buying
              products.
            </p>
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {CHECKS.map((c) => (
                <li key={c.t} className="rounded-2xl border border-line bg-surface p-6">
                  <h3 className="m-0 text-base font-semibold text-ink">{c.t}</h3>
                  <p className="m-0 mt-2 text-sm leading-6 text-muted">{c.d}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="read-h" className="flex max-w-[760px] flex-col gap-4">
            <h2 id="read-h" className={H2}>
              How to read your results
            </h2>
            <p className="m-0 leading-7 text-muted">
              Problems are sorted by severity. <strong className="text-ink">Critical</strong> problems block someone from
              using the page at all, such as an unlabelled checkout button. <strong className="text-ink">Serious</strong>{" "}
              ones make a task much harder. Fix those first: on most stores a handful of theme-level fixes clear the
              majority of findings, because the same header, product card and footer repeat on every page.
            </p>
            <p className="m-0 leading-7 text-muted">
              Each finding links to a step-by-step fix. Browse them all in the{" "}
              <Link href="/fix" className="font-semibold text-primary hover:text-primary-hover">
                fix guides for Shopify, WordPress and custom code
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="check-faq-h" className="flex max-w-[800px] flex-col gap-4">
            <h2 id="check-faq-h" className={H2}>
              Questions about the free check
            </h2>
            <div>
              {FAQS.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none justify-between gap-4 py-4 text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <span>{f.q}</span>
                    <span aria-hidden="true" className="group-open:hidden">
                      +
                    </span>
                    <span aria-hidden="true" className="hidden group-open:inline">
                      −
                    </span>
                  </summary>
                  <p className="m-0 mb-4 text-pretty text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="monitor-h"
            className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-subtle p-8"
          >
            <h2 id="monitor-h" className="m-0 font-serif text-2xl font-normal">
              Check every page, every week
            </h2>
            <p className="m-0 max-w-[620px] text-muted">
              Theme updates and new apps bring problems back. Monitoring re-scans your whole store and tells you when
              something breaks.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="ease-ui flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
              >
                Start a 14-day free trial
              </Link>
              <Link
                href="/pricing"
                className="ease-ui flex h-10 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink no-underline hover:border-primary"
              >
                See monitoring plans
              </Link>
            </div>
          </section>
        </div>

        <FaqJsonLd items={FAQS} />
      </main>
      <MarketingFooter />
    </div>
  );
}
