import type { MetadataRoute } from "next";
import { loadBlogPosts } from "@/lib/blog-source";
import { loadGuides } from "@/lib/guide-source";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://everyvisitor.app";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/agencies`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/bot`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/accessibility-notes`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/refunds`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/dpa`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/subprocessors`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const [posts, guides] = await Promise.all([loadBlogPosts(), loadGuides()]);
  const blogRoutes: MetadataRoute.Sitemap = posts
    .filter((post) => !post.noindex)
    .map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.dateIso ? new Date(post.dateIso) : now,
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  const guideRoutes: MetadataRoute.Sitemap = guides.map((g) => ({
    url: `${baseUrl}/fix/${g.platform}/${g.slug}`,
    lastModified: new Date(g.reviewedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, { url: `${baseUrl}/fix`, lastModified: now, changeFrequency: "weekly", priority: 0.8 }, ...blogRoutes, ...guideRoutes];
}
