import type { FoundIssue } from './issues.js';

export type IssueStatus = 'open' | 'fixed' | 'ignored';

export interface PreviousIssue {
  fingerprint: string;
  status: IssueStatus;
  templateKey: string;
  /** Pages it occurred on when last seen. */
  lastSeenPageUrls: string[];
}

export interface ScannedPage {
  url: string;
  templateKey: string;
  ok: boolean;
}

export interface ScanDiff {
  /** New fingerprints → `open`, event `created`. */
  created: FoundIssue[];
  /** Open and seen again. */
  stillOpen: FoundIssue[];
  /** Open, not seen, and its pages were checked → `fixed`. */
  fixed: PreviousIssue[];
  /** Fixed but seen again → `open`, is_regression, regression_count++. */
  regressed: FoundIssue[];
  /** Ignored issues seen again: status unchanged, occurrences still recorded. */
  ignoredSeen: FoundIssue[];
  /** Open but not checked this time (pages failed or not sampled): unchanged. */
  unchecked: PreviousIssue[];
  /** More than 50% of planned pages failed: nothing may be marked fixed. */
  partial: boolean;
}

export const PARTIAL_FAILURE_RATIO = 0.5;

export function isPartialScan(pagesPlanned: number, pagesFailed: number): boolean {
  return pagesPlanned > 0 && pagesFailed / pagesPlanned > PARTIAL_FAILURE_RATIO;
}

/**
 * Spec 6.7 "pages scanned": checked if any page of its template was scanned OK
 * and every page it last occurred on was scanned OK, or if at least 3 pages of
 * its template were scanned OK without it.
 */
export function wasChecked(issue: PreviousIssue, pages: readonly ScannedPage[]): boolean {
  const okPages = pages.filter((p) => p.ok);
  const okOfTemplate = okPages.filter((p) => p.templateKey === issue.templateKey);
  if (okOfTemplate.length >= 3) return true;
  const okUrls = new Set(okPages.map((p) => p.url));
  return (
    okOfTemplate.length > 0 &&
    issue.lastSeenPageUrls.length > 0 &&
    issue.lastSeenPageUrls.every((url) => okUrls.has(url))
  );
}

/** Spec 6.7 status machine as a pure function (P1-10). */
export function diffScans(
  previous: readonly PreviousIssue[],
  current: readonly FoundIssue[],
  scannedPages: readonly ScannedPage[],
  pagesPlanned = scannedPages.length,
): ScanDiff {
  const pagesFailed =
    scannedPages.filter((p) => !p.ok).length + Math.max(0, pagesPlanned - scannedPages.length);
  const partial = isPartialScan(pagesPlanned, pagesFailed);
  const before = new Map(previous.map((issue) => [issue.fingerprint, issue]));
  const seen = new Set(current.map((issue) => issue.fingerprint));
  const diff: ScanDiff = {
    created: [],
    stillOpen: [],
    fixed: [],
    regressed: [],
    ignoredSeen: [],
    unchecked: [],
    partial,
  };

  for (const issue of current) {
    const old = before.get(issue.fingerprint);
    if (!old) diff.created.push(issue);
    else if (old.status === 'open') diff.stillOpen.push(issue);
    else if (old.status === 'fixed') diff.regressed.push(issue);
    else diff.ignoredSeen.push(issue);
  }

  for (const old of previous) {
    if (seen.has(old.fingerprint) || old.status !== 'open') continue;
    if (!partial && wasChecked(old, scannedPages)) diff.fixed.push(old);
    else diff.unchecked.push(old);
  }

  return diff;
}
