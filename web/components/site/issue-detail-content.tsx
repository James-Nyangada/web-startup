"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { SeverityBadge } from "@/components/badges";
import { CodeSnippet } from "./code-snippet";
import { getWcagUnderstandingUrl } from "@/lib/wcag";
import {
  DRAWER_TABS,
  NAMES,
  type HistoryKind,
  type Issue,
} from "@/lib/site-data";

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
type AiState = "none" | "gen" | "ready";

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
  rechecking: boolean;
  onRecheck: () => void;
  onIgnore: () => void;
  onReopen: () => void;
  onClose?: () => void;
  isFullPage?: boolean;
  siteHref?: string;
  titleRef?: React.Ref<HTMLHeadingElement>;
}

export function IssueDetailContent({
  issue,
  rechecking,
  onRecheck,
  onIgnore,
  onReopen,
  onClose,
  isFullPage = false,
  siteHref,
  titleRef,
}: IssueDetailContentProps) {
  const [dTab, setDTab] = useState(0);
  const [pf, setPf] = useState<Platform>("Shopify");
  const [copiedLink, setCopiedLink] = useState(false);
  const [aiState, setAiState] = useState<AiState>("none");

  // Occurrences pagination
  const [occPage, setOccPage] = useState(1);
  const occPageSize = 5;

  // Notes state
  const [notes, setNotes] = useState<IssueNoteItem[]>([
    {
      id: "note-demo",
      authorName: "Daniel Mwangi",
      body: "Investigating whether this was introduced in the latest theme update.",
      visibleToClient: false,
      createdAt: "14 Oct, 11:30",
    },
  ]);
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

  const history: [HistoryKind, string, string][] = [
    ...(issue.history ?? [
      ["found", "First found", issue.first] as [HistoryKind, string, string],
      ...(issue.assignee
        ? [
            [
              "user",
              `Assigned to ${NAMES[issue.assignee]}, ${issue.due?.toLowerCase()}`,
              "Daniel Mwangi",
            ] as [HistoryKind, string, string],
          ]
        : []),
    ]),
    ...(issue.status === "fixed"
      ? [["ok", "Fixed by recheck", "Daniel Mwangi · Today"] as [HistoryKind, string, string]]
      : []),
    ...(issue.status === "ignored"
      ? [["eye", `Ignored: ${issue.ignoreReason ?? "Accepted risk"}`, "Daniel Mwangi · Today"] as [HistoryKind, string, string]]
      : []),
  ];

  const genAi = () => {
    setAiState("gen");
    setTimeout(() => setAiState("ready"), 1200);
  };

  const onCopyLink = () => {
    if (typeof window !== "undefined") {
      const fullUrl = `${window.location.origin}${siteHref ? `${siteHref}/issues/${issue.id}` : window.location.pathname}`;
      navigator.clipboard?.writeText(fullUrl).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;

    const newNote: IssueNoteItem = {
      id: `note-${Date.now()}`,
      authorName: "You",
      body: noteBody.trim(),
      visibleToClient,
      createdAt: "Just now",
    };

    setNotes((prev) => [...prev, newNote]);
    setNoteBody("");
    setVisibleToClient(false);
    setShowMarkdownPreview(false);
    setNoteStatus("Note added successfully.");
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
  const directFullPageUrl = siteHref ? `${siteHref}/issues/${issue.id}` : `/sites/oakhaus/issues/${issue.id}`;

  return (
    <div className="flex flex-1 flex-col">
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
              Ignored — {issue.ignoreReason ?? "Accepted risk"}. It stays in your evidence log.
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
              {rechecking ? "Rechecking 3 pages…" : "Recheck"}
            </button>
            <button type="button" className={SECONDARY_SM}>
              {issue.assignee ? `Assigned: ${NAMES[issue.assignee]}` : "Assign"}
            </button>
            <button type="button" className={SECONDARY_SM}>
              {issue.due ?? "Set due date"}
            </button>
            <button
              type="button"
              onClick={onIgnore}
              data-ignore-btn
              className={`${SECONDARY_SM} flex items-center gap-1.5`}
            >
              <Icon d={I.ignored} />
              Ignore
            </button>
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
        className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 text-base leading-6 sm:p-6"
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
                {issue.template} — {issue.pages} {issue.pages === 1 ? "page" : "pages"} ({issue.occ} occurrences)
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
                        oakhaus.com{url}
                      </span>
                      <code className="font-mono text-[13px] leading-[18px] text-muted [overflow-wrap:anywhere]">
                        {sel}
                      </code>
                    </span>
                    <a
                      href={`https://oakhaus.com${url}`}
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
                We don&apos;t have a written WordPress guide for this problem yet. The generic fix
                applies to any theme, or generate an AI suggestion below.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <h4 className="m-0 text-sm font-semibold">Code change</h4>
              <CodeSnippet code={code} language={lang} label={`${pf} (${lang})`} />
            </div>

            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 text-base leading-6 font-semibold">How to check your fix</h3>
              <p className="m-0 text-pretty text-sm text-muted">{issue.check}</p>
            </section>

            {/* AI Suggestion Slot (Spec P3-07 placeholder) */}
            <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary-soft px-2 py-0.5 text-[13px] leading-5 font-semibold text-ptext">
                  AI suggestion
                </span>
                <span className="text-xs text-muted">Check before applying</span>
              </div>
              {aiState === "none" && (
                <>
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
                </>
              )}
              {aiState === "gen" && (
                <div role="status" className="flex items-center gap-2 text-sm text-muted">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                  <span>Writing a tailored suggestion…</span>
                </div>
              )}
              {aiState === "ready" && (
                <>
                  <p role="status" className="m-0 text-sm leading-5 text-pretty">
                    {issue.ai ??
                      "Apply the recommended fix to this element; ensure any screen reader text clearly conveys the element’s purpose in context."}
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(issue.ai ?? code).catch(() => {});
                      }}
                      className="border-0 bg-transparent p-0 font-semibold text-ptext hover:underline"
                    >
                      Copy suggestion
                    </button>
                    <button
                      type="button"
                      className="border-0 bg-transparent p-0 text-muted underline underline-offset-2 hover:text-ink"
                    >
                      Report a bad suggestion
                    </button>
                  </div>
                </>
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
