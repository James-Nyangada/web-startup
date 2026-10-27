"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { SeverityBadge } from "@/components/badges";
import { Collapse } from "@/components/disclosure";
import { SEV } from "@/lib/severity";
import { CHECK_STEPS, RESULT_COUNTS, TOP_PROBLEMS } from "@/lib/home-data";
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from "@/lib/gsap";

type Phase = "input" | "progress" | "result";

const HEADLINE: { w: string; em?: boolean }[] = [
  ..."Find the accessibility problems that".split(" ").map((w) => ({ w })),
  ..."stop people buying,".split(" ").map((w) => ({ w, em: true })),
  ..."and fix them in order.".split(" ").map((w) => ({ w })),
];
const HEADLINE_TEXT = HEADLINE.map((h) => h.w).join(" ");

/** S-01 hero + S-03 free checker (input · progress · result). */
export function FreeCheck() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [url, setUrl] = useState("soraskin.co");
  const [err, setErr] = useState(false);
  const [step, setStep] = useState(0);
  const [openTop, setOpenTop] = useState(-1);
  const [sent, setSent] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scope = useRef<HTMLElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Result heading receives focus when ready (S-03 note).
  useEffect(() => {
    if (phase === "result") resultHeading.current?.focus();
  }, [phase]);

  // Hero entrance on first load, then a cross-fade whenever the phase changes.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      const isFirst = firstRender.current;
      firstRender.current = false;

      mm.add(MOTION_OK, () => {
        if (phase === "input" && isFirst) {
          const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
          tl.fromTo("[data-hero='eyebrow']", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5 })
            .fromTo("[data-hero='word']", { autoAlpha: 0, yPercent: 60 }, { autoAlpha: 1, yPercent: 0, duration: 0.7, stagger: 0.035 }, "-=0.3")
            .fromTo("[data-hero='rest']", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 }, "-=0.45");
          return;
        }
        if (phase === "input") {
          gsap.fromTo("[data-hero]", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.04, clearProps: "transform" });
          return;
        }
        gsap.fromTo("[data-phase] > *", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.06, clearProps: "transform" });
        if (phase === "result") {
          gsap.fromTo("[data-result-row]", { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.35, ease: "power2.out", stagger: 0.05, delay: 0.2 });
          gsap.fromTo("[data-score]", { textContent: 0 }, { textContent: 64, duration: 0.9, ease: "power2.out", snap: { textContent: 1 } });
        }
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.set("[data-hero]", { autoAlpha: 1 });
        gsap.fromTo("[data-phase]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [phase] },
  );

  // Progress: the newly active step gets a soft pulse; completed marks pop in.
  useGSAP(
    () => {
      if (phase !== "progress") return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(`[data-step='${step}']`, { scale: 0.98 }, { scale: 1, duration: 0.3, ease: "back.out(2)" });
        if (step > 0) gsap.fromTo(`[data-mark='${step - 1}']`, { scale: 0 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [phase, step] },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = url.trim().replace(/^https?:\/\//, "");
    if (!/^[\w-]+(\.[\w-]+)+/.test(u)) {
      setErr(true);
      return;
    }
    router.push(`/check?url=${encodeURIComponent(u)}`);
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setPhase("input");
    setSent(false);
  };

  return (
    <section ref={scope} id="check" aria-labelledby="hero-h" className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pt-16 pb-16 sm:px-8 sm:pt-24 sm:pb-20">
      {phase === "input" && (
        <>
          <span data-hero="eyebrow" className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
            Accessibility monitoring for online stores
          </span>
          <h1
            id="hero-h"
            className="m-0 max-w-[880px] font-serif text-[46px] leading-[50px] font-normal tracking-[-0.01em] text-balance sm:text-[60px] sm:leading-[64px] lg:text-[76px] lg:leading-[78px]"
          >
            <span className="sr-only">{HEADLINE_TEXT}</span>
            <span aria-hidden="true">
              {HEADLINE.map((h, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                  <span data-hero="word" className={`inline-block ${h.em ? "italic" : ""}`}>
                    {h.w}
                  </span>
                  {i < HEADLINE.length - 1 && " "}
                </span>
              ))}
            </span>
          </h1>
          <p data-hero="rest" className="m-0 max-w-[680px] text-lg leading-7 text-pretty text-muted">
            Weekly checks for Shopify and WordPress sites, plain-language fix guides, and a record of your progress. Built for the ADA in the US and the
            European Accessibility Act, in force since June 2025.
          </p>
          <form data-hero="rest" onSubmit={submit} noValidate className="flex max-w-[640px] flex-col gap-2">
            <label htmlFor="url" className="text-sm font-semibold">
              Check one page free
            </label>
            <div className="flex flex-wrap gap-3">
              <div
                className={`flex h-12 flex-[1_1_320px] overflow-hidden rounded-full bg-surface ${err ? "border-2 border-crit" : "border border-line-strong"}`}
              >
                <span className="grid place-items-center border-r border-line bg-subtle px-3 text-base text-muted">https://</span>
                <input
                  id="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setErr(false);
                  }}
                  aria-invalid={err}
                  aria-describedby={err ? "url-error url-help" : "url-help"}
                  autoComplete="url"
                  placeholder="yourstore.com"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 text-base text-ink outline-none"
                />
              </div>
              <button type="submit" className="ease-ui h-12 rounded-full border-0 bg-primary px-6 text-base font-semibold text-on-primary hover:bg-primary-hover">
                Check your site free
              </button>
            </div>
            {err && (
              <span id="url-error" role="alert" className="flex items-center gap-1.5 text-sm text-crit">
                <Icon d={I.critical} />
                Enter a full web address, like yourstore.com
              </span>
            )}
            <span id="url-help" className="text-sm text-muted">
              We check one page. We don&apos;t store personal data. No overlay, no script on your site.
            </span>
          </form>
        </>
      )}

      {phase === "progress" && (
        <div data-phase className="flex max-w-[640px] flex-col gap-5">
          <h1 className="m-0 font-serif text-[36px] leading-10 font-normal break-words sm:text-[44px] sm:leading-[48px]">Checking {url}</h1>
          <p className="m-0 text-muted">This usually takes 30–60 seconds.</p>
          <ol role="status" aria-live="polite" className="m-0 flex list-none flex-col gap-3 p-0">
            {CHECK_STEPS.map((label, i) => {
              const done = i < step;
              const cur = i === step;
              return (
                <li
                  key={label}
                  data-step={i}
                  className={`ease-ui flex items-center gap-3 rounded-full border border-line px-4 py-3.5 ${cur ? "bg-primary-soft" : "bg-surface"}`}
                >
                  <span
                    className={`grid size-6 place-items-center rounded-full border-2 text-[13px] font-bold text-ok ${
                      done ? "border-ok" : cur ? "border-primary" : "border-line"
                    }`}
                  >
                    <span data-mark={i} className="inline-block">
                      {done ? "✓" : ""}
                    </span>
                  </span>
                  <span className={`flex-1 ${cur ? "font-semibold" : ""}`}>{label}</span>
                  <span className="text-sm text-muted">{done ? "Done" : cur ? "In progress…" : "Waiting"}</span>
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={reset} className="self-start border-0 bg-transparent p-0 text-sm font-semibold text-ptext underline">
            Cancel check
          </button>
        </div>
      )}

      {phase === "result" && (
        <div data-phase className="grid items-start gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <h1
                ref={resultHeading}
                tabIndex={-1}
                className="m-0 font-serif text-[36px] leading-10 font-normal break-words sm:text-[44px] sm:leading-[48px]"
              >
                Results for {url}
              </h1>
              <p className="mt-1 mb-0 text-sm text-muted">Home page · checked 15 Oct 2026, 10:41 · 92 automated checks</p>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-muted">Automated check score</span>
                <span className="flex items-baseline gap-2.5">
                  <span data-score className="tnum text-[40px] leading-[44px] font-bold">
                    64
                  </span>
                  <span className="rounded bg-crit-soft px-2 py-0.5 text-sm font-semibold text-crit">Poor</span>
                </span>
              </div>
              <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
                {RESULT_COUNTS.map(([sev, n]) => (
                  <li key={sev} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${SEV[sev].bg} ${SEV[sev].text}`}>
                    <Icon d={SEV[sev].icon} />
                    {n} {SEV[sev].label}
                  </li>
                ))}
              </ul>
            </div>
            <h2 className="mt-2 mb-0 text-2xl font-semibold">Top problems on this page</h2>
            <ul className="m-0 list-none overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-card">
              {TOP_PROBLEMS.map((t, i) => {
                const open = openTop === i;
                return (
                  <li key={t.title} data-result-row className="border-b border-line last:border-b-0">
                    <h3 className="m-0">
                      <button
                        type="button"
                        onClick={() => setOpenTop(open ? -1 : i)}
                        aria-expanded={open}
                        className="ease-ui grid w-full grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 border-0 bg-transparent px-4 py-3.5 text-left text-base font-medium text-ink hover:bg-subtle sm:grid-cols-[110px_minmax(0,1fr)_auto]"
                      >
                        <SeverityBadge sev={t.sev} />
                        <span>{t.title}</span>
                        <span className="tnum text-sm text-muted">{t.n}×</span>
                      </button>
                    </h3>
                    <Collapse open={open}>
                      <div className="flex flex-col gap-1.5 px-4 pb-4 text-sm leading-5 sm:pl-[138px]">
                        <span>
                          <strong>Who it affects:</strong> {t.who}
                        </span>
                        <a href="#">Read the fix guide</a>
                      </div>
                    </Collapse>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="flex flex-col gap-5">
            <section className="flex flex-col gap-2 rounded-lg bg-subtle p-5">
              <h2 className="m-0 text-base font-semibold">What this check can&apos;t tell you</h2>
              <ul className="m-0 flex flex-col gap-1 pl-5 text-sm leading-5">
                <li>Whether your site works with a keyboard alone</li>
                <li>Whether alt text and labels actually make sense</li>
                <li>Problems on your other pages, cart and checkout</li>
                <li>Whether your site meets any law. No automated tool can say that</li>
              </ul>
            </section>
            {!sent ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
                className="flex flex-col gap-3 rounded-2xl border border-line p-5"
              >
                <h2 className="m-0 text-base font-semibold">Email me the full report</h2>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="em" className="text-sm font-semibold">
                    Email (required)
                  </label>
                  <input
                    id="em"
                    type="email"
                    required
                    defaultValue="grace@soraskin.co"
                    className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink"
                  />
                </div>
                <label className="flex items-start gap-2.5 text-sm leading-5">
                  <input type="checkbox" className="mt-px size-[18px] flex-none accent-ptext" />
                  Also send me occasional tips on fixing accessibility problems. Unsubscribe anytime.
                </label>
                <button type="submit" className="ease-ui h-10 rounded-full border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-subtle">
                  Send full report
                </button>
              </form>
            ) : (
              <p role="status" className="m-0 rounded-lg bg-ok-soft px-5 py-4 text-sm font-medium text-ok">
                Report sent to grace@soraskin.co. It may take a minute to arrive.
              </p>
            )}
            <section className="flex flex-col gap-3 rounded-2xl bg-ink p-6 text-surface">
              <h2 className="m-0 text-xl leading-7 font-semibold">Monitor your whole site, 14 days free</h2>
              <p className="m-0 text-sm leading-5">We&apos;ll check up to 150 pages every week, group the problems by template, and alert you when something breaks.</p>
              <Link
                href="/overview"
                className="ease-ui grid h-11 place-items-center rounded-lg bg-on-primary text-[15px] font-semibold text-ptext no-underline hover:opacity-90"
              >
                Start free trial
              </Link>
            </section>
            <button type="button" onClick={reset} className="self-start border-0 bg-transparent p-0 text-sm font-semibold text-ptext underline">
              Check another page
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
