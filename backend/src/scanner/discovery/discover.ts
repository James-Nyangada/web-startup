import type { GuardedFetch } from '../net/guarded-fetch.js';
import { HostRateLimiter } from '../net/rate-limiter.js';
import { detectPlatform, type PlatformResult } from '../platform/detect.js';
import type { Platform, ScanLogger } from '../types.js';
import { isSameSite, normalizeUrl } from '../url/normalize.js';
import { createExcludedPathMatcher, shouldSkipUrl } from '../url/skip-patterns.js';
import { crawl } from './crawler.js';
import { extractLinks } from './html-links.js';
import { fetchRobots } from './robots.js';
import { discoverFromSitemaps } from './sitemap.js';

export interface DiscoverInput {
  rootUrl: string;
  pinnedUrls?: readonly string[];
  excludedPaths?: readonly string[];
  /** Skip detection when the site's platform is already known. */
  platform?: Platform;
  fetch: GuardedFetch;
  userAgent: string;
  log: ScanLogger;
  limiter?: HostRateLimiter;
  /** Below this many sitemap URLs we also crawl (spec 6.2 step 3). */
  crawlThreshold?: number;
  maxSitemapUrls?: number;
  maxCrawlUrls?: number;
  /** Progress callback for the CLI and, later, live scan progress. */
  onProgress?: (message: string) => void;
}

export type UrlSource = 'home' | 'pinned' | 'sitemap' | 'crawl';

export interface DiscoveredUrl {
  url: string;
  lastmod?: string;
  source: UrlSource;
}

export interface DiscoveryResult {
  rootUrl: string;
  homeUrl: string;
  platform: PlatformResult;
  urls: DiscoveredUrl[];
  navLinks: string[];
  robots: { found: boolean; crawlDelaySeconds: number | undefined; sitemaps: string[] };
  sitemapsRead: string[];
  crawled: boolean;
  stats: { sitemapUrls: number; crawlUrls: number; dropped: number; requestIntervalMs: number };
  errors: { url: string; error: string }[];
}

/** Spec 6.2: robots.txt → sitemaps → (crawl if too few) → filter. Uses only the guarded fetch. */
export async function discover(input: DiscoverInput): Promise<DiscoveryResult> {
  const progress = input.onProgress ?? (() => {});
  const rootUrl = new URL(input.rootUrl).origin;
  const limiter = input.limiter ?? new HostRateLimiter();
  const politeFetch: GuardedFetch = (url, init) =>
    limiter.schedule(new URL(url).host, () => input.fetch(url, init));
  const isExcludedPath = createExcludedPathMatcher(input.excludedPaths ?? []);

  // 1. robots.txt
  const robots = await fetchRobots(rootUrl, politeFetch, input.userAgent, input.log);
  limiter.applyCrawlDelay(robots.crawlDelay);
  progress(
    `robots.txt: ${robots.found ? 'found' : 'not found'}` +
      (robots.crawlDelay ? `, crawl-delay ${robots.crawlDelay}s` : '') +
      `, ${robots.sitemaps.length} sitemap(s) listed`,
  );

  // Home page: platform detection, navigation links, and the canonical home URL after redirects.
  let homeUrl = normalizeUrl('/', rootUrl)!;
  let platform: PlatformResult = { platform: input.platform ?? 'unknown', evidence: [] };
  let navLinks: string[] = [];
  let homeLinks: string[] = [];
  try {
    const home = await politeFetch(homeUrl);
    if (home.status === 200) {
      homeUrl = normalizeUrl(home.url) ?? homeUrl;
      const page = extractLinks(home.text(), home.url);
      navLinks = page.navLinks;
      homeLinks = page.links;
      if (!input.platform) platform = detectPlatform({ html: home.text(), headers: home.headers });
    } else {
      input.log.warn('Home page did not return 200', { status: home.status });
    }
  } catch (error) {
    input.log.warn('Home page could not be fetched', { error: String(error) });
  }
  progress(
    `Platform: ${platform.platform}${platform.evidence.length ? ` (${platform.evidence.join(', ')})` : ''}`,
  );

  const accept = (url: string) =>
    isSameSite(url, rootUrl) && !shouldSkipUrl(url, isExcludedPath) && robots.isAllowed(url);

  const found = new Map<string, DiscoveredUrl>();
  let dropped = 0;
  // http/https and www/apex variants of a page are one page: key them all on the
  // home page's final origin (after its redirects).
  const homeOrigin = new URL(homeUrl).origin;
  const canonical = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url || !isSameSite(url, rootUrl)) return url;
    const parsed = new URL(url);
    return normalizeUrl(`${homeOrigin}${parsed.pathname}${parsed.search}`);
  };

  const addUrl = (raw: string, source: UrlSource, lastmod?: string) => {
    const url = canonical(raw);
    if (!url || !accept(url)) {
      dropped++;
      return;
    }
    if (!found.has(url)) found.set(url, { url, source, ...(lastmod && { lastmod }) });
  };

  addUrl(homeUrl, 'home');
  for (const pinned of input.pinnedUrls ?? []) addUrl(pinned, 'pinned');

  // 2. Sitemaps
  const sitemaps = await discoverFromSitemaps(rootUrl, robots.sitemaps, politeFetch, input.log, {
    maxUrls: input.maxSitemapUrls ?? 50_000,
    onSitemapRead: (url, urlsSoFar) => progress(`  sitemap ${url} (${urlsSoFar} URLs so far)`),
  });
  for (const entry of sitemaps.entries) addUrl(entry.url, 'sitemap', entry.lastmod);
  const sitemapUrls = found.size;
  progress(
    `Sitemaps: read ${sitemaps.sitemapsRead.length}, ${sitemaps.entries.length} URL(s) listed`,
  );

  // 3. Crawl when the sitemaps gave us too little.
  const threshold = input.crawlThreshold ?? 20;
  let crawled = false;
  let crawlUrls = 0;
  if (found.size < threshold) {
    crawled = true;
    progress(`Crawling (fewer than ${threshold} URLs from sitemaps)…`);
    const result = await crawl({
      rootUrl,
      seeds: [homeUrl, ...(input.pinnedUrls ?? []), ...homeLinks],
      fetch: politeFetch,
      isAllowed: (url) => robots.isAllowed(url),
      isExcludedPath,
      log: input.log,
      maxUrls: input.maxCrawlUrls ?? 2_000,
      onProgress: (fetched, discovered) =>
        progress(`  crawled ${fetched} page(s), ${discovered} URL(s) so far`),
    });
    const before = found.size;
    for (const url of result.urls) addUrl(url, 'crawl');
    crawlUrls = found.size - before;
    progress(`Crawl: fetched ${result.fetched} page(s), found ${crawlUrls} new URL(s)`);
  }

  return {
    rootUrl,
    homeUrl,
    platform,
    urls: [...found.values()],
    navLinks,
    robots: {
      found: robots.found,
      crawlDelaySeconds: robots.crawlDelay,
      sitemaps: robots.sitemaps,
    },
    sitemapsRead: sitemaps.sitemapsRead,
    crawled,
    stats: { sitemapUrls, crawlUrls, dropped, requestIntervalMs: limiter.intervalMs },
    errors: sitemaps.errors,
  };
}
