import { API_BASE_URL } from "@/lib/api";

/**
 * Server-side reads of published CMS content (staff spec 3.1). Every function returns `null`
 * when the API cannot be reached, so callers can fall back to the content shipped with the
 * site; an empty list from a working API is returned as-is (nothing is published).
 */

export const CMS_REVALIDATE_SECONDS = 300;

export interface CmsPost {
  type: "blog" | "guide";
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  tags: string[];
  coverUrl: string | null;
  coverAlt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  ruleId: string | null;
  platform: string | null;
  sections: {
    whatsWrong: string;
    whoItAffects: string;
    howToFix: string;
    codeExample?: { incorrect?: string; correct?: string; language?: string };
    howToCheck: string;
  } | null;
  reviewedAt: string | null;
  authorName: string | null;
  authorJobTitle: string | null;
}

export interface CmsChangelogEntry {
  id: string;
  date: string;
  title: string;
  type: "new" | "improved" | "fixed";
  bodyMd: string;
  showInApp: boolean;
}

export interface CmsPage<T = Record<string, unknown>> {
  pageKey: string;
  data: T;
  version: number;
  effectiveDate: string | null;
  publishedAt: string | null;
  changeSummary?: string | null;
}

export interface CmsBanner {
  id: string;
  surface: "site" | "app" | "both";
  message: string;
  linkUrl: string | null;
  style: "info" | "success" | "warning";
  audience: Record<string, unknown>;
  dismissible: boolean;
}

async function cmsGet<T>(path: string, revalidate = CMS_REVALIDATE_SECONDS): Promise<{ status: number; data: T | null } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/public${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { status: 404, data: null };
    if (!res.ok) return null;
    const body = (await res.json()) as { data: T };
    return { status: res.status, data: body.data };
  } catch {
    return null;
  }
}

/** All published posts of a type, newest first, or null if the API is down. */
export async function getPosts(type: "blog" | "guide"): Promise<CmsPost[] | null> {
  const all: CmsPost[] = [];
  for (let page = 1; page <= 20; page++) {
    let body: { data: CmsPost[]; hasMore?: boolean };
    try {
      const res = await fetch(`${API_BASE_URL}/v1/public/content/posts?type=${type}&page=${page}&limit=50`, {
        next: { revalidate: CMS_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      body = (await res.json()) as typeof body;
    } catch {
      return null;
    }
    all.push(...body.data);
    if (!body.hasMore) break;
  }
  return all;
}

/** One published post: the post, `undefined` if it does not exist, or null if the API is down. */
export async function getPost(type: "blog" | "guide", slug: string): Promise<CmsPost | undefined | null> {
  const res = await cmsGet<CmsPost>(`/content/posts/${type}/${encodeURIComponent(slug)}`);
  if (!res) return null;
  return res.status === 404 ? undefined : res.data;
}

export async function getPage<T = Record<string, unknown>>(key: string): Promise<CmsPage<T> | undefined | null> {
  const res = await cmsGet<CmsPage<T>>(`/content/pages/${key}`);
  if (!res) return null;
  return res.status === 404 ? undefined : res.data;
}

export async function getPageVersion(key: string, version: number): Promise<CmsPage | undefined | null> {
  const res = await cmsGet<CmsPage>(`/content/pages/${key}/versions/${version}`);
  if (!res) return null;
  return res.status === 404 ? undefined : res.data;
}

export async function getPageVersions(key: string) {
  const res = await cmsGet<{ version: number; effectiveDate: string | null; changeSummary: string | null; publishedAt: string }[]>(
    `/content/pages/${key}/versions`,
  );
  return res?.data ?? null;
}

export async function getChangelog(): Promise<CmsChangelogEntry[] | null> {
  return (await cmsGet<CmsChangelogEntry[]>("/content/changelog"))?.data ?? null;
}

export async function getRedirects(): Promise<{ fromPath: string; toPath: string; statusCode: number }[] | null> {
  return (await cmsGet<{ fromPath: string; toPath: string; statusCode: number }[]>("/content/redirects"))?.data ?? null;
}

export async function getBanner(surface: "site" | "app"): Promise<CmsBanner | null> {
  return (await cmsGet<CmsBanner | null>(`/banners?surface=${surface}`, 60))?.data ?? null;
}

const WORDS_PER_MINUTE = 220;
export function readingTime(markdown: string): string {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`;
}

export function formatPostDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function initials(name: string | null): string {
  return (name ?? "EV")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
