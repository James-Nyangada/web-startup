"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { SeverityBadge } from "@/components/badges";
import { useFocusTrap } from "@/components/use-focus-trap";
import { DRAWER_TABS, NAMES, type HistoryKind, type Issue } from "@/lib/site-data";
import { gsap, useGSAP, MOTION, MOTION_OK, prefersReducedMotion } from "@/lib/gsap";

const STATUS_LABEL = { open: "Open", regressed: "Regressed", needsReview: "Needs review", fixed: "Fixed", ignored: "Ignored" } as const;
const HISTORY_ICON: Record<HistoryKind, string> = { found: I.search, ok: I.fixed, reg: I.regressed, user: I.user, eye: I.ignored };
const PLATFORMS = ["Shopify", "WordPress", "Generic"] as const;
type Platform = (typeof PLATFORMS)[number];
type AiState = "none" | "gen" | "ready";

const SECONDARY_SM = "ease-ui h-8 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle";
const ICON_BTN = "ease-ui grid size-8 place-items-center rounded-full border-0 bg-transparent hover:bg-subtle";

function tabStyle(on: boolean) {
  return on ? "font-semibold text-ptext shadow-[inset_0_-2px_0_var(--primary)]" : "font-medium text-muted hover:text-ink";
}

/**
 * S-26 issue drawer. Right side 560px (full screen on mobile), focus moves to the title on open,
 * focus is trapped, Escape closes (handled by the parent), slide-in/out with GSAP.
 */
