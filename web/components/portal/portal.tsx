"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { ThemeTextToggle } from "@/components/theme";
import { Collapse } from "@/components/disclosure";
import { useEntrance } from "@/components/reveal";
import { SEV, type Severity } from "@/lib/severity";
import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";

const CARD_LINK =
  "ease-ui flex flex-col gap-3 rounded-2xl border border-line bg-surface p-[18px] text-ink no-underline shadow-card hover:-translate-y-0.5 hover:text-ink hover:shadow-pop";
const BTN_OUTLINE = "ease-ui grid h-12 place-items-center rounded-full border border-line-strong font-semibold text-ink no-underline hover:bg-subtle hover:text-ink";

function PortalFrame({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="portal flex min-h-screen flex-col bg-surface text-base leading-6 text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[560px] items-center gap-2.5 px-5 py-3">{header}</div>
      </header>
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[560px] flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-muted">
          <a href="mailto:hello@brightline.studio">Contact your agency</a>
          <ThemeTextToggle />
          <span>Powered by Plainsight</span>
        </div>
      </footer>
    </div>
  );
}

/** S-60 Portal home. */
export function PortalHome() {
  const scope = useEntrance<HTMLElement>();
  const sites = [
    { name: "Oakhaus Furniture", url: "oakhaus.com", score: 78, band: "Needs work", date: "14 Oct", status: "Improving", cls: "bg-ok-soft text-ok", href: "/portal/oakhaus" },
    { name: "Oakhaus Trade", url: "trade.oakhaus.com", score: 66, band: "Poor", date: "14 Oct", status: "Needs attention", cls: "bg-ser-soft text-ser", href: "#" },
  ];
  return (
    <PortalFrame
      header={
        <>
          <span className="grid size-8 place-items-center rounded-md bg-brand text-[13px] font-bold text-surface">BS</span>
          <span className="flex-1 font-semibold">Brightline Studio</span>
          <button type="button" aria-label="Account menu: Mark Otieno" className="size-11 rounded-full border border-line bg-subtle text-[13px] font-semibold text-ink">
            MO
          </button>
        </>
      }
    >
      <main ref={scope} className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-5 py-6">
        <h1 className="m-0 font-serif text-4xl leading-10 font-normal">
          Hello, <em>Mark</em>
        </h1>
        <p className="m-0 text-muted">Here&apos;s how your websites are doing. Brightline checked them on 14 Oct.</p>
        <h2 className="mt-2 mb-0 text-lg font-semibold">Your websites</h2>
        {sites.map((s) => (
          <Link key={s.url} href={s.href} className={CARD_LINK}>
            <span className="flex justify-between gap-3">
              <span>
                <strong className="block text-[17px]">{s.name}</strong>
                <span className="text-sm text-muted">{s.url}</span>
              </span>
              <span className="tnum text-[28px] leading-8 font-bold">{s.score}</span>
            </span>
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className={`rounded-full px-2.5 py-0.5 font-semibold ${s.cls}`}>{s.status}</span>
              <span className="text-muted">
                {s.band} · checked {s.date}
              </span>
            </span>
          </Link>
        ))}
      </main>
    </PortalFrame>
  );
}

const MONTHS: [string, number][] = [
  ["May", 61],
  ["Jun", 63],
  ["Jul", 66],
  ["Aug", 68],
  ["Sep", 72],
  ["Oct", 78],
];

const OPEN: [Severity, number, string][] = [
  ["critical", 3, "Some people can’t use product photos, the cart button or the newsletter form."],
  ["serious", 4, "Some text is hard to read and zoom is blocked on phones."],
  ["moderate", 2, "Page structure is confusing in places."],
  ["minor", 2, "Small fixes on the blog and contact page."],
];

