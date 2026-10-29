"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { SeverityBadge } from "@/components/badges";
import { CodeSnippet } from "./code-snippet";
import { getWcagUnderstandingUrl } from "@/lib/wcag";
import { GuideRenderer } from "@/components/marketing/guide-renderer";
import { getFixGuideByRuleAndPlatform } from "@/lib/fix-guides-data";
import { getPlatformDeepLinks } from "@/lib/platform-deep-links";
import { apiClient, ApiException } from "@/lib/api";
import { appApi, formatDayTime, type ApiMember } from "@/lib/app-api";
import { DRAWER_TABS, type HistoryKind, type Issue } from "@/lib/site-data";

const STATUS_LABEL = {
  open: "Open",
  regressed: "Regressed",
  needsReview: "Needs review",
  fixed: "Fixed",
  ignored: "Ignored",
} as const;

const HISTORY_ICON: Record<HistoryKind, string> = {
  found: I.search,
  ok: I.fixed,
  reg: I.regressed,
  user: I.user,
  eye: I.ignored,
};

const PLATFORMS = ["Shopify", "WordPress", "Generic"] as const;
type Platform = (typeof PLATFORMS)[number];
type AiState = "none" | "gen" | "ready" | "reported" | "cap_reached" | "error";

const AI_LANG_LABELS: Record<string, string> = {
  tsx: "TSX",
  jsx: "JSX",
  html: "HTML",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  blade: "Blade",
  twig: "Twig",
  django: "Django",
  erb: "ERB",
  cshtml: "Razor",
  php: "PHP",
  liquid: "Liquid",
  handlebars: "Handlebars",
};

function parseAiSuggestion(markdown: string) {
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]+?)\n```/;
  const match = codeBlockRegex.exec(markdown);
  if (!match) {
    return { before: markdown, after: "", code: null, lang: "HTML" };
  }
  const [fullMatch, detectedLang, extractedCode] = match;
  const parts = markdown.split(fullMatch);
  const key = (detectedLang ?? "").toLowerCase();
  const lang = AI_LANG_LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "HTML");
  return {
    before: parts[0]?.trim() || "",
    after: parts[1]?.trim() || "",
    code: extractedCode.trim(),
    lang,
  };
}

/** Renders `**Label:** text` paragraphs and `inline code` from the AI answer. */
function AiProse({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const inline = (value: string) =>
    value.split(/(`[^`]+`)/g).map((part, i) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
        <code key={i} className="rounded bg-sunk px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      ) : (
        part
      ),
    );
  return (
    <div className="flex flex-col gap-2">
      {paragraphs.map((paragraph, i) => {
        const labelled = /^\*\*([^*]+?):?\*\*:?\s*([\s\S]*)$/.exec(paragraph);
        return (
          <p key={i} className="m-0 text-sm leading-5 text-pretty text-ink">
            {labelled ? (
              <>
                <span className="font-semibold">{labelled[1]}: </span>
                {inline(labelled[2] ?? "")}
              </>
            ) : (
              inline(paragraph)
            )}
          </p>
        );
      })}
    </div>
  );
}

const SECONDARY_SM =
  "ease-ui h-8 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle focus-visible:ring-2 focus-visible:ring-primary";
const ICON_BTN =
  "ease-ui grid size-8 place-items-center rounded-full border-0 bg-transparent hover:bg-subtle focus-visible:ring-2 focus-visible:ring-primary";

function tabStyle(on: boolean) {
  return on
    ? "font-semibold text-ptext shadow-[inset_0_-2px_0_var(--primary)]"
    : "font-medium text-muted hover:text-ink";
}

export interface IssueNoteItem {
  id: string;
  authorName: string;
  body: string;
  visibleToClient: boolean;
  createdAt: string;
}

export interface IssueDetailContentProps {
  issue: Issue;
  sitePlatform?: string;
  siteRootUrl?: string;
  orgSlug?: string;
  rechecking: boolean;
  onRecheck: () => void;
  onIgnore: () => void;
  onReopen: () => void;
  onClose?: () => void;
  isFullPage?: boolean;
  siteHref?: string;
  titleRef?: React.Ref<HTMLHeadingElement>;
  members?: ApiMember[];
  onAssign?: (assigneeId: string | null) => void;
  onSetDue?: (dueDate: string | null) => void;
}

