import { discover, type DiscoveryResult } from './discovery/discover.js';
import { createGuardedFetch } from './net/guarded-fetch.js';
import { strictPolicy, type GuardPolicy } from './net/guard.js';
import { HostRateLimiter } from './net/rate-limiter.js';
import { planScan } from './plan.js';
import { groupIssues, type FoundIssue } from './results/issues.js';
import { isPartialScan } from './results/diff.js';
import { scorePage, scoreScan } from './results/score.js';
import { AXE_VERSION, type Impact } from './rules/catalog.js';
import { runPages, type PageResult } from './runner/page-runner.js';
import type { PlannedPage } from './sampling/sample.js';
import type { Platform, ScanLogger, Standard } from './types.js';

/** Bumped whenever scanner behaviour changes in a way that affects results. */
export const ENGINE_VERSION = '1.0.0';

export type ScanPhase = 'discovering' | 'scanning' | 'processing';

export interface ScanProgress {
  phase: ScanPhase;
  pagesScanned: number;
  pagesPlanned: number;
  currentUrl?: string;
  message?: string;
}

export interface ScanInput {
  rootUrl: string;
  pageLimit: number;
  standard: Standard;
  userAgent: string;
  pinnedUrls?: string[];
  excludedPaths?: string[];
  platform?: Platform;
  previousUrls?: string[];
  seed?: string;
  concurrency?: number;
  screenshots?: boolean;
  policy?: GuardPolicy;
  /** Politeness interval; tests set 0. */
  requestIntervalMs?: number;
  pageTimeoutMs?: number;
  log: ScanLogger;
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
}

export type ScanCounts = Record<Impact, number> & { total: number; needsReview: number };

export interface PageSummary {
  url: string;
  finalUrl: string;
  templateKey: string;
  status: PageResult['status'];
  httpStatus: number | null;
  loadMs: number | null;
  title: string | null;
  score: number | null;
  violations: number;
  incomplete: number;
  passes: number;
  error?: string;
}

export interface ScanResult {
  engineVersion: string;
  axeVersion: string;
  standard: Standard;
  rootUrl: string;
  platform: Platform;
  /** The site's tech stack when custom-coded; added from the site record when a report is printed. */
  framework?: string | null;
  status: 'completed' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string;
  pagesDiscovered: number;
  pagesPlanned: number;
  pagesScanned: number;
  pagesFailed: number;
  templatesFound: number;
  score: number | null;
  counts: ScanCounts;
  planned: PlannedPage[];
  pages: PageSummary[];
  issues: FoundIssue[];
  discovery: Pick<DiscoveryResult, 'robots' | 'sitemapsRead' | 'crawled' | 'stats' | 'errors'>;
  throttled: boolean;
}

export function countIssues(issues: readonly FoundIssue[]): ScanCounts {
  const counts: ScanCounts = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: 0,
    needsReview: 0,
  };
  for (const issue of issues) {
    if (issue.needsReview) {
      counts.needsReview++;
      continue;
    }
    counts[issue.impact]++;
    counts.total++;
  }
  return counts;
}

/** Full pipeline for one site: discover → plan → test pages → group → score. */
export async function runScan(
  input: ScanInput,
): Promise<ScanResult & { pageResults: PageResult[] }> {
  const startedAt = new Date().toISOString();
  const policy = input.policy ?? strictPolicy;
  const progress = input.onProgress ?? (() => {});
  const fetch = createGuardedFetch({ userAgent: input.userAgent, policy });

  progress({ phase: 'discovering', pagesScanned: 0, pagesPlanned: 0 });
  const discovery = await discover({
    rootUrl: input.rootUrl,
    pinnedUrls: input.pinnedUrls,
    excludedPaths: input.excludedPaths,
    platform: input.platform,
    fetch,
    userAgent: input.userAgent,
    log: input.log,
    limiter: new HostRateLimiter(input.requestIntervalMs ?? 1_000),
    onProgress: (message) =>
      progress({ phase: 'discovering', pagesScanned: 0, pagesPlanned: 0, message }),
  });

  const plan = planScan({
    discovery,
    pageLimit: input.pageLimit,
    pinnedUrls: input.pinnedUrls,
    previousUrls: input.previousUrls,
    seed: input.seed ?? new URL(input.rootUrl).host,
  });

  progress({ phase: 'scanning', pagesScanned: 0, pagesPlanned: plan.planned.length });
  const run = await runPages(plan.planned, {
    userAgent: input.userAgent,
    standard: input.standard,
    policy,
    concurrency: input.concurrency,
    screenshots: input.screenshots,
    pageTimeoutMs: input.pageTimeoutMs,
    log: input.log,
    signal: input.signal,
    onPage: (page, done, total) =>
      progress({
        phase: 'scanning',
        pagesScanned: done,
        pagesPlanned: total,
        currentUrl: page.url,
      }),
  });

  progress({
    phase: 'processing',
    pagesScanned: run.pages.length,
    pagesPlanned: plan.planned.length,
  });
  const issues = groupIssues(run.pages);
  const pagesScanned = run.pages.filter((p) => p.status === 'ok').length;
  const pagesFailed = run.pages.length - pagesScanned;
  const status =
    pagesScanned === 0
      ? 'failed'
      : run.throttled || isPartialScan(plan.planned.length, pagesFailed)
        ? 'partial'
        : 'completed';

  return {
    engineVersion: ENGINE_VERSION,
    axeVersion: run.axeVersion ?? AXE_VERSION,
    standard: input.standard,
    rootUrl: discovery.rootUrl,
    platform: discovery.platform.platform,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    pagesDiscovered: discovery.urls.length,
    pagesPlanned: plan.planned.length,
    pagesScanned,
    pagesFailed,
    templatesFound: plan.templates.length,
    score: scoreScan(run.pages),
    counts: countIssues(issues),
    planned: plan.planned,
    pages: run.pages.map((page) => ({
      url: page.url,
      finalUrl: page.finalUrl,
      templateKey: page.templateKey,
      status: page.status,
      httpStatus: page.httpStatus,
      loadMs: page.loadMs,
      title: page.title,
      score: page.status === 'ok' ? scorePage(page) : null,
      violations: page.violations.reduce((n, r) => n + r.nodes.length, 0),
      incomplete: page.incomplete.reduce((n, r) => n + r.nodes.length, 0),
      passes: page.passedRules.length,
      ...(page.error && { error: page.error }),
    })),
    issues,
    discovery: {
      robots: discovery.robots,
      sitemapsRead: discovery.sitemapsRead,
      crawled: discovery.crawled,
      stats: discovery.stats,
      errors: discovery.errors,
    },
    throttled: run.throttled,
    pageResults: run.pages,
  };
}
