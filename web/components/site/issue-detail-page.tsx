"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { IssueDetailContent } from "./issue-detail-content";
import { IgnoreDialog } from "./ignore-dialog";
import { Toast } from "./toast";
import { ISSUES, type Issue } from "@/lib/site-data";

export interface IssueDetailPageProps {
  issueId: string;
  siteSlug?: string;
  orgSlug?: string;
  siteName?: string;
  initialIssue?: Issue;
}

export function IssueDetailPage({
  issueId,
  siteSlug,
  orgSlug,
  siteName = "Oakhaus Furniture",
  initialIssue,
}: IssueDetailPageProps) {
  const [issue, setIssue] = useState<Issue | null>(() => {
    if (initialIssue) return initialIssue;
    return ISSUES.find((i) => i.id === issueId) ?? null;
  });

  const [rechecking, setRechecking] = useState(false);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const startToastTimer = useCallback(() => {
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const showToast = (t: string) => {
    setToast(t);
    startToastTimer();
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const siteHref = orgSlug && siteSlug
    ? `/${orgSlug}/sites/${siteSlug}`
    : siteSlug
      ? `/sites/${siteSlug}`
      : "/sites/oakhaus";
  const issuesHref = `${siteHref}/issues`;

  const onRecheck = () => {
    if (!issue) return;
    const n = Math.min(issue.pages, 3);
    setRechecking(true);
    setTimeout(() => {
      setIssue((prev) => (prev ? { ...prev, status: "fixed" } : null));
      setRechecking(false);
      showToast(
        `Fixed — the problem no longer appears on ${n} checked ${
          n === 1 ? "page" : "pages"
        }.`,
      );
    }, 1600);
  };

  const onConfirmIgnore = (reason: string) => {
    if (issue) {
      setIssue((prev) =>
        prev ? { ...prev, status: "ignored", ignoreReason: reason } : null,
      );
    }
    setIgnoreOpen(false);
    showToast("Issue ignored. It stays in your evidence log with your reason.");
  };

  if (!issue) {
    return (
      <AppShell
        active="sites"
        crumbs={[
          { label: "Sites", href: orgSlug ? `/${orgSlug}/sites` : "/sites" },
          { label: siteName, href: siteHref },
          { label: "Issues", href: issuesHref },
          { label: "Issue not found" },
        ]}
      >
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h1 className="m-0 text-2xl font-semibold">Issue not found</h1>
          <p className="mt-2 text-sm text-muted">
            The issue you are looking for does not exist or may have been deleted.
          </p>
          <Link
            href={issuesHref}
            className="ease-ui mt-6 inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle no-underline"
          >
            <Icon d={I.arrowLeft} size={16} />
            Back to issues
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Sites", href: orgSlug ? `/${orgSlug}/sites` : "/sites" },
        { label: siteName, href: siteHref },
        { label: "Issues", href: issuesHref },
        { label: issue.title },
      ]}
    >
      <div className="mb-4">
        <Link
          href={issuesHref}
          className="ease-ui inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink no-underline focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <Icon d={I.arrowLeft} size={16} />
          <span>Back to issues</span>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <IssueDetailContent
          issue={issue}
          rechecking={rechecking}
          onRecheck={onRecheck}
          onIgnore={() => setIgnoreOpen(true)}
          onReopen={() =>
            setIssue((prev) => (prev ? { ...prev, status: "open" } : null))
          }
          isFullPage={true}
          siteHref={siteHref}
        />
      </div>

      {ignoreOpen && (
        <IgnoreDialog
          onCancel={() => setIgnoreOpen(false)}
          onConfirm={onConfirmIgnore}
        />
      )}

      <Toast
        message={toast}
        onClose={() => setToast(null)}
        onPause={() => clearTimeout(toastTimer.current)}
        onResume={startToastTimer}
      />
    </AppShell>
  );
}