export function IssueDetailContent({
  issue,
  sitePlatform,
  siteRootUrl,
  orgSlug,
  rechecking,
  onRecheck,
  onIgnore,
  onReopen,
  onClose,
  isFullPage = false,
  siteHref,
  titleRef,
  members = [],
  onAssign,
  onSetDue,
}: IssueDetailContentProps) {
  const [dTab, setDTab] = useState(0);
  const sitePf = sitePlatform?.toLowerCase() ?? "";
  const initialPlatform: Platform = sitePf.includes("wordpress") || sitePf.includes("woocommerce")
    ? "WordPress"
    : sitePf.includes("shopify")
      ? "Shopify"
      : "Generic";
  const [pf, setPf] = useState<Platform>(initialPlatform);

  const deepLink = getPlatformDeepLinks({
    platform: pf !== "Generic" ? pf : sitePlatform,
    rootUrl: siteRootUrl,
    template: issue.template,
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [aiState, setAiState] = useState<AiState>("none");
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(issue.ai ?? null);
  const [aiCacheKey, setAiCacheKey] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedSuggestion, setCopiedSuggestion] = useState(false);
  const [reportingAi, setReportingAi] = useState(false);

  // Occurrences pagination
  const [occPage, setOccPage] = useState(1);
  const occPageSize = 5;

  // Notes state
  const [notes, setNotes] = useState<IssueNoteItem[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);

  const active =
    issue.status === "open" ||
    issue.status === "regressed" ||
    issue.status === "needsReview";

  let steps: string[] = [];
  let code = issue.gen;
  let lang = "HTML";
  if (pf === "Shopify") {
    steps = issue.steps;
    code = issue.code;
    lang = "Liquid";
  } else if (pf === "Generic") {
    steps = [
      "Find the element using the selector in “Where it occurs”.",
      "Apply the change shown below.",
      "Rescan to confirm.",
    ];
  }

  // Timeline from issue_events, loaded by the parent; first sighting as a fallback.
  const history: [HistoryKind, string, string][] = issue.history ?? [
    ["found", "First found", issue.first],
  ];

  const resolvedOrgSlug =
    orgSlug || (siteHref ? siteHref.split("/").filter(Boolean)[0] : undefined);

  useEffect(() => {
    if (!resolvedOrgSlug) return;
    let cancelled = false;
    appApi
      .listNotes(resolvedOrgSlug, issue.id)
      .then((items) => {
        if (cancelled) return;
        setNotes(
          items.map((n) => ({
            id: n.id,
            authorName: n.authorName ?? "Former member",
            body: n.body,
            visibleToClient: n.visibleToClient,
            createdAt: formatDayTime(n.createdAt),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedOrgSlug, issue.id]);

  const genAi = async () => {
    setAiState("gen");
    setAiError(null);
    try {
      if (resolvedOrgSlug) {
        const res = await apiClient<{ suggestion: string; cached: boolean; cacheKey: string }>(
          `/v1/orgs/${resolvedOrgSlug}/issues/${issue.id}/ai-suggestion`,
          {
            method: "POST",
            body: JSON.stringify({ platform: pf }),
          },
        );
        setAiSuggestion(res.suggestion);
        setAiCacheKey(res.cacheKey);
        setAiState("ready");
      }
    } catch (err: any) {
      if (err instanceof ApiException && (err.status === 422 || err.code === "PLAN_LIMIT")) {
        setAiState("cap_reached");
      } else {
        setAiError(err.message || "Failed to generate AI suggestion");
        setAiState("error");
      }
    }
  };

  const reportAi = async () => {
    setReportingAi(true);
    try {
      if (resolvedOrgSlug && aiCacheKey) {
        await apiClient(`/v1/orgs/${resolvedOrgSlug}/issues/${issue.id}/ai-suggestion/report`, {
          method: "POST",
          body: JSON.stringify({ cacheKey: aiCacheKey, platform: pf }),
        });
      }
      setAiState("reported");
    } catch {
      setAiState("reported");
    } finally {
      setReportingAi(false);
    }
  };

  const onCopyLink = () => {
    if (typeof window !== "undefined") {
      const fullUrl = `${window.location.origin}${siteHref ? `${siteHref}/issues/${issue.id}` : window.location.pathname}`;
      navigator.clipboard?.writeText(fullUrl).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim() || !resolvedOrgSlug) return;

    try {
      const saved = await appApi.addNote(resolvedOrgSlug, issue.id, noteBody.trim(), visibleToClient);
      setNotes((prev) => [
        ...prev,
        {
          id: saved.id,
          authorName: saved.authorName ?? "You",
          body: saved.body,
          visibleToClient: saved.visibleToClient,
          createdAt: formatDayTime(saved.createdAt),
        },
      ]);
      setNoteBody("");
      setVisibleToClient(false);
      setShowMarkdownPreview(false);
      setNoteStatus("Note added.");
    } catch (err) {
      setNoteStatus(err instanceof ApiException ? err.message : "Could not save the note.");
    }
    setTimeout(() => setNoteStatus(null), 3000);
  };

  // Occurrences slicing
  const allOccs = issue.occs ?? [];
  const totalOccs = allOccs.length;
  const totalOccPages = Math.ceil(totalOccs / occPageSize) || 1;
  const currentOccs = allOccs.slice(
    (occPage - 1) * occPageSize,
    occPage * occPageSize,
  );

  const wcagUrl = getWcagUnderstandingUrl(issue.wcag);
  const directFullPageUrl = siteHref ? `${siteHref}/issues/${issue.id}` : `/issues/${issue.id}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-line px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-center gap-2">
          <SeverityBadge sev={issue.sev} />
          <span className="inline-flex items-center gap-1 rounded border border-line-strong px-2 py-px text-[13px] leading-5 font-medium">
            {STATUS_LABEL[issue.status]}
          </span>
          <span className="flex-1" />

          {/* Copy Link */}
          <button
            type="button"
            onClick={onCopyLink}
            aria-label={copiedLink ? "Link copied" : "Copy link to this issue"}
            title="Copy link"
            className={`${ICON_BTN} text-muted hover:text-ink`}
          >
            <Icon d={copiedLink ? I.fixed : I.link} size={18} className={copiedLink ? "text-ok" : ""} />
            <span aria-live="polite" className="sr-only">
              {copiedLink ? "Link copied to clipboard" : ""}
            </span>
          </button>

          {/* Open in full page link (only in drawer) */}
          {!isFullPage && (
            <Link
              href={directFullPageUrl}
              aria-label="Open in full page"
              title="Open in full page"
              className={`${ICON_BTN} text-muted hover:text-ink no-underline`}
            >
              <Icon d={I.expand} size={18} />
            </Link>
          )}

          {/* Close drawer button */}
          {!isFullPage && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close issue details"
              title="Close (Esc)"
              className={`${ICON_BTN} text-ink`}
            >
              <Icon d={I.close} size={20} />
            </button>
          )}
        </div>

        {/* Title */}
        <h2
          id="drawer-title"
          ref={titleRef}
          tabIndex={-1}
          className="m-0 text-2xl leading-8 font-semibold text-pretty outline-none focus-visible:outline-2"
        >
          {issue.title}
        </h2>

        {/* Metadata subtitle */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-muted">
          <span>{issue.template}</span>
          <span>·</span>
          <span className="font-mono text-[13px]">{issue.rule}</span>
          <span>·</span>
          <a
            href={wcagUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink underline underline-offset-2 hover:text-primary"
          >
            WCAG {issue.wcag.split(" ")[0]}
            <Icon d={I.external} size={12} />
            <span className="sr-only"> (opens W3C documentation in new tab)</span>
          </a>
        </div>

        {/* Status banners */}
        {issue.status === "fixed" && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-lg bg-ok-soft px-4 py-3 text-sm leading-5 font-medium text-ok"
          >
            <Icon d={I.fixed} size={18} className="flex-none" />
            Fixed today in a recheck of {Math.min(issue.pages, 3)} pages. Logged in your evidence.
          </div>
        )}

        {issue.status === "ignored" && (
          <div className="flex items-center gap-2.5 rounded-lg bg-min-soft px-4 py-3 text-sm leading-5 text-ink">
            <span className="flex-1">
              Ignored: {issue.ignoreReason ?? "Accepted risk"}. It stays in your evidence log.
            </span>
            <button type="button" onClick={onReopen} className={SECONDARY_SM}>
              Reopen
            </button>
          </div>
        )}

        {/* Action buttons */}
        {active && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onRecheck}
              disabled={rechecking}
              className="ease-ui flex h-8 items-center gap-1.5 rounded-full border-0 bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-80 focus-visible:ring-2 focus-visible:ring-primary"
            >
              {rechecking && (
                <span
                  className="size-3.5 animate-spin rounded-full border-2 border-on-primary border-r-transparent"
                  aria-hidden="true"
                />
              )}
              {rechecking ? "Rechecking…" : "Recheck"}
            </button>
            <select
              value={issue.assigneeId ?? ""}
              onChange={(e) => onAssign?.(e.target.value || null)}
              disabled={!onAssign}
              aria-label="Assignee"
              className="h-8 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              Due
              <input
                type="date"
                value={issue.dueDate ?? ""}
                onChange={(e) => onSetDue?.(e.target.value || null)}
                disabled={!onSetDue}
                className="h-8 rounded-full border border-line-strong bg-surface px-3 text-sm text-ink"
              />
            </label>
            <button
              type="button"
              onClick={onIgnore}
              data-ignore-btn
              className={`${SECONDARY_SM} flex items-center gap-1.5`}
            >
              <Icon d={I.ignored} />
              Ignore
            </button>
            {deepLink?.editorUrl && (
              <a
                href={deepLink.editorUrl}
                target="_blank"
                rel="noreferrer"
                className={`${SECONDARY_SM} inline-flex items-center gap-1.5 no-underline text-ink hover:text-primary`}
                title={deepLink.description}
              >
                <span>{deepLink.label}</span>
                <Icon d={I.external} size={14} />
              </a>
            )}
          </div>
        )}

        {/* Tab list */}
        <div
          role="tablist"
          aria-label="Issue details"
          className="mt-2 flex gap-1 overflow-x-auto border-b border-line"
        >
          {DRAWER_TABS.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`dtab-${index}`}
              aria-selected={index === dTab}
              aria-controls="dpanel"
              onClick={() => setDTab(index)}
              className={`ease-ui flex-none border-0 bg-transparent p-2.5 text-sm ${tabStyle(
                index === dTab,
              )}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Panels */}
      <div
        id="dpanel"
        role="tabpanel"
        aria-labelledby={`dtab-${dTab}`}
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 text-base leading-6 sm:p-6"
      >
        {/* Tab 0: Overview */}
        {dTab === 0 && (
          <>
            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 text-base leading-6 font-semibold">Who this affects</h3>
              <p className="m-0 text-pretty text-muted">{issue.who}</p>
            </section>
            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 text-base leading-6 font-semibold">Why it matters</h3>
              <p className="m-0 text-pretty text-muted">{issue.why}</p>
            </section>
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2.5 rounded-lg bg-subtle p-4 text-sm leading-5 sm:grid-cols-[140px_1fr]">
              <dt className="text-muted">WCAG criterion</dt>
              <dd className="m-0">
                <a
                  href={wcagUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-2 hover:text-primary"
                >
                  {issue.wcag}
                  <Icon d={I.external} size={14} />
                  <span className="sr-only">(opens W3C documentation in new tab)</span>
                </a>
              </dd>
              <dt className="text-muted">Where</dt>
              <dd className="m-0">
                {issue.template}: {issue.pages} {issue.pages === 1 ? "page" : "pages"} ({issue.occ} occurrences)
              </dd>
              <dt className="text-muted">First seen</dt>
              <dd className="m-0">{issue.first}</dd>
              <dt className="text-muted">Last seen</dt>
              <dd className="m-0">{issue.last}</dd>
            </dl>
          </>
        )}

        {/* Tab 1: Where it occurs */}
        {dTab === 1 && (
          <>
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-base leading-6 font-semibold">Axe failure summary</h3>
              <p className="m-0 text-sm leading-5 text-muted">{issue.axe}</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="m-0 text-base leading-6 font-semibold">
                  Occurrence locations ({totalOccs})
                </h3>
                {totalOccPages > 1 && (
                  <span className="text-xs text-muted" aria-live="polite">
                    Page {occPage} of {totalOccPages}
                  </span>
                )}
              </div>

              <ul className="m-0 list-none overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-card">
                {currentOccs.map(([url, sel], idx) => (
                  <li
                    key={url + sel + idx}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx < currentOccs.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium leading-5 [overflow-wrap:anywhere]">
                        {url.replace(/^https?:\/\//, "")}
                      </span>
                      <code className="font-mono text-[13px] leading-[18px] text-muted [overflow-wrap:anywhere]">
                        {sel}
                      </code>
                    </span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-ptext hover:underline"
                    >
                      Open page
                      <Icon d={I.external} size={14} />
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>

              {/* Occurrences Pagination */}
              {totalOccPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={occPage <= 1}
                    onClick={() => setOccPage((p) => Math.max(1, p - 1))}
                    className="ease-ui h-8 rounded border border-line px-3 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted">
                    Showing {(occPage - 1) * occPageSize + 1}–{Math.min(occPage * occPageSize, totalOccs)} of {totalOccs}
                  </span>
                  <button
                    type="button"
                    disabled={occPage >= totalOccPages}
                    onClick={() => setOccPage((p) => Math.min(totalOccPages, p + 1))}
                    className="ease-ui h-8 rounded border border-line px-3 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-base leading-6 font-semibold">HTML on the first page</h3>
              <CodeSnippet code={issue.snippet} language="HTML" label="HTML Snippet" />
            </div>
          </>
        )}

        {/* Tab 2: How to fix */}
        {dTab === 2 && (
          <>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-semibold">Platform fix guide</label>
              <div
                role="tablist"
                aria-label="Platform selection"
                className="inline-flex self-start overflow-hidden rounded-full border border-line-strong"
              >
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={pf === p}
                    onClick={() => setPf(p)}
                    className={`ease-ui h-8 border-0 px-3.5 text-sm font-semibold ${
                      pf === p
                        ? "bg-primary text-on-primary"
                        : "bg-surface text-ink hover:bg-subtle"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {deepLink && (deepLink.editorUrl || deepLink.codeEditorUrl) && (
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {deepLink.platform === "shopify" ? "Shopify Theme" : "WordPress Editor"}
                    </span>
                    {deepLink.likelyFile && (
                      <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-muted">
                        {deepLink.likelyFile}
                      </code>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {deepLink.editorUrl && (
                      <a
                        href={deepLink.editorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ease-ui inline-flex h-7 items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 text-xs font-semibold text-ink hover:bg-subtle no-underline"
                      >
                        <span>{deepLink.platform === "shopify" ? "Customizer" : "Site Editor"}</span>
                        <Icon d={I.external} size={12} />
                      </a>
                    )}
                    {deepLink.codeEditorUrl && (
                      <a
                        href={deepLink.codeEditorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ease-ui inline-flex h-7 items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 text-xs font-semibold text-ink hover:bg-subtle no-underline"
                      >
                        <span>Code Editor</span>
                        <Icon d={I.external} size={12} />
                      </a>
                    )}
                  </div>
                </div>
                <p className="m-0 text-xs text-muted">
                  {deepLink.description}
                </p>
              </div>
            )}

            {(() => {
              const matchedGuide = pf !== "Generic" ? getFixGuideByRuleAndPlatform(issue.rule, pf) : undefined;
              if (matchedGuide) {
                return (
                  <div className="flex flex-col gap-6 pt-2">
                    <GuideRenderer guide={matchedGuide} isCompact={true} />
                  </div>
                );
              }
              return (
                <>
                  {steps.length > 0 ? (
                    <ol className="m-0 flex flex-col gap-2 pl-6 text-pretty">
                      {steps.map((s, idx) => (
                        <li key={idx} className="text-sm leading-6">
                          {s}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="m-0 text-pretty text-sm text-muted">
                      We don&apos;t have a specific written guide for this rule on {pf} yet. The generic fix
                      applies to any theme, or generate an AI suggestion below.
                    </p>
                  )}

                  {code && (
                    <div className="flex flex-col gap-2">
                      <h4 className="m-0 text-sm font-semibold">Code change</h4>
                      <CodeSnippet code={code} language={lang} label={`${pf} (${lang})`} />
                    </div>
                  )}

                  {issue.check && (
                    <section className="flex flex-col gap-1.5">
                      <h3 className="m-0 text-base leading-6 font-semibold">How to check your fix</h3>
                      <p className="m-0 text-pretty text-sm text-muted">{issue.check}</p>
                    </section>
                  )}
                </>
              );
            })()}

            {/* AI Suggestion Slot (Spec Section 6.10 & Chunk P3-07) */}
            <section
              aria-labelledby="ai-suggestion-heading"
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    id="ai-suggestion-heading"
                    className="rounded bg-primary-soft px-2 py-0.5 text-[13px] leading-5 font-semibold text-ptext"
                  >
                    AI suggestion
                  </span>
                  <span className="text-xs text-muted">Check before applying</span>
                </div>
              </div>

              {aiState === "none" && (
                <div className="flex flex-col gap-2.5">
                  <p className="m-0 text-sm leading-5 text-muted">
                    Get an AI suggestion tailored for this exact element and template.
                  </p>
                  <button
                    type="button"
                    onClick={genAi}
                    className={`${SECONDARY_SM} self-start`}
                  >
                    Generate suggestion
                  </button>
                </div>
              )}

              {aiState === "gen" && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2.5 py-2 text-sm text-muted"
                >
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-primary border-r-transparent"
                    aria-hidden="true"
                  />
                  <span>Writing a tailored suggestion…</span>
                </div>
              )}

              {aiState === "ready" && aiSuggestion && (
                <div className="flex flex-col gap-3">
                  {(() => {
                    const parsed = parseAiSuggestion(aiSuggestion);
                    return (
                      <>
                        {parsed.before && <AiProse text={parsed.before} />}
                        {parsed.code ? (
                          <CodeSnippet
                            code={parsed.code}
                            language={parsed.lang}
                            label={`AI Recommended Fix (${parsed.lang})`}
                          />
                        ) : (
                          <pre className="m-0 overflow-x-auto rounded-lg bg-sunk p-3 font-mono text-[13px] whitespace-pre-wrap text-ink">
                            {aiSuggestion}
                          </pre>
                        )}
                        {parsed.after && <AiProse text={parsed.after} />}
                      </>
                    );
                  })()}

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = parseAiSuggestion(aiSuggestion);
                        navigator.clipboard
                          ?.writeText(parsed.code ?? aiSuggestion)
                          .then(() => {
                            setCopiedSuggestion(true);
                            setTimeout(() => setCopiedSuggestion(false), 2000);
                          })
                          .catch(() => {});
                      }}
                      className="ease-ui flex items-center gap-1.5 border-0 bg-transparent p-0 font-semibold text-ptext hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded"
                    >
                      <Icon
                        d={copiedSuggestion ? I.fixed : I.copy}
                        size={14}
                        className={copiedSuggestion ? "text-ok" : "text-ptext"}
                      />
                      <span>{copiedSuggestion ? "Copied suggestion" : "Copy suggestion"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={reportAi}
                      disabled={reportingAi}
                      className="ease-ui border-0 bg-transparent p-0 text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary rounded"
                    >
                      {reportingAi ? "Flagging…" : "Report a bad suggestion"}
                    </button>
                  </div>
                </div>
              )}

              {aiState === "reported" && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-col gap-2 rounded-xl bg-subtle p-3 text-sm text-ink"
                >
                  <div className="flex items-center gap-2 font-medium text-ok">
                    <Icon d={I.fixed} size={16} />
                    <span>Suggestion flagged for review</span>
                  </div>
                  <p className="m-0 text-xs text-muted">
                    Thank you for your feedback. Our team has flagged this suggestion to improve quality.
                  </p>
                  <button
                    type="button"
                    onClick={genAi}
                    className="self-start text-xs font-semibold text-ptext hover:underline"
                  >
                    Regenerate suggestion
                  </button>
                </div>
              )}

              {aiState === "cap_reached" && (
                <div
                  role="alert"
                  className="flex flex-col gap-2 rounded-xl border border-warn/30 bg-warn-soft p-3.5 text-sm"
                >
                  <div className="flex items-center gap-2 font-semibold text-warn">
                    <Icon d={I.alert} size={16} />
                    <span>Monthly AI suggestion limit reached</span>
                  </div>
                  <p className="m-0 text-xs text-ink/80">
                    You have used all 50 AI fix suggestions included in your plan this month.
                    Upgrade your plan for higher monthly allowances or wait until the next billing cycle.
                  </p>
                  <Link
                    href="/pricing"
                    className="self-start text-xs font-semibold text-ptext underline hover:text-primary"
                  >
                    View upgrade options →
                  </Link>
                </div>
              )}

              {aiState === "error" && (
                <div
                  role="alert"
                  className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3 text-sm"
                >
                  <p className="m-0 text-xs text-muted">
                    {aiError || "Suggestion unavailable. Please try again or refer to the fix guide above."}
                  </p>
                  <button
                    type="button"
                    onClick={genAi}
                    className="self-start text-xs font-semibold text-ptext hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* Tab 3: History & Notes */}
        {dTab === 3 && (
          <div className="flex flex-col gap-6">
            {/* Timeline */}
            <div className="flex flex-col gap-3">
              <h3 className="m-0 text-base leading-6 font-semibold">Timeline</h3>
              <ol className="m-0 flex list-none flex-col p-0">
                {history.map(([kind, titleText, metaText], idx) => (
                  <li key={titleText + metaText + idx} className="grid grid-cols-[32px_1fr] gap-3 pb-4">
                    <span
                      className={`grid size-8 place-items-center rounded-full border border-line bg-subtle ${
                        kind === "ok" ? "text-ok" : "text-muted"
                      }`}
                    >
                      <Icon d={HISTORY_ICON[kind]} size={16} />
                    </span>
                    <span className="flex flex-col pt-0.5">
                      <span className="text-sm font-medium">{titleText}</span>
                      <span className="text-xs leading-5 text-muted">{metaText}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Existing Notes */}
            <div className="flex flex-col gap-3">
              <h3 className="m-0 text-base leading-6 font-semibold">Notes ({notes.length})</h3>
              {notes.length === 0 ? (
                <p className="m-0 text-sm text-muted">No notes yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="rounded-lg border border-line bg-subtle p-3.5 text-sm"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-muted">
                        <span className="font-semibold text-ink">{note.authorName}</span>
                        <div className="flex items-center gap-2">
                          {note.visibleToClient && (
                            <span className="rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-semibold text-ok">
                              Client visible
                            </span>
                          )}
                          <span>{note.createdAt}</span>
                        </div>
                      </div>
                      <div className="text-pretty text-ink">{note.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Note Composer */}
            <form onSubmit={handleAddNote} className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <label htmlFor="note-input" className="text-sm font-semibold">
                  Add a note
                </label>
                <button
                  type="button"
                  onClick={() => setShowMarkdownPreview((p) => !p)}
                  className="border-0 bg-transparent text-xs font-medium text-ptext hover:underline"
                >
                  {showMarkdownPreview ? "Edit text" : "Preview markdown"}
                </button>
              </div>

              {showMarkdownPreview ? (
                <div className="min-h-[80px] rounded border border-line bg-subtle p-3 text-sm text-ink whitespace-pre-wrap">
                  {noteBody || <span className="text-muted italic">Nothing to preview</span>}
                </div>
              ) : (
                <textarea
                  id="note-input"
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add notes for your team or client..."
                  className="resize-y rounded border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}

              {noteStatus && (
                <p role="status" className="m-0 text-xs font-medium text-ok">
                  {noteStatus}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={visibleToClient}
                    onChange={(e) => setVisibleToClient(e.target.checked)}
                    className="m-0 size-[18px] rounded border-line-strong accent-primary"
                  />
                  <span>Visible to client</span>
                </label>
                <button
                  type="submit"
                  disabled={!noteBody.trim()}
                  className={`${SECONDARY_SM} disabled:opacity-50`}
                >
                  Add note
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