export function IssueDrawer({
  issue,
  rechecking,
  modalOpen,
  onClose,
  onExited,
  onRecheck,
  onIgnore,
  onReopen,
}: {
  issue: Issue | null;
  rechecking: boolean;
  modalOpen: boolean;
  onClose: () => void;
  onExited: () => void;
  onRecheck: () => void;
  onIgnore: () => void;
  onReopen: () => void;
}) {
  const [shown, setShown] = useState<Issue | null>(issue);
  const [dTab, setDTab] = useState(0);
  const [pf, setPf] = useState<Platform>("Shopify");
  const [copied, setCopied] = useState(false);
  const [ai, setAi] = useState<Record<string, AiState>>({});
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const shownId = shown?.id;
  const isOpen = !!issue;

  // Keep rendering the last issue while the exit animation plays.
  useEffect(() => {
    if (issue) setShown(issue);
  }, [issue]);

  useEffect(() => {
    setDTab(0);
    setPf("Shopify");
    setCopied(false);
  }, [shownId]);

  useFocusTrap(panel, isOpen && !modalOpen);

  // Enter / exit.
  useGSAP(
    () => {
      if (!shown || !panel.current || !scrim.current) return;
      const reduced = prefersReducedMotion();
      // Opacity (not autoAlpha) so the title stays focusable during the reduced-motion fade.
      const slide = reduced ? { opacity: 0 } : { xPercent: 100 };
      if (isOpen) {
        gsap.fromTo(scrim.current, { opacity: 0 }, { opacity: 1, duration: MOTION.panel, ease: MOTION.ease });
        gsap.fromTo(panel.current, slide, { xPercent: 0, opacity: 1, duration: MOTION.panel, ease: MOTION.ease });
        requestAnimationFrame(() => title.current?.focus());
      } else {
        gsap.to(scrim.current, { opacity: 0, duration: MOTION.panel, ease: MOTION.ease });
        gsap.to(panel.current, {
          ...slide,
          duration: MOTION.panel,
          ease: MOTION.ease,
          onComplete: () => {
            setShown(null);
            onExited();
          },
        });
      }
    },
    { dependencies: [isOpen, !!shown] },
  );

  // Cross-fade tab panel content.
  useGSAP(
    () => {
      if (!body.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(body.current!.children, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: MOTION.ease, stagger: 0.03, clearProps: "transform" });
      });
      return () => mm.revert();
    },
    { dependencies: [dTab, pf, shownId] },
  );

  if (!shown) return null;
  const cur = shown;
  const active = cur.status === "open" || cur.status === "regressed" || cur.status === "needsReview";
  const aiState: AiState = ai[cur.id] ?? "none";

  let steps: string[] = [];
  let code = cur.gen;
  let lang = "HTML";
  if (pf === "Shopify") {
    steps = cur.steps;
    code = cur.code;
    lang = "Liquid";
  } else if (pf === "Generic") {
    steps = ["Find the element using the selector in “Where it occurs”.", "Apply the change shown below.", "Rescan to confirm."];
  }

  const history: [HistoryKind, string, string][] = [
    ...(cur.history ?? [
      ["found", "First found", cur.first] as [HistoryKind, string, string],
      ...(cur.assignee ? [["user", `Assigned to ${NAMES[cur.assignee]}, ${cur.due?.toLowerCase()}`, "Daniel Mwangi"] as [HistoryKind, string, string]] : []),
    ]),
    ...(cur.status === "fixed" ? [["ok", "Fixed by recheck", "Daniel Mwangi · Today"] as [HistoryKind, string, string]] : []),
    ...(cur.status === "ignored" ? [["eye", `Ignored: ${cur.ignoreReason}`, "Daniel Mwangi · Today"] as [HistoryKind, string, string]] : []),
  ];

  const genAi = () => {
    const id = cur.id;
    setAi((a) => ({ ...a, [id]: "gen" }));
    setTimeout(() => setAi((a) => ({ ...a, [id]: "ready" })), 1400);
  };

  return (
    <>
      <div ref={scrim} onClick={onClose} className="fixed inset-0 z-20 bg-scrim" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed inset-y-0 right-0 z-[21] flex w-full flex-col border-l border-line bg-surface shadow-dialog sm:w-[min(560px,100vw)] sm:rounded-l-xl"
      >
        <div className="flex flex-col gap-3 px-4 pt-5 sm:px-6">
          <div className="flex items-center gap-2">
            <SeverityBadge sev={cur.sev} />
            <span className="inline-flex items-center gap-1 rounded border border-line-strong px-2 py-px text-[13px] leading-5 font-medium">
              {STATUS_LABEL[cur.status]}
            </span>
            <span className="flex-1" />
            <button type="button" aria-label="Copy link to this issue" title="Copy link" className={`${ICON_BTN} text-muted`}>
              <Icon d={I.link} size={18} />
            </button>
            <button type="button" aria-label="Open in full page" title="Open in full page" className={`${ICON_BTN} text-muted`}>
              <Icon d={I.expand} size={18} />
            </button>
            <button type="button" onClick={onClose} aria-label="Close issue details" title="Close (Esc)" className={`${ICON_BTN} text-ink`}>
              <Icon d={I.close} size={20} />
            </button>
          </div>
          <h2 id="drawer-title" ref={title} tabIndex={-1} className="m-0 text-2xl leading-8 font-semibold text-pretty outline-none focus-visible:outline-2">
            {cur.title}
          </h2>
          <div className="text-sm leading-5 text-muted">
            {cur.template} · <span className="font-mono text-[13px]">{cur.rule}</span> · WCAG {cur.wcag.split(" ")[0]}
          </div>

          {cur.status === "fixed" && (
            <div role="status" className="flex items-start gap-2.5 rounded-lg bg-ok-soft px-4 py-3 text-sm leading-5 font-medium text-ok">
              <Icon d={I.fixed} size={18} className="flex-none" />
              Fixed today in a recheck of {Math.min(cur.pages, 3)} pages. Logged in your evidence.
            </div>
          )}
          {cur.status === "ignored" && (
            <div className="flex items-center gap-2.5 rounded-lg bg-min-soft px-4 py-3 text-sm leading-5 text-ink">
              <span className="flex-1">Ignored — {cur.ignoreReason}. It stays in your evidence log.</span>
              <button type="button" onClick={onReopen} className={SECONDARY_SM}>
                Reopen
              </button>
            </div>
          )}
          {active && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRecheck}
                disabled={rechecking}
                className="ease-ui flex h-8 items-center gap-1.5 rounded-full border-0 bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-80"
              >
                {rechecking && <span className="size-3.5 animate-spin rounded-full border-2 border-on-primary border-r-transparent" aria-hidden="true" />}
                {rechecking ? "Rechecking 3 pages…" : "Recheck"}
              </button>
              <button type="button" className={SECONDARY_SM}>
                {cur.assignee ? `Assigned: ${NAMES[cur.assignee]}` : "Assign"}
              </button>
              <button type="button" className={SECONDARY_SM}>
                {cur.due ?? "Set due date"}
              </button>
              <button type="button" onClick={onIgnore} data-ignore-btn className={`${SECONDARY_SM} flex items-center gap-1.5`}>
                <Icon d={I.ignored} />
                Ignore
              </button>
            </div>
          )}

          <div role="tablist" aria-label="Issue details" className="mt-1 flex gap-1 overflow-x-auto border-b border-line">
            {DRAWER_TABS.map((l, i) => (
              <button
                key={l}
                type="button"
                role="tab"
                id={`dtab-${i}`}
                aria-selected={i === dTab}
                aria-controls="dpanel"
                onClick={() => setDTab(i)}
                className={`ease-ui flex-none border-0 bg-transparent p-2.5 text-sm ${tabStyle(i === dTab)}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={body}
          id="dpanel"
          role="tabpanel"
          aria-labelledby={`dtab-${dTab}`}
          className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 text-base leading-6 sm:p-6 [&>*]:shrink-0"
        >
          {dTab === 0 && (
            <>
              <section className="flex flex-col gap-1">
                <h3 className="m-0 text-base leading-6 font-semibold">Who this affects</h3>
                <p className="m-0 text-pretty">{cur.who}</p>
              </section>
              <section className="flex flex-col gap-1">
                <h3 className="m-0 text-base leading-6 font-semibold">Why it matters</h3>
                <p className="m-0 text-pretty">{cur.why}</p>
              </section>
              <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2.5 rounded-lg bg-subtle p-4 text-sm leading-5 sm:grid-cols-[140px_1fr]">
                <dt className="text-muted">WCAG criterion</dt>
                <dd className="m-0">
                  <a href="#">{cur.wcag}</a>
                </dd>
                <dt className="text-muted">Where</dt>
                <dd className="m-0">
                  {cur.template} — {cur.pages} {cur.pages === 1 ? "page" : "pages"}
                </dd>
                <dt className="text-muted">First seen</dt>
                <dd className="m-0">{cur.first}</dd>
                <dt className="text-muted">Last seen</dt>
                <dd className="m-0">{cur.last}</dd>
              </dl>
            </>
          )}

          {dTab === 1 && (
            <>
              <p className="m-0 text-sm leading-5 text-muted">{cur.axe}</p>
              <ul className="m-0 list-none overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-card">
                {cur.occs.map(([url, sel], i) => (
                  <li key={url + sel} className={`flex items-center gap-3 px-4 py-3 ${i < cur.occs.length - 1 ? "border-b border-line" : ""}`}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm leading-5 [overflow-wrap:anywhere]">oakhaus.com{url}</span>
                      <code className="font-mono text-[13px] leading-[18px] text-muted [overflow-wrap:anywhere]">{sel}</code>
                    </span>
                    <a href={`https://oakhaus.com${url}`} target="_blank" rel="noreferrer" className="text-sm font-semibold whitespace-nowrap">
                      Open page<span className="sr-only"> (opens in new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-base leading-6 font-semibold">HTML on the first page</h3>
                <pre className="m-0 rounded-lg bg-sunk p-4 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{cur.snippet}</pre>
              </div>
            </>
          )}

          {dTab === 2 && (
            <>
              <div role="tablist" aria-label="Platform" className="inline-flex self-start overflow-hidden rounded-full border border-line-strong">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={pf === p}
                    onClick={() => {
                      setPf(p);
                      setCopied(false);
                    }}
                    className={`ease-ui h-8 border-0 px-3.5 text-sm font-semibold ${pf === p ? "bg-primary text-on-primary" : "bg-surface text-ink hover:bg-subtle"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {steps.length > 0 ? (
                <ol className="m-0 flex flex-col gap-2 pl-6 text-pretty">
                  {steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-pretty text-muted">
                  We don&apos;t have a written WordPress guide for this problem yet. The generic fix applies to any theme, or ask for an AI suggestion below.
                </p>
              )}
              <div className="flex flex-col overflow-hidden rounded-xl border border-line">
                <div className="flex items-center justify-between border-b border-line bg-subtle py-1.5 pr-2 pl-4">
                  <span className="text-xs leading-4 font-medium text-muted">{lang}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(code).catch(() => {});
                      setCopied(true);
                    }}
                    className="ease-ui h-7 rounded border border-line-strong bg-surface px-2.5 text-[13px] font-semibold text-ink hover:bg-subtle"
                  >
                    <span aria-live="polite">{copied ? "Copied" : "Copy code"}</span>
                  </button>
                </div>
                <pre className="m-0 bg-sunk p-4 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{code}</pre>
              </div>
              <section className="flex flex-col gap-1">
                <h3 className="m-0 text-base leading-6 font-semibold">How to check your fix</h3>
                <p className="m-0 text-pretty">{cur.check}</p>
              </section>
              <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary-soft px-2 py-0.5 text-[13px] leading-5 font-semibold text-ptext">AI suggestion</span>
                  <span className="text-sm text-muted">Check before applying</span>
                </div>
                {aiState === "none" && (
                  <>
                    <p className="m-0 text-sm leading-5 text-muted">Get a suggestion written for this exact element. 37 of 50 suggestions left this month.</p>
                    <button type="button" onClick={genAi} className={`${SECONDARY_SM} self-start`}>
                      Generate suggestion
                    </button>
                  </>
                )}
                {aiState === "gen" && (
                  <p role="status" className="m-0 text-sm text-muted">
                    Writing a suggestion…
                  </p>
                )}
                {aiState === "ready" && (
                  <>
                    <p role="status" className="m-0 text-sm leading-5 text-pretty">
                      {cur.ai ?? "Apply the generic fix to this element; the exact text depends on what the element does on your page."}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <button type="button" className="border-0 bg-transparent p-0 font-semibold text-ptext">
                        Copy
                      </button>
                      <button type="button" className="border-0 bg-transparent p-0 text-muted underline underline-offset-2">
                        Report a bad suggestion
                      </button>
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {dTab === 3 && (
            <>
              <ol className="m-0 flex list-none flex-col p-0">
                {history.map(([k, t, m]) => (
                  <li key={t + m} className="grid grid-cols-[32px_1fr] gap-3 pb-5">
                    <span className={`grid size-8 place-items-center rounded-full border border-line bg-subtle ${k === "ok" ? "text-ok" : "text-muted"}`}>
                      <Icon d={HISTORY_ICON[k]} />
                    </span>
                    <span className="flex flex-col pt-1">
                      <span className="font-medium">{t}</span>
                      <span className="text-sm leading-5 text-muted">{m}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2">
                <label htmlFor="note" className="font-semibold">
                  Add a note
                </label>
                <textarea id="note" rows={3} className="resize-y rounded border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="m-0 size-[18px] accent-ptext" />
                    Visible to client
                  </label>
                  <button type="button" className={SECONDARY_SM}>
                    Add note
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
