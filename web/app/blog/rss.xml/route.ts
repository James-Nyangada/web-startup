import { loadBlogPosts } from "@/lib/blog-source";

export const revalidate = 3600;

const escapeXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** RSS 2.0 feed of published blog posts, built from the CMS. */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://everyvisitor.app";
  const posts = (await loadBlogPosts()).filter((p) => !p.noindex);
  const items = posts
    .map((p) => {
      const url = `${baseUrl}/blog/${p.slug}`;
      const date = p.dateIso ? `<pubDate>${new Date(p.dateIso).toUTCString()}</pubDate>` : "";
      return `<item><title>${escapeXml(p.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid>${date}<description>${escapeXml(p.summary)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>EveryVisitor blog</title><link>${baseUrl}/blog</link><description>Accessibility engineering and compliance insights from EveryVisitor.</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
