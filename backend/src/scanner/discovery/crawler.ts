import type { GuardedFetch } from '../net/guarded-fetch.js';
import { isSameSite, normalizeUrl } from '../url/normalize.js';
import { shouldSkipUrl } from '../url/skip-patterns.js';
import type { ScanLogger } from '../types.js';
import { extractLinks } from './html-links.js';

export interface CrawlOptions {
  rootUrl: string;
  seeds: string[];
  /** Already rate-limited per host by the caller. */
  fetch: GuardedFetch;
  isAllowed: (url: string) => boolean;
  isExcludedPath?: (pathname: string) => boolean;
  log: ScanLogger;
  maxDepth?: number;
  maxUrls?: number;
  /**
   * Pages actually fetched. Each costs a polite (≤ 1/s) request, so this bounds
   * crawl time: 60 ≈ one minute, keeping onboarding under the 3-minute target.
   */
  maxFetches?: number;
  onProgress?: (fetched: number, discovered: number) => void;
}

export interface CrawlResult {
  urls: string[];
  navLinks: string[];
  fetched: number;
}

const isHtml = (contentType: string | null) =>
  !contentType || /text\/html|application\/xhtml/i.test(contentType);

/** BFS link crawl without a browser (spec 6.2 step 3, P1-04). */
export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const maxDepth = options.maxDepth ?? 3;
  const maxUrls = options.maxUrls ?? 2_000;
  const maxFetches = options.maxFetches ?? 60;
  const discovered = new Set<string>();
  const navLinks = new Set<string>();
  let fetched = 0;

  const accept = (url: string) =>
    isSameSite(url, options.rootUrl) &&
    !shouldSkipUrl(url, options.isExcludedPath) &&
    options.isAllowed(url);

  let level = options.seeds
    .map((seed) => normalizeUrl(seed))
    .filter((url): url is string => !!url && accept(url));
  level.forEach((url) => discovered.add(url));

  for (let depth = 0; depth < maxDepth && level.length > 0; depth++) {
    const next: string[] = [];
    for (const pageUrl of level) {
      if (fetched >= maxFetches || discovered.size >= maxUrls) break;
      fetched++;
      if (fetched % 10 === 0) options.onProgress?.(fetched, discovered.size);
      try {
        const response = await options.fetch(pageUrl);
        if (response.status !== 200 || !isHtml(response.headers.get('content-type'))) continue;
        const page = extractLinks(response.text(), response.url);
        if (depth === 0) page.navLinks.forEach((link) => navLinks.add(link));
        for (const link of page.links) {
          if (discovered.size >= maxUrls) break;
          if (discovered.has(link) || !accept(link)) continue;
          discovered.add(link);
          next.push(link);
        }
      } catch (error) {
        options.log.debug('Crawl fetch failed', { url: pageUrl, error: String(error) });
      }
    }
    level = next;
  }

  return { urls: [...discovered], navLinks: [...navLinks], fetched };
}
