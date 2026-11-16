"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { IssueDetailContent } from "./issue-detail-content";
import { IgnoreDialog } from "./ignore-dialog";
import { Toast } from "./toast";
import type { Issue } from "@/lib/site-data";
import { ApiException } from "@/lib/api";
import {
  appApi,
  loadIssue,
  recheckAndWait,
  recheckMessage,
  type ApiMember,
  type ApiSite,
} from "@/lib/app-api";

export interface IssueDetailPageProps {
  issueId: string;
  siteId: string;
  orgSlug: string;
}

/** S-26 issue detail as a full page (direct URL). The drawer in SiteWorkspace shares the content. */
export function IssueDetailPage({ issueId, siteId, orgSlug }: IssueDetailPageProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [site, setSite] = useState<ApiSite | null>(null);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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

  useEffect(() => {
    let cancelled = false;
    loadIssue(orgSlug, issueId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.siteId && loaded.siteId !== siteId) setNotFound(true);
        else setIssue(loaded);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, issueId, siteId, refreshKey]);

  useEffect(() => {
    appApi.getSite(orgSlug, siteId).then((d) => setSite(d.site)).catch(() => setSite(null));
    appApi.listMembers(orgSlug).then(setMembers).catch(() => setMembers([]));
  }, [orgSlug, siteId]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const errorText = (err: unknown, fallback: string) =>
    err instanceof ApiException ? err.message : fallback;

  const siteHref = `/${orgSlug}/sites/${siteId}`;
  const issuesHref = `${siteHref}/issues`;
  const siteName = site?.name ?? "Site";

  const run = async (action: () => Promise<unknown>, success: string | null, failure: string) => {
    try {
      await action();
      if (success) showToast(success);
      refresh();
    } catch (err) {
      showToast(errorText(err, failure));
    }
  };

  const onRecheck = async () => {
    setRechecking(true);
    showToast("Rechecking this issue…");
    try {
      const outcomes = await recheckAndWait(orgSlug, [issueId]);
      showToast(recheckMessage(outcomes, 1));
    } catch (err) {
      showToast(errorText(err, "Could not start the recheck."));
    }
    setRechecking(false);
    refresh();
  };

  const crumbs = [
    { label: "Sites", href: `/${orgSlug}/sites` },
    { label: siteName, href: siteHref },
    { label: "Issues", href: issuesHref },
  ];

  if (notFound) {
    return (
      <AppShell active="sites" crumbs={[...crumbs, { label: "Issue not found" }]}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h1 className="m-0 text-2xl font-semibold">Issue not found</h1>
          <p className="mt-2 text-sm text-muted">
            The issue you are looking for does not exist or you don&apos;t have access to it.
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

  if (!issue) {
    return (
      <AppShell active="sites" crumbs={[...crumbs, { label: "Loading…" }]}>
        <div role="status" className="px-6 py-12 text-center text-sm text-muted">
          Loading issue…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="sites" crumbs={[...crumbs, { label: issue.title }]}>
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
          orgSlug={orgSlug}
          sitePlatform={site?.platform}
          siteFramework={site?.framework}
          siteRootUrl={site?.rootUrl}
          members={members}
          rechecking={rechecking}
          onRecheck={onRecheck}
          onIgnore={() => setIgnoreOpen(true)}
          onReopen={() => run(() => appApi.unignore(orgSlug, issueId), "Issue reopened.", "Could not reopen the issue.")}
          onAssign={(assigneeId) =>
            run(() => appApi.assign(orgSlug, issueId, assigneeId), null, "Could not change the assignee.")
          }
          onSetDue={(dueDate) =>
            run(() => appApi.setDueDate(orgSlug, issueId, dueDate), null, "Could not set the due date.")
          }
          isFullPage={true}
          siteHref={siteHref}
        />
      </div>

      {ignoreOpen && (
        <IgnoreDialog
          onCancel={() => setIgnoreOpen(false)}
          onConfirm={(reason, note) => {
            setIgnoreOpen(false);
            void run(
              () => appApi.ignore(orgSlug, issueId, reason, note),
              "Issue ignored. It stays in your evidence log with your reason.",
              "Could not ignore the issue.",
            );
          }}
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
