import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { loadBlogPosts } from "@/lib/blog-source";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Accessibility Engineering Blog",
  description: "In-depth technical guides, WCAG 2.2 analysis, and e-commerce compliance insights from the EveryVisitor engineering team.",
  path: "/blog",
});

const H2 = "m-0 font-serif text-[42px] leading-[46px] font-normal sm:text-[56px] sm:leading-[60px]";

export default async function BlogIndexPage() {
  const posts = await loadBlogPosts();
  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8">
          <div className="flex flex-col gap-4 border-b border-line pb-8 mb-12">
            <span className="text-xs font-bold tracking-[0.14em] uppercase text-primary">
              Engineering &amp; Compliance Journal
            </span>
            <h1 className={H2}>
              Insights on <em>accessible e-commerce</em>
            </h1>
            <p className="m-0 max-w-[700px] text-lg text-muted">
              Deep dives into WCAG 2.2, European Accessibility Act readiness, Shopify Liquid theme optimization, and building inclusive online shopping experiences.
            </p>
          </div>

          {posts.length === 0 && <p className="text-muted">No articles are published yet.</p>}
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-subtle px-2 py-0.5 text-xs font-medium text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <h2 className="m-0 text-xl font-bold leading-snug">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-ink no-underline hover:text-primary transition-colors"
                    >
                      {post.title}
                    </Link>
                  </h2>

                  <p className="m-0 text-sm leading-relaxed text-muted line-clamp-3">
                    {post.summary}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                      {post.author.avatar}
                    </span>
                    <span>{post.author.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{post.dateLabel}</span>
                    <span>·</span>
                    <span>{post.readingTime}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