/** S-61 Portal site view — plain language, no rule IDs or selectors. */
export function PortalSite() {
  const [whatOpen, setWhatOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const scope = useEntrance<HTMLElement>();
  const chart = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo("[data-bar]", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.7, ease: "power3.out", stagger: 0.07, delay: 0.3 });
        gsap.fromTo("[data-bar-label]", { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.07, delay: 0.6 });
      });
      return () => mm.revert();
    },
    { scope: chart },
  );

  return (
    <PortalFrame
      header={
        <Link href="/portal" className="-ml-3 flex h-11 items-center gap-1 px-3 font-semibold no-underline">
          <Icon d={I.chevronLeft} />
          Your websites
        </Link>
      }
    >
      <main ref={scope} className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 py-6">
        <div>
          <h1 className="m-0 font-serif text-4xl leading-10 font-normal">Oakhaus Furniture</h1>
          <span className="text-sm text-muted">oakhaus.com · checked 14 Oct</span>
        </div>

        <section aria-labelledby="p-score" className="flex flex-col gap-2 rounded-xl bg-brand-soft p-5">
          <span className="flex items-center justify-between">
            <h2 id="p-score" className="m-0 text-sm font-semibold">
              Automated check score
            </h2>
            <button
              type="button"
              onClick={() => setWhatOpen((o) => !o)}
              aria-expanded={whatOpen}
              aria-controls="p-what"
              className="h-11 border-0 bg-transparent px-1 text-sm font-semibold text-brand underline"
            >
              What this means
            </button>
          </span>
          <span className="flex items-baseline gap-2.5">
            <span className="tnum text-[40px] leading-[44px] font-bold">78</span>
            <span className="rounded bg-mod-soft px-2 py-0.5 text-sm font-semibold text-mod">Needs work</span>
          </span>
          <span className="text-[15px] font-medium text-ok">Improving — up 17 since August</span>
          <Collapse open={whatOpen}>
            <p id="p-what" className="mt-1 mb-0 text-sm leading-5">
              The score counts problems automated tests can find. It is not a legal rating. Brightline also tests things a computer can&apos;t, like keyboard use.
            </p>
          </Collapse>
        </section>

        <section aria-labelledby="p-trend" className="flex flex-col gap-3">
          <h2 id="p-trend" className="m-0 text-lg font-semibold">
            Last 6 months
          </h2>
          <p className="m-0 text-sm leading-5 text-muted">Steady progress: 61 in May to 78 in October.</p>
          <div ref={chart} aria-hidden="true">
            <div className="flex h-[140px] items-end gap-2.5 border-b border-line px-1">
              {MONTHS.map(([m, v]) => (
                <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span data-bar-label className="tnum text-[13px] font-semibold">
                    {v}
                  </span>
                  <span data-bar className="block w-full rounded-t bg-brand" style={{ height: `${(v - 40) * 1.6}px` }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2.5 px-1 pt-1">
              {MONTHS.map(([m]) => (
                <span key={m} className="flex-1 text-center text-xs text-muted">
                  {m}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTableOpen((o) => !o)}
            aria-expanded={tableOpen}
            className="ease-ui h-11 self-start rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle"
          >
            {tableOpen ? "Hide table" : "View as table"}
          </button>
          {tableOpen && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-subtle text-left">
                  <th scope="col" className="p-2">
                    Month
                  </th>
                  <th scope="col" className="p-2">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map(([m, v]) => (
                  <tr key={m} className="border-b border-line">
                    <td className="p-2">{m}</td>
                    <td className="tnum p-2">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="p-open" className="flex flex-col gap-2">
          <h2 id="p-open" className="m-0 text-lg font-semibold">
            Still open
          </h2>
          {OPEN.map(([sev, n, t]) => (
            <div key={sev} className="flex items-start gap-2.5 border-b border-line py-2.5 text-[15px] leading-[22px]">
              <span className={`flex-none rounded px-2 text-[13px] leading-[22px] font-semibold ${SEV[sev].bg} ${SEV[sev].text}`}>
                {n} {SEV[sev].label}
              </span>
              <span>{t}</span>
            </div>
          ))}
        </section>

        <section aria-labelledby="p-fixed" className="flex flex-col gap-2">
          <h2 id="p-fixed" className="m-0 text-lg font-semibold">
            Recently fixed by your team
          </h2>
          <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
            <li>Pages now have clear titles · 12 Oct</li>
            <li>Checkout errors are announced · 12 Oct</li>
            <li>Cart text is easier to read · 7 Oct</li>
          </ul>
        </section>

        <section aria-labelledby="p-note" className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
          <h2 id="p-note" className="m-0 text-base font-semibold">
            Note from Daniel at Brightline
          </h2>
          <p className="m-0 text-[15px] leading-[22px]">A theme update on 13 Oct removed some product photo descriptions. We&apos;re restoring them this week.</p>
          <span className="text-[13px] text-muted">14 Oct</span>
        </section>

        <div className="flex flex-col gap-3">
          <a href="#" className={BTN_OUTLINE}>
            Download October report (PDF)
          </a>
          <a href="#" className={BTN_OUTLINE}>
            Download evidence pack
          </a>
          <a
            href="mailto:hello@brightline.studio"
            className="ease-ui grid h-12 place-items-center rounded-full bg-brand font-semibold text-surface no-underline hover:text-surface hover:opacity-90"
          >
            Contact Brightline Studio
          </a>
        </div>
      </main>
    </PortalFrame>
  );
}
