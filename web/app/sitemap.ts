import type { MetadataRoute } from "next";
import { loadBlogPosts } from "@/lib/blog-source";
import { loadGuides } from "@/lib/guide-source";
import { HELP_ARTICLES } from "@/lib/help-articles";
import { absoluteUrl } from "@/lib/seo";
import { guideHref } from "@/lib/platforms";

export const revalidate = 3600;

type Freq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

const STATIC: { path: string; priority: number; freq: Freq }[] = [
  { path: "/", priority: 1.0, freq: "weekly" },
  { path: "/check", priority: 0.9, freq: "monthly" },
  { path: "/pricing", priority: 0.9, freq: "weekly" },
  { path: "/agencies", priority: 0.9, freq: "weekly" },
  { path: "/fix", priority: 0.8, freq: "weekly" },
  { path: "/blog", priority: 0.8, freq: "daily" },
  { path: "/help", priority: 0.6, freq: "monthly" },
  { path: "/changelog", priority: 0.6, freq: "weekly" },
  { path: "/developers/api", priority: 0.5, freq: "monthly" },
  { path: "/bot", priority: 0.5, freq: "monthly" },
  { path: "/accessibility-notes", priority: 0.4, freq: "monthly" },
  { path: "/legal/terms", priority: 0.3, freq: "yearly" },
  { path: "/legal/privacy", priority: 0.3, freq: "yearly" },
  { path: "/legal/refunds", priority: 0.3, freq: "yearly" },
  { path: "/legal/dpa", priority: 0.3, freq: "yearly" },
  { path: "/legal/subprocessors", priority: 0.3, freq: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [posts, guides] = await Promise.all([loadBlogPosts(), loadGuides()]);

  return [
    ...STATIC.map((s) => ({ url: absoluteUrl(s.path), lastModified: now, changeFrequency: s.freq, priority: s.priority })),
    ...posts
      // Posts whose canonical points elsewhere belong in that site's sitemap, not ours.
      .filter((post) => !post.noindex && (!post.canonicalUrl || post.canonicalUrl === absoluteUrl(`/blog/${post.slug}`)))
      .map((post) => ({
        url: absoluteUrl(`/blog/${post.slug}`),
        lastModified: post.dateIso ? new Date(post.dateIso) : now,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
    ...guides.map((g) => ({
      url: absoluteUrl(guideHref(g)),
      lastModified: new Date(g.reviewedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...HELP_ARTICLES.map((a) => ({
      url: absoluteUrl(`/help/${a.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
