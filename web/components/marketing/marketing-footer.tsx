import Link from "next/link";
import { Logo } from "@/components/logo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-subtle text-ink">
      <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-5">
          <div className="flex flex-col gap-4 md:col-span-2">
            <Logo />
            <p className="max-w-sm text-sm text-muted">
              Continuous accessibility monitoring for Shopify and WordPress sites.
              Plain-language fix guides, worst-first prioritization, and verifiable progress records.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block size-2 rounded-full bg-ok" aria-hidden="true" />
              <span>No tracking cookies · Privacy-first analytics · WCAG 2.2 AA compliant</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold tracking-wider uppercase text-muted">Product</span>
            <ul className="m-0 list-none flex flex-col gap-2 p-0 text-sm">
              <li>
                <Link href="/#how" className="text-muted no-underline hover:text-ink">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/check" className="text-muted no-underline hover:text-ink">
                  Free check
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted no-underline hover:text-ink">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/agencies" className="text-muted no-underline hover:text-ink">
                  For agencies
                </Link>
              </li>
              <li>
                <Link href="/fix" className="text-muted no-underline hover:text-ink">
                  Fix guides
                </Link>
              </li>
              <li>
                <Link href="/changelog" className="text-muted no-underline hover:text-ink">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold tracking-wider uppercase text-muted">Trust & Legal</span>
            <ul className="m-0 list-none flex flex-col gap-2 p-0 text-sm">
              <li>
                <Link href="/legal/terms" className="text-muted no-underline hover:text-ink">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-muted no-underline hover:text-ink">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/legal/dpa" className="text-muted no-underline hover:text-ink">
                  Data Processing Agreement (DPA)
                </Link>
              </li>
              <li>
                <Link href="/legal/subprocessors" className="text-muted no-underline hover:text-ink">
                  Subprocessors
                </Link>
              </li>
              <li>
                <Link href="/bot" className="text-muted no-underline hover:text-ink">
                  PlainsightBot crawler
                </Link>
              </li>
              <li>
                <Link href="/accessibility-notes" className="text-muted no-underline hover:text-ink">
                  Accessibility statement
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold tracking-wider uppercase text-muted">Resources</span>
            <ul className="m-0 list-none flex flex-col gap-2 p-0 text-sm">
              <li>
                <Link href="/blog" className="text-muted no-underline hover:text-ink">
                  Engineering Blog
                </Link>
              </li>
              <li>
                <Link href="/blog/eaa-june-2025-readiness" className="text-muted no-underline hover:text-ink">
                  EAA June 2025 Guide
                </Link>
              </li>
              <li>
                <Link href="/blog/why-accessibility-overlays-fail" className="text-muted no-underline hover:text-ink">
                  Why Overlays Fail
                </Link>
              </li>
              <li>
                <Link href="/blog/shopify-accessibility-best-practices" className="text-muted no-underline hover:text-ink">
                  Shopify a11y Best Practices
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-xs text-muted">
          <span>© {new Date().getFullYear()} Plainsight. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/legal/terms" className="text-muted no-underline hover:text-ink">
              Terms
            </Link>
            <Link href="/legal/privacy" className="text-muted no-underline hover:text-ink">
              Privacy
            </Link>
            <Link href="/bot" className="text-muted no-underline hover:text-ink">
              Our bot
            </Link>
            <Link href="/accessibility-notes" className="text-muted no-underline hover:text-ink">
              Accessibility
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
