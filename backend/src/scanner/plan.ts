import type { DiscoveryResult } from './discovery/discover.js';
import { samplePages, type PlannedPage } from './sampling/sample.js';
import { buildTemplateContext, templateKey } from './templates/group.js';

export interface PlanInput {
  discovery: DiscoveryResult;
  pageLimit: number;
  pinnedUrls?: readonly string[];
  previousUrls?: readonly string[];
  seed: string;
}

export interface ScanPlan {
  planned: PlannedPage[];
  /** Template → number of discovered URLs, largest first. */
  templates: { key: string; count: number }[];
}

/** Groups discovered URLs into templates and picks the pages to scan. */
export function planScan({
  discovery,
  pageLimit,
  pinnedUrls = [],
  previousUrls,
  seed,
}: PlanInput): ScanPlan {
  const platform = discovery.platform.platform;
  const ctx = buildTemplateContext(platform, discovery.navLinks);
  const templateOf = (url: string) => templateKey(url, platform, ctx);

  const candidates = discovery.urls.map((u) => ({
    url: u.url,
    templateKey: templateOf(u.url),
    lastmod: u.lastmod,
  }));
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.templateKey, (counts.get(c.templateKey) ?? 0) + 1);

  const pinned = discovery.urls.filter((u) => u.source === 'pinned').map((u) => u.url);
  const planned = samplePages({
    homeUrl: discovery.homeUrl,
    pinnedUrls: pinned.length ? pinned : pinnedUrls,
    candidates,
    pageLimit,
    previousUrls,
    seed,
    templateOf,
  });

  return {
    planned,
    templates: [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  };
}
