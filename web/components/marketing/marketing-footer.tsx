"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { API_BASE_URL } from "@/lib/api";

interface FooterLink {
  label: string;
  url: string;
}
interface FooterGroup {
  title: string;
  links: FooterLink[];
}

const DEFAULT_TAGLINE =
  "Continuous accessibility monitoring for Shopify and WordPress sites. Plain-language fix guides, worst-first prioritization, and verifiable progress records.";

const STATUS_URL = process.env.NEXT_PUBLIC_STATUS_URL;

const DEFAULT_GROUPS: FooterGroup[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", url: "/#how" },
      { label: "Free check", url: "/check" },
      { label: "Pricing", url: "/pricing" },
      { label: "For agencies", url: "/agencies" },
      { label: "Fix guides", url: "/fix" },
      { label: "Changelog", url: "/changelog" },
    ],
  },
  {
    title: "Trust & Legal",
    links: [
      { label: "Terms of service", url: "/legal/terms" },
      { label: "Privacy policy", url: "/legal/privacy" },
      { label: "Refund policy", url: "/legal/refunds" },
      { label: "Data Processing Agreement (DPA)", url: "/legal/dpa" },
      { label: "Subprocessors", url: "/legal/subprocessors" },
      { label: "EveryVisitorBot crawler", url: "/bot" },
      { label: "Accessibility statement", url: "/accessibility-notes" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help centre", url: "/help" },
      { label: "API reference", url: "/developers/api" },
      ...(STATUS_URL ? [{ label: "System status", url: STATUS_URL }] : []),
      { label: "info@everyvisitor.app", url: "mailto:info@everyvisitor.app" },
      { label: "EAA June 2025 Guide", url: "/blog/eaa-june-2025-readiness" },
      { label: "Why Overlays Fail", url: "/blog/why-accessibility-overlays-fail" },
      { label: "Shopify a11y Best Practices", url: "/blog/shopify-accessibility-best-practices" },
    ],
  },
];

const LINK_CLASS = "text-muted no-underline hover:text-ink";

function FooterAnchor({ link }: { link: FooterLink }) {
  const external = /^(https?:|mailto:)/.test(link.url);
  return external ? (
    <a href={link.url} className={LINK_CLASS}>
      {link.label}
    </a>
  ) : (
    <Link href={link.url} className={LINK_CLASS}>
      {link.label}
    </Link>
  );
}

/** Tagline and link groups come from the staff area when published; the built-in text otherwise. */
export function MarketingFooter() {
  const [tagline, setTagline] = useState(DEFAULT_TAGLINE);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/v1/public/content/pages/footer`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: { data?: { tagline?: string; linkGroups?: FooterGroup[] } } } | null) => {
        const d = body?.data?.data;
        if (cancelled || !d) return;
        if (d.tagline) setTagline(d.tagline);
        if (d.linkGroups?.length) setGroups(d.linkGroups);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="border-t border-line bg-subtle text-ink">
      <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-5">
          <div className="flex flex-col gap-4 md:col-span-2">
            <Logo />
            <p className="max-w-sm text-sm text-muted">{tagline}</p>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block size-2 rounded-full bg-ok" aria-hidden="true" />
              <span>No tracking cookies · Privacy-first analytics · Built to WCAG 2.2 AA</span>
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-3">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">{g.title}</span>
              <ul className="m-0 list-none flex flex-col gap-2 p-0 text-sm">
                {g.links.map((l) => (
                  <li key={`${l.label}-${l.url}`}>
                    <FooterAnchor link={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-xs text-muted">
          <span>© {new Date().getFullYear()} EveryVisitor. All rights reserved.</span>
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
