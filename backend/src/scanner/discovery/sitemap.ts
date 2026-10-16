import { SaxesParser } from 'saxes';
import type { GuardedFetch } from '../net/guarded-fetch.js';
import type { ScanLogger } from '../types.js';

export interface SitemapEntry {
  url: string;
  lastmod?: string;
}

export interface ParsedSitemap {
  kind: 'urlset' | 'sitemapindex' | 'unknown';
  locs: SitemapEntry[];
}

/**
 * Streaming parse of a sitemap or sitemap index. Malformed XML stops parsing
 * but keeps every <loc> read up to that point.
 */
export function parseSitemap(xml: string, maxEntries: number): ParsedSitemap & { error?: string } {
  const parser = new SaxesParser({ xmlns: false });
  const result: ParsedSitemap & { error?: string } = { kind: 'unknown', locs: [] };
  let current: SitemapEntry | undefined;
  let entryDepth = 0;
  let field: 'loc' | 'lastmod' | undefined;
  let text = '';
  let depth = 0;

  // Only un-prefixed tags count: <image:loc> and <video:loc> inside a <url> must
  // not overwrite the page's own <loc>.
  const plain = (name: string) => (name.includes(':') ? undefined : name.toLowerCase());

  parser.on('opentag', (tag) => {
    depth++;
    const name = plain(tag.name);
    if (depth === 1 && (name === 'urlset' || name === 'sitemapindex')) result.kind = name;
    if (depth === 2 && (name === 'url' || name === 'sitemap')) {
      current = { url: '' };
      entryDepth = depth;
    }
    if (current && depth === entryDepth + 1 && (name === 'loc' || name === 'lastmod')) {
      field = name;
      text = '';
    }
  });
  parser.on('text', (value) => {
    if (field) text += value;
  });
  parser.on('cdata', (value) => {
    if (field) text += value;
  });
  parser.on('closetag', (tag) => {
    const name = plain(tag.name);
    if (current && field && field === name && depth === entryDepth + 1) {
      if (name === 'loc') current.url = text.trim();
      else current.lastmod = text.trim();
      field = undefined;
    }
    if (current && depth === entryDepth && (name === 'url' || name === 'sitemap')) {
      if (current.url && result.locs.length < maxEntries) result.locs.push(current);
      current = undefined;
    }
    depth--;
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    result.error = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
  return result;
}

export interface SitemapDiscoveryOptions {
  maxDepth?: number;
  maxUrls?: number;
  /** Sitemap files read per discovery. Each costs a polite (≤ 1/s) request. */
  maxSitemaps?: number;
  onSitemapRead?: (url: string, urlsSoFar: number) => void;
}

export interface SitemapDiscoveryResult {
  entries: SitemapEntry[];
  sitemapsRead: string[];
  errors: { url: string; error: string }[];
}

/** Candidate sitemap locations in priority order (spec 6.2 step 2). */
export function sitemapCandidates(rootUrl: string, fromRobots: readonly string[]): string[] {
  const defaults = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'].map(
    (path) => new URL(path, rootUrl).href,
  );
  return [...new Set([...fromRobots, ...defaults])];
}

/**
 * Reads sitemaps breadth-first, following indexes up to `maxDepth` levels and
 * stopping at `maxUrls`. Robots-listed sitemaps win; the default paths are only
 * tried when robots.txt lists none that work.
 */
export async function discoverFromSitemaps(
  rootUrl: string,
  robotsSitemaps: readonly string[],
  fetch: GuardedFetch,
  log: ScanLogger,
  options: SitemapDiscoveryOptions = {},
): Promise<SitemapDiscoveryResult> {
  const maxDepth = options.maxDepth ?? 3;
  const maxUrls = options.maxUrls ?? 50_000;
  const maxSitemaps = options.maxSitemaps ?? 50;
  const result: SitemapDiscoveryResult = { entries: [], sitemapsRead: [], errors: [] };
  const seenSitemaps = new Set<string>();
  const seenUrls = new Set<string>();

  const crawl = async (queue: string[]) => {
    let level: string[] = queue;
    for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
      const next: string[] = [];
      for (const sitemapUrl of level) {
        if (seenSitemaps.has(sitemapUrl) || seenSitemaps.size >= maxSitemaps) continue;
        if (result.entries.length >= maxUrls) return;
        seenSitemaps.add(sitemapUrl);
        try {
          const response = await fetch(sitemapUrl, {
            accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5',
          });
          if (response.status < 200 || response.status >= 300) continue;
          if (response.truncated)
            log.warn('Sitemap was cut off at the size limit', { url: sitemapUrl });
          const parsed = parseSitemap(response.text(), maxUrls - result.entries.length);
          if (parsed.kind === 'unknown') continue;
          result.sitemapsRead.push(sitemapUrl);
          options.onSitemapRead?.(sitemapUrl, result.entries.length + parsed.locs.length);
          if (parsed.error) {
            result.errors.push({ url: sitemapUrl, error: parsed.error });
            log.warn('Malformed sitemap; kept the URLs read before the error', {
              url: sitemapUrl,
              error: parsed.error,
            });
          }
          if (parsed.kind === 'sitemapindex') {
            if (depth < maxDepth) next.push(...parsed.locs.map((entry) => entry.url));
          } else {
            for (const entry of parsed.locs) {
              if (seenUrls.has(entry.url)) continue;
              seenUrls.add(entry.url);
              result.entries.push(entry);
              if (result.entries.length >= maxUrls) return;
            }
          }
        } catch (error) {
          result.errors.push({ url: sitemapUrl, error: String(error) });
          log.debug('Sitemap fetch failed', { url: sitemapUrl, error: String(error) });
        }
      }
      level = next;
    }
  };

  await crawl([...new Set(robotsSitemaps)]);
  if (result.sitemapsRead.length === 0) {
    await crawl(sitemapCandidates(rootUrl, []).filter((url) => !seenSitemaps.has(url)));
  }
  return result;
}
