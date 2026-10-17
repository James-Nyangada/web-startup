import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser, type Page } from 'playwright';
import { strictPolicy, type GuardPolicy } from '../net/guard.js';
import { AXE_VERSION, STANDARD_TAGS, type Impact } from '../rules/catalog.js';
import type { ScanLogger, Standard } from '../types.js';
import { CHROMIUM_GUARD_ARGS, installRouteGuard } from './route-guard.js';

export type PageStatus = 'ok' | 'timeout' | 'http_error' | 'blocked' | 'skipped';

export interface AxeNode {
  /** One selector per frame/shadow level, already flattened to strings. */
  target: string[];
  html: string;
  failureSummary: string | undefined;
  impact: Impact | null;
}

export interface AxeRuleResult {
  ruleId: string;
  impact: Impact | null;
  tags: string[];
  nodes: AxeNode[];
}

export interface PageResult {
  url: string;
  finalUrl: string;
  templateKey: string;
  status: PageStatus;
  httpStatus: number | null;
  loadMs: number | null;
  title: string | null;
  violations: AxeRuleResult[];
  incomplete: AxeRuleResult[];
  /** Rules that passed on this page (for scoring). */
  passedRules: string[];
  screenshot?: Buffer;
  error?: string;
}

export interface PageToScan {
  url: string;
  templateKey: string;
}

export interface PageRunnerOptions {
  userAgent: string;
  standard: Standard;
  policy?: GuardPolicy;
  /** Pages in parallel (spec: SCANNER_CONCURRENCY, default 2). */
  concurrency?: number;
  navigationTimeoutMs?: number;
  /** Hard per-page cap (spec 6.5 step 7: 45 s). */
  pageTimeoutMs?: number;
  networkIdleMs?: number;
  settleMs?: number;
  /** Restart Chromium after this many pages (spec 6.5 step 8). */
  restartEvery?: number;
  maxRssBytes?: number;
  /** Full-page JPEG for pages with critical issues (spec 6.5 step 6). */
  screenshots?: boolean;
  log: ScanLogger;
  onPage?: (result: PageResult, done: number, total: number) => void;
  /** Lets callers cancel a running scan. */
  signal?: AbortSignal;
}

export interface RunResult {
  pages: PageResult[];
  axeVersion: string;
  /** True when the site kept answering 429/503 and we stopped early (spec 11.3). */
  throttled: boolean;
}

const THROTTLE_STATUSES = new Set([429, 503]);
const MAX_THROTTLE_RESPONSES = 3;

class PageTimeoutError extends Error {}

function flattenTarget(target: unknown[]): string[] {
  return target.map((level) => (Array.isArray(level) ? level.join(' >>> ') : String(level)));
}

function toRuleResults(
  results: { id: string; impact?: string | null; tags: string[]; nodes: unknown[] }[],
): AxeRuleResult[] {
  return results.map((rule) => ({
    ruleId: rule.id,
    impact: (rule.impact ?? null) as Impact | null,
    tags: rule.tags,
    nodes: (
      rule.nodes as {
        target: unknown[];
        html: string;
        failureSummary?: string;
        impact?: string | null;
      }[]
    ).map((node) => ({
      target: flattenTarget(node.target),
      html: node.html,
      failureSummary: node.failureSummary,
      impact: (node.impact ?? null) as Impact | null,
    })),
  }));
}

const emptyResult = (
  page: PageToScan,
  status: PageStatus,
  extra: Partial<PageResult> = {},
): PageResult => ({
  url: page.url,
  finalUrl: page.url,
  templateKey: page.templateKey,
  status,
  httpStatus: null,
  loadMs: null,
  title: null,
  violations: [],
  incomplete: [],
  passedRules: [],
  ...extra,
});

