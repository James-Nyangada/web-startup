import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { BLOG_POSTS } from "@/lib/blog-data";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) {
    return { title: "Article Not Found" };
  }
  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <article className="mx-auto max-w-[840px] px-4 py-16 sm:px-8">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumbs" className="mb-8 flex items-center gap-2 text-xs text-muted">
            <Link href="/" className="hover:text-ink no-underline">
              Home
            </Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-ink no-underline">
              Blog
            </Link>
            <span>/</span>
            <span className="text-ink truncate max-w-[300px]">{post.title}</span>
          </nav>

          {/* Article Header */}
          <header className="border-b border-line pb-8 mb-10">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-subtle px-2.5 py-1 text-xs font-semibold text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="m-0 font-serif text-[38px] leading-[42px] font-normal sm:text-[52px] sm:leading-[56px] text-pretty">
              {post.title}
            </h1>

            <p className="mt-4 text-lg leading-relaxed text-muted text-pretty">
              {post.summary}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-line text-sm text-muted">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {post.author.avatar}
                </span>
                <div>
                  <div className="font-semibold text-ink">{post.author.name}</div>
                  <div className="text-xs text-muted">{post.author.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <time dateTime={post.date}>{post.date}</time>
                <span>·</span>
                <span>{post.readingTime}</span>
              </div>
            </div>
          </header>

          {/* Article Content */}
          <div className="flex flex-col gap-10 text-base leading-relaxed text-ink/90">
            {post.content.map((section, idx) => (
              <section key={idx} className="flex flex-col gap-4">
                <h2 className="m-0 font-serif text-2xl sm:text-3xl font-normal text-ink">
                  {section.sectionTitle}
                </h2>
                {section.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="m-0 text-pretty">
                    {p}
                  </p>
                ))}

                {section.codeBlock && (
                  <div className="my-2 rounded-xl border border-line bg-surface shadow-card overflow-hidden">
                    {section.codeBlock.caption && (
                      <div className="border-b border-line bg-subtle px-4 py-2 text-xs font-semibold text-muted">
                        {section.codeBlock.caption}
                      </div>
                    )}
                    <pre className="overflow-x-auto p-4 font-mono text-xs text-ink leading-relaxed">
                      <code>{section.codeBlock.code}</code>
                    </pre>
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Article Footer & Call to Action */}
          <section className="mt-16 rounded-2xl border border-line bg-subtle p-8 text-center flex flex-col items-center gap-4">
            <h3 className="m-0 font-serif text-2xl font-normal">
              Test your site for accessibility regressions
            </h3>
            <p className="m-0 max-w-md text-sm text-muted">
              Get weekly automated scans, plain-language fix guides, and dated proof of progress for Shopify and WordPress.
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <Link
                href="/sign-up"
                className="ease-ui flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
              >
                Start free trial
              </Link>
              <Link
                href="/agencies"
                className="ease-ui flex h-10 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink no-underline hover:border-primary"
              >
                Explore agency plans
              </Link>
            </div>
          </section>
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}
