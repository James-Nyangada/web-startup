"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { SeverityBadge, BandBadge } from "@/components/badges";
import { Collapse } from "@/components/disclosure";
import { SEV, type Severity } from "@/lib/severity";
import { CHECK_STEPS } from "@/lib/home-data";
import {
  freeChecksClient,
  type FreeCheckRecord,
  type FreeCheckIssue,
} from "@/lib/free-checks-client";
import { TurnstileWidget } from "./turnstile-widget";

interface FreeCheckFlowProps {
  initialCheckId?: string;
  initialUrl?: string;
  onCheckCreated?: (checkId: string) => void;
}

export function FreeCheckFlow({
  initialCheckId,
  initialUrl = "soraskin.co",
  onCheckCreated,
}: FreeCheckFlowProps) {
  const router = useRouter();

  const [phase, setPhase] = useState<"input" | "progress" | "result">(
    initialCheckId ? "progress" : "input",
  );
  const [url, setUrl] = useState(initialUrl);
  const [urlError, setUrlError] = useState<string | null>(null);

  // ?url= prefill, read after mount rather than with useSearchParams: that hook makes the
  // static build skip the whole form, so crawlers would only see the loading fallback.
  useEffect(() => {
    const queryUrl = new URLSearchParams(window.location.search).get("url");
    if (queryUrl && !initialCheckId) {
      setUrl(queryUrl);
    }
  }, [initialCheckId]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [checkId, setCheckId] = useState<string | null>(initialCheckId || null);

  const [checkData, setCheckData] = useState<FreeCheckRecord | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [progressError, setProgressError] = useState<string | null>(null);

  const [openIssueIndex, setOpenIssueIndex] = useState<number>(-1);
  const [copiedLink, setCopiedLink] = useState(false);

  // Email capture state
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailMessage, setEmailMessage] = useState("");

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  // If initialCheckId is provided on mount, fetch it immediately
  useEffect(() => {
    if (initialCheckId) {
      setCheckId(initialCheckId);
      setPhase("progress");
      pollCheckStatus(initialCheckId);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [initialCheckId]);

  // Focus result heading when entering result phase
  useEffect(() => {
    if (phase === "result") {
      resultHeadingRef.current?.focus();
    }
  }, [phase]);

  // Polling loop for active check
  const pollCheckStatus = async (id: string, attempt = 0) => {
    try {
      const record = await freeChecksClient.getCheck(id);
      setUrl(record.url);

      if (record.status === "completed" && record.result) {
        setCheckData(record);
        setProgressStep(2);
        setPhase("result");
      } else if (record.status === "failed") {
        setProgressError(
          record.errorMessage ||
            "The scan could not reach or evaluate this website. Please verify the URL and try again.",
        );
      } else {
        // Pending or Running
        if (attempt > 0) {
          setProgressStep(1);
        }
        pollTimerRef.current = setTimeout(() => {
          pollCheckStatus(id, attempt + 1);
        }, 2000);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to retrieve scan status. Please check your connection.";
      setProgressError(message);
    }
  };

  const handleStartCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);
    setProgressError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError("Please enter a website address.");
      return;
    }

    // Client URL format validation
    const candidate = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname.includes(".")) {
        setUrlError("Enter a valid web domain, e.g. yourstore.com");
        return;
      }
      if (
        parsed.hostname === "localhost" ||
        parsed.hostname.startsWith("127.") ||
        parsed.hostname.startsWith("10.") ||
        parsed.hostname.startsWith("192.168.") ||
        parsed.hostname === "169.254.169.254"
      ) {
        setUrlError("Internal or private addresses cannot be scanned.");
        return;
      }
    } catch {
      setUrlError("Enter a valid web address, e.g. yourstore.com");
      return;
    }

    setPhase("progress");
    setProgressStep(0);

    try {
      const created = await freeChecksClient.createCheck(
        candidate,
        turnstileToken || undefined,
      );
      setCheckId(created.checkId);
      if (onCheckCreated) {
        onCheckCreated(created.checkId);
      } else {
        // Update URL shallowly or navigate to /check/:checkId
        router.push(`/check/${created.checkId}`);
      }
      pollCheckStatus(created.checkId);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to initiate accessibility check. Please try again.";
      setPhase("input");
      setUrlError(msg);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkId || !email.trim()) return;

    setEmailStatus("sending");
    try {
      const res = await freeChecksClient.emailReport(checkId, email.trim(), consent);
      setEmailStatus("sent");
      setEmailMessage(res.message || `Full PDF report sent to ${email.trim()}.`);
    } catch (err: unknown) {
      setEmailStatus("error");
      setEmailMessage(
        err instanceof Error ? err.message : "Failed to email report. Please try again.",
      );
    }
  };

  const handleCopyLink = async () => {
    if (typeof window === "undefined" || !checkId) return;
    const shareUrl = `${window.location.origin}/check/${checkId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      // Fallback
    }
  };

  const resetFlow = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setPhase("input");
    setCheckId(null);
    setCheckData(null);
    setProgressError(null);
    setUrlError(null);
    setEmailStatus("idle");
    setEmailMessage("");
    router.push("/check");
  };

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      {/* PHASE 1: URL INPUT FORM */}
      {phase === "input" && (
        <section aria-labelledby="check-heading" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
              Free Website Accessibility Checker
            </span>
            <h1
              id="check-heading"
              className="m-0 max-w-[880px] font-serif text-[42px] leading-[46px] font-normal tracking-[-0.01em] sm:text-[54px] sm:leading-[58px]"
            >
              Test any web page against <em>WCAG 2.2 AA</em>
            </h1>
            <p className="m-0 max-w-[680px] text-lg leading-7 text-pretty text-muted">
              Fast, automated scan for online stores and digital products. Discover color contrast
              failures, missing image labels, keyboard accessibility violations, and get
              plain-English guidance to fix them.
            </p>
          </div>

          <form onSubmit={handleStartCheck} noValidate className="flex max-w-[640px] flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="url-input" className="text-sm font-semibold text-ink">
                Website or page URL
              </label>
              <div className="flex flex-wrap gap-3">
                <div
                  className={`flex h-12 flex-[1_1_320px] overflow-hidden rounded-full bg-surface ${
                    urlError ? "border-2 border-crit" : "border border-line-strong"
                  } focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20`}
                >
                  <span className="grid place-items-center border-r border-line bg-subtle px-3 text-base text-muted select-none">
                    https://
                  </span>
                  <input
                    id="url-input"
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setUrlError(null);
                    }}
                    aria-invalid={Boolean(urlError)}
                    aria-describedby={urlError ? "url-error url-desc" : "url-desc"}
                    placeholder="yourstore.com"
                    autoComplete="url"
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 text-base text-ink outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="ease-ui h-12 rounded-full border-0 bg-primary px-7 text-base font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Run free check
                </button>
              </div>
            </div>

            {urlError && (
              <p id="url-error" role="alert" className="flex items-center gap-1.5 text-sm font-medium text-crit">
                <Icon d={I.critical} size={16} />
                {urlError}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} />
              <p id="url-desc" className="m-0 text-xs text-muted">
                Checks one public page in ~30 seconds. No cookies or scripts placed on your site.
                Stored securely for 30 days.
              </p>
            </div>
          </form>
        </section>
      )}

      {/* PHASE 2: PROGRESS STATE */}
      {phase === "progress" && (
        <section aria-labelledby="progress-heading" className="flex max-w-[640px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
              Scan in progress
            </span>
            <h1
              id="progress-heading"
              className="m-0 font-serif text-[36px] leading-10 font-normal break-words sm:text-[44px] sm:leading-[48px]"
            >
              Checking {url}
            </h1>
            <p className="m-0 text-muted">
              EveryVisitorBot is evaluating WCAG 2.2 Level AA accessibility rules. This usually takes
              20–45 seconds.
            </p>
          </div>

          {progressError ? (
            <div role="alert" className="flex flex-col gap-4 rounded-2xl border border-crit/30 bg-crit-soft/20 p-6">
              <div className="flex items-start gap-3">
                <Icon d={I.critical} size={24} className="mt-0.5 text-crit" />
                <div>
                  <h2 className="m-0 text-base font-semibold text-crit">Check failed</h2>
                  <p className="mt-1 mb-0 text-sm leading-5 text-ink">{progressError}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetFlow}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                >
                  Try another web address
                </button>
              </div>
            </div>
          ) : (
            <ol role="status" aria-live="polite" className="m-0 flex list-none flex-col gap-3 p-0">
              {CHECK_STEPS.map((label, idx) => {
                const isDone = idx < progressStep;
                const isCurrent = idx === progressStep;
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-3.5 rounded-full border border-line px-5 py-4 transition-all ${
                      isCurrent
                        ? "border-primary/50 bg-primary-soft/40 shadow-sm"
                        : isDone
                        ? "bg-surface text-ink"
                        : "bg-surface/50 text-muted"
                    }`}
                  >
                    <span
                      className={`grid size-6 place-items-center rounded-full border-2 text-[13px] font-bold ${
                        isDone
                          ? "border-ok bg-ok-soft/30 text-ok"
                          : isCurrent
                          ? "border-primary text-primary"
                          : "border-line text-muted"
                      }`}
                    >
                      {isDone ? "✓" : idx + 1}
                    </span>
                    <span className={`flex-1 text-base ${isCurrent ? "font-semibold text-ink" : ""}`}>
                      {label}
                    </span>
                    <span className="text-sm font-medium text-muted">
                      {isDone ? "Done" : isCurrent ? "Analyzing..." : "Pending"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={resetFlow}
              className="text-sm font-semibold text-muted underline hover:text-ink"
            >
              Cancel check
            </button>
          </div>
        </section>
      )}

      {/* PHASE 3: COMPLETED RESULT */}
      {phase === "result" && checkData && checkData.result && (
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_380px]">
          {/* Main Column */}
          <main className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
                  Accessibility Audit Report
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  aria-live="polite"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink shadow-sm hover:bg-subtle"
                >
                  <Icon d={copiedLink ? I.fixed : I.share} size={14} />
                  {copiedLink ? "Link copied!" : "Share report"}
                </button>
                <Link
                  href={`/sign-up?url=${encodeURIComponent(checkData.url)}&checkId=${encodeURIComponent(checkData.id)}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary-hover no-underline"
                >
                  <Icon d={I.globe} size={14} />
                  <span>Monitor this site</span>
                </Link>
              </div>

              <h1
                ref={resultHeadingRef}
                tabIndex={-1}
                className="m-0 font-serif text-[36px] leading-10 font-normal break-words sm:text-[46px] sm:leading-[50px] outline-none"
              >
                Results for {checkData.domain}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="font-mono">{checkData.url}</span>
                <span>•</span>
                <span>
                  Checked {new Date(checkData.result.checkedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {checkData.result.loadMs && (
                  <>
                    <span>•</span>
                    <span>Loaded in {checkData.result.loadMs} ms</span>
                  </>
                )}
              </div>
            </div>

            {/* Score & Counts Card */}
            <section
              aria-labelledby="score-card-title"
              className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card"
            >
              <div className="flex flex-col gap-1.5">
                <h2 id="score-card-title" className="m-0 text-sm font-semibold text-muted">
                  Automated check score
                </h2>
                <div className="flex items-baseline gap-3">
                  <span
                    className="font-mono text-[48px] leading-[48px] font-bold tracking-tight text-ink"
                    aria-label={`Score: ${checkData.result.score} out of 100`}
                  >
                    {checkData.result.score}
                  </span>
                  <BandBadge score={checkData.result.score} className="px-2.5 py-1 text-base" />
                </div>
              </div>

              {/* Severity Counts Grid */}
              <div
                role="group"
                aria-label="Issues by severity"
                className="flex flex-wrap items-center gap-2"
              >
                {(
                  [
                    ["critical", checkData.result.counts.critical],
                    ["serious", checkData.result.counts.serious],
                    ["moderate", checkData.result.counts.moderate],
                    ["minor", checkData.result.counts.minor],
                  ] as [Severity, number][]
                ).map(([sev, count]) => {
                  const s = SEV[sev];
                  return (
                    <div
                      key={sev}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${s.bg} ${s.text}`}
                    >
                      <Icon d={s.icon} size={16} />
                      <span className="font-mono">{count}</span>
                      <span>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Top Problems Accordion */}
            <section aria-labelledby="top-issues-heading" className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 id="top-issues-heading" className="m-0 text-2xl font-semibold">
                  Top accessibility barriers ({checkData.result.topIssues.length})
                </h2>
                <span className="text-xs text-muted">Ranked by severity & occurrences</span>
              </div>

              {checkData.result.topIssues.length === 0 ? (
                <div className="rounded-2xl border border-ok/30 bg-ok-soft/20 p-8 text-center">
                  <p className="m-0 text-base font-semibold text-ok">
                    No automated WCAG 2.2 AA violations found on this page!
                  </p>
                  <p className="mt-1 mb-0 text-sm text-muted">
                    Remember that automated tools verify ~30-40% of WCAG guidelines. Manual keyboard
                    and screen reader testing are still recommended.
                  </p>
                </div>
              ) : (
                <ul className="m-0 list-none overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-card">
                  {checkData.result.topIssues.map((issue: FreeCheckIssue, idx: number) => {
                    const isOpen = openIssueIndex === idx;
                    const issueId = `issue-${idx}`;
                    return (
                      <li
                        key={`${issue.ruleId}-${idx}`}
                        className="border-b border-line last:border-b-0"
                      >
                        <h3 className="m-0">
                          <button
                            type="button"
                            onClick={() => setOpenIssueIndex(isOpen ? -1 : idx)}
                            aria-expanded={isOpen}
                            aria-controls={issueId}
                            className="ease-ui grid w-full grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-3 border-0 bg-transparent px-5 py-4 text-left text-base font-medium text-ink hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                          >
                            <SeverityBadge sev={issue.impact} />
                            <span className="truncate pr-2 font-medium">{issue.title}</span>
                            <span className="font-mono text-sm text-muted">
                              {issue.occurrences}×
                            </span>
                          </button>
                        </h3>

                        <Collapse open={isOpen}>
                          <div
                            id={issueId}
                            className="flex flex-col gap-3 px-5 pb-5 pt-1 text-sm leading-6 border-t border-line/40 bg-subtle/30 sm:pl-[120px]"
                          >
                            <div>
                              <strong className="text-ink">Who is affected: </strong>
                              <span className="text-muted">{issue.whoIsAffected}</span>
                            </div>

                            {issue.wcagCriteria.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-muted">WCAG:</span>
                                {issue.wcagCriteria.map((crit) => (
                                  <span
                                    key={crit}
                                    className="rounded bg-surface px-2 py-0.5 font-mono text-xs text-muted border border-line"
                                  >
                                    {crit}
                                  </span>
                                ))}
                              </div>
                            )}

                            {issue.htmlSnippet && (
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-xs font-semibold text-muted">HTML snippet:</span>
                                <pre className="m-0 overflow-x-auto rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink">
                                  <code>{issue.htmlSnippet}</code>
                                </pre>
                              </div>
                            )}

                            {issue.selector && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted">Selector:</span>
                                <code className="break-all rounded bg-surface px-2 py-1 font-mono text-xs text-muted border border-line">
                                  {issue.selector}
                                </code>
                              </div>
                            )}

                            <div className="pt-2">
                              <Link
                                href={`/fix`}
                                className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover no-underline"
                              >
                                View step-by-step fix guide →
                              </Link>
                            </div>
                          </div>
                        </Collapse>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </main>

          {/* Sidebar Column */}
          <aside className="flex flex-col gap-6">
            {/* What this check cannot tell you */}
            <section
              aria-labelledby="limitations-heading"
              className="flex flex-col gap-3 rounded-2xl border border-line bg-subtle p-6"
            >
              <h2 id="limitations-heading" className="m-0 text-base font-semibold text-ink">
                What this check can&apos;t tell you
              </h2>
              <ul className="m-0 flex flex-col gap-2 pl-5 text-sm leading-5 text-muted">
                <li>Whether your site works with a keyboard alone</li>
                <li>Whether image alt text and form labels actually make sense</li>
                <li>Problems on your other pages, product carts, and checkouts</li>
                <li>Whether your site complies with the law (no automated tool can certify compliance)</li>
              </ul>
            </section>

            {/* Email PDF report card (E-13) */}
            <section
              aria-labelledby="email-heading"
              className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card"
            >
              <h2 id="email-heading" className="m-0 text-base font-semibold text-ink">
                Email me the full report (PDF)
              </h2>

              {emailStatus === "sent" ? (
                <div role="status" className="rounded-lg bg-ok-soft/30 border border-ok/30 p-4 text-sm font-medium text-ok">
                  <p className="m-0 font-semibold">{emailMessage}</p>
                  <p className="mt-1 mb-0 text-xs text-muted">
                    Check your spam folder if it doesn&apos;t appear within 2 minutes.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSendEmail} noValidate className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="report-email" className="text-xs font-semibold text-ink">
                      Email address (required)
                    </label>
                    <input
                      id="report-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="grace@soraskin.co"
                      className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 text-xs leading-4 text-muted select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 size-4 rounded accent-primary"
                    />
                    Also send me occasional tips on fixing ecommerce accessibility barriers. Unsubscribe anytime.
                  </label>

                  {emailStatus === "error" && (
                    <p role="alert" className="m-0 text-xs text-crit font-medium">
                      {emailMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={emailStatus === "sending" || !email.trim()}
                    className="ease-ui h-10 rounded-full border border-line bg-surface text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50"
                  >
                    {emailStatus === "sending" ? "Sending PDF..." : "Send full PDF report"}
                  </button>
                </form>
              )}
            </section>

            {/* Trial CTA with prefilled URL (P3-08 hook) */}
            <section
              aria-labelledby="trial-cta-heading"
              className="flex flex-col gap-4 rounded-2xl bg-ink p-6 text-surface shadow-md"
            >
              <h2 id="trial-cta-heading" className="m-0 font-serif text-2xl font-normal leading-7 text-surface">
                Monitor your whole storefront, 14 days free
              </h2>
              <p className="m-0 text-sm leading-5 text-surface/80">
                We&apos;ll scan up to 250 pages weekly, track your progress score, generate compliance evidence packs, and alert you before regressions reach production.
              </p>
              <Link
                href={`/sign-up?url=${encodeURIComponent(checkData.url)}&checkId=${encodeURIComponent(checkData.id)}`}
                className="ease-ui flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Monitor this site: Start 14-day free trial
              </Link>
            </section>

            <button
              type="button"
              onClick={resetFlow}
              className="self-start text-sm font-semibold text-primary hover:text-primary-hover underline"
            >
              ← Check another website
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