/** Spec 6.5 (P1-08). */
export async function runPages(
  pages: readonly PageToScan[],
  options: PageRunnerOptions,
): Promise<RunResult> {
  const policy = options.policy ?? strictPolicy;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;
  const pageTimeoutMs = options.pageTimeoutMs ?? 45_000;
  const networkIdleMs = options.networkIdleMs ?? 5_000;
  const settleMs = options.settleMs ?? 500;
  const restartEvery = options.restartEvery ?? 50;
  const maxRssBytes = options.maxRssBytes ?? 1.5 * 1024 ** 3;
  const tags = STANDARD_TAGS[options.standard];

  const results: PageResult[] = new Array<PageResult>(pages.length);
  let throttleCount = 0;
  let throttled = false;
  let done = 0;
  let next = 0;

  const scanOne = async (browser: Browser, page: PageToScan): Promise<PageResult> => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
      locale: 'en-US',
      javaScriptEnabled: true,
      bypassCSP: false,
      userAgent: options.userAgent,
      serviceWorkers: 'block',
    });
    let tab: Page | undefined;
    let timer: NodeJS.Timeout | undefined;
    const started = performance.now();

    const work = async (): Promise<PageResult> => {
      tab = await context.newPage();
      tab.setDefaultTimeout(navigationTimeoutMs);
      // Installed before the first navigation; checks every request and redirect hop.
      const guard = await installRouteGuard(tab, policy);

      let response;
      try {
        response = await tab.goto(page.url, {
          waitUntil: 'domcontentloaded',
          timeout: navigationTimeoutMs,
        });
      } catch (error) {
        if (guard.mainFrameBlocked)
          return emptyResult(page, 'blocked', { error: guard.mainFrameBlocked });
        throw error;
      }
      if (guard.mainFrameBlocked)
        return emptyResult(page, 'blocked', { error: guard.mainFrameBlocked });
      // Redirects are followed natively, so the browser's URL is the final address.
      const target = tab.url();
      if (!response)
        return emptyResult(page, 'http_error', { finalUrl: target, error: 'No response' });

      const httpStatus = response.status();
      if (THROTTLE_STATUSES.has(httpStatus)) throttleCount++;
      if (httpStatus >= 400) {
        return emptyResult(page, 'http_error', { finalUrl: target, httpStatus });
      }

      await tab.waitForLoadState('networkidle', { timeout: networkIdleMs }).catch(() => undefined);
      await tab.waitForTimeout(settleMs);
      const loadMs = Math.round(performance.now() - started);

      const axe = await new AxeBuilder({ page: tab })
        .withTags(tags)
        .options({ resultTypes: ['violations', 'incomplete'] })
        .analyze();

      const violations = toRuleResults(axe.violations);
      const result: PageResult = {
        url: page.url,
        finalUrl: target,
        templateKey: page.templateKey,
        status: 'ok',
        httpStatus,
        loadMs,
        title: (await tab.title().catch(() => '')) || null,
        violations,
        incomplete: toRuleResults(axe.incomplete),
        passedRules: axe.passes.map((rule) => rule.id),
      };

      if (options.screenshots && violations.some((v) => v.impact === 'critical')) {
        const height = await tab
          .evaluate<number>('document.documentElement.scrollHeight')
          .catch(() => 800);
        result.screenshot = await tab
          .screenshot({
            type: 'jpeg',
            quality: 60,
            fullPage: true,
            clip: { x: 0, y: 0, width: 1280, height: Math.min(Math.max(height, 1), 4_000) },
          })
          .catch(() => undefined);
      }
      return result;
    };

    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new PageTimeoutError()), pageTimeoutMs);
        }),
      ]);
    } catch (error) {
      if (
        error instanceof PageTimeoutError ||
        (error instanceof Error && error.name === 'TimeoutError')
      ) {
        return emptyResult(page, 'timeout', { error: `No result within ${pageTimeoutMs / 1000}s` });
      }
      const message = error instanceof Error ? error.message.split('\n')[0]! : String(error);
      return emptyResult(page, 'http_error', { error: message });
    } finally {
      clearTimeout(timer);
      await context.close().catch(() => undefined);
    }
  };

  // Batches of `restartEvery` pages, each in a fresh browser (spec 6.5 step 8).
  while (next < pages.length) {
    const browser = await chromium.launch({
      args: ['--disable-dev-shm-usage', ...CHROMIUM_GUARD_ARGS],
    });
    let inBatch = 0;
    try {
      const worker = async () => {
        while (next < pages.length && inBatch < restartEvery) {
          if (options.signal?.aborted || throttleCount >= MAX_THROTTLE_RESPONSES) return;
          if (process.memoryUsage().rss > maxRssBytes) {
            options.log.warn('Memory limit reached; restarting the browser', {
              rss: process.memoryUsage().rss,
            });
            inBatch = restartEvery;
            return;
          }
          const index = next++;
          inBatch++;
          const result = await scanOne(browser, pages[index]!);
          results[index] = result;
          options.onPage?.(result, ++done, pages.length);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
    } finally {
      await browser.close().catch(() => undefined);
    }
    if (options.signal?.aborted) break;
    if (throttleCount >= MAX_THROTTLE_RESPONSES) {
      throttled = true;
      options.log.warn('Site returned 429/503 three times; stopping the scan (spec 11.3)');
      break;
    }
  }

  for (let i = 0; i < pages.length; i++) {
    results[i] ??= emptyResult(pages[i]!, 'skipped', {
      error: throttled ? 'Stopped: the site asked us to slow down' : 'Scan cancelled',
    });
  }
  return { pages: results, axeVersion: AXE_VERSION, throttled };
}
