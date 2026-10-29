import { BLOG_POSTS, type BlogPost } from "@/lib/blog-data";
import { formatPostDate, getPost, getPosts, initials, readingTime, type CmsPost } from "@/lib/cms";

/** One shape for a post, whether it came from the CMS or from the posts shipped with the site. */
export interface BlogView {
  slug: string;
  title: string;
  summary: string;
  dateLabel: string;
  dateIso: string | null;
  readingTime: string;
  author: { name: string; role: string; avatar: string };
  tags: string[];
  coverUrl: string | null;
  coverAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  bodyMd: string | null;
  legacy: BlogPost | null;
}

function fromCms(p: CmsPost): BlogView {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.excerpt ?? "",
    dateLabel: formatPostDate(p.publishedAt),
    dateIso: p.publishedAt,
    readingTime: readingTime(p.bodyMd),
    author: { name: p.authorName ?? "EveryVisitor", role: p.authorJobTitle ?? "", avatar: initials(p.authorName) },
    tags: p.tags,
    coverUrl: p.coverUrl,
    coverAlt: p.coverAlt,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    ogUrl: p.ogUrl,
    canonicalUrl: p.canonicalUrl,
    noindex: p.noindex,
    bodyMd: p.bodyMd,
    legacy: null,
  };
}

function fromStatic(p: BlogPost): BlogView {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    dateLabel: p.date,
    dateIso: null,
    readingTime: p.readingTime,
    author: p.author,
    tags: p.tags,
    coverUrl: null,
    coverAlt: null,
    seoTitle: null,
    seoDescription: null,
    ogUrl: null,
    canonicalUrl: null,
    noindex: false,
    bodyMd: null,
    legacy: p,
  };
}

/** Published posts from the CMS; the shipped posts only when the API cannot be reached. */
export async function loadBlogPosts(): Promise<BlogView[]> {
  const posts = await getPosts("blog");
  return posts ? posts.map(fromCms) : BLOG_POSTS.map(fromStatic);
}

export async function loadBlogPost(slug: string): Promise<BlogView | undefined> {
  const post = await getPost("blog", slug);
  if (post === null) {
    const fallback = BLOG_POSTS.find((p) => p.slug === slug);
    return fallback ? fromStatic(fallback) : undefined;
  }
  return post ? fromCms(post) : undefined;
}
