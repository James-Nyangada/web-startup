import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { GuideRenderer } from "@/components/marketing/guide-renderer";
import type { FixGuideItem } from "@/lib/fix-guides-data";
import { loadGuide, loadGuides } from "@/lib/guide-source";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo";
import { GUIDE_PLATFORM_LABEL, guideHref, guidePlatformFromSegment, guideUrlSegment } from "@/lib/platforms";

export const revalidate = 300;
export const dynamicParams = true;

interface FixGuidePageProps {
  params: Promise<{
    platform: string;
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const guides = await loadGuides();
  return guides.map((g) => ({
    platform: guideUrlSegment(g.platform),
    slug: g.slug,
  }));
}

export async function generateMetadata({ params }: FixGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await loadGuide(slug);

  if (!guide) {
    return { title: "Fix guide not found" };
  }

  const platformName = GUIDE_PLATFORM_LABEL[guide.platform];
  return pageMetadata({
    title: `${guide.title} | ${platformName} Accessibility Guide`,
    description: guide.summary,
    path: guideHref(guide),
    type: "article",
    modifiedTime: guide.reviewedAt,
  });
}

export default async function FixGuideArticlePage({ params }: FixGuidePageProps) {
  const { slug, platform } = await params;
  const guide = await loadGuide(slug);

  if (!guide || guide.platform !== guidePlatformFromSegment(platform)) {
    notFound();
  }

  const platformName = GUIDE_PLATFORM_LABEL[guide.platform];
  const allGuides = await loadGuides();
  const relatedGuides = allGuides
    .filter((g) => g.platform === guide.platform)
    .filter((g) => g.slug !== guide.slug)
    .slice(0, 3);

  const tocItems = [
    { id: "section-wrong", label: "What's wrong" },
    { id: "section-affects", label: "Who it affects" },
    { id: "section-fix", label: guide.platform === "custom" ? "How to fix on a custom-coded site" : `How to fix on ${platformName}` },
    { id: "section-code", label: "Code example" },
    { id: "section-check", label: "How to check your fix" },
  ];

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />

      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 py-10 sm:px-8 sm:py-16">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Link href="/" className="hover:text-ink no-underline">
              Home
            </Link>
            <span>/</span>
            <Link href="/fix" className="hover:text-ink no-underline">
              Fix guides
            </Link>
            <span>/</span>
            <span className="capitalize">{platformName}</span>
            <span>/</span>
            <span className="text-ink truncate max-w-[300px]">{guide.title}</span>
          </nav>

          {/* Article Header */}
          <div className="flex flex-col gap-4 max-w-[840px]">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  guide.platform === "shopify"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : guide.platform === "wordpress"
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                      : "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                }`}
              >
                {platformName}
              </span>
              <span className="font-mono text-xs text-muted">Rule: {guide.ruleId}</span>
              <span className="text-xs text-muted">•</span>
              <span className="text-xs text-muted">
                Reviewed {new Date(guide.reviewedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </span>
            </div>

            <h1 className="m-0 font-serif text-[38px] leading-[42px] font-normal tracking-[-0.01em] sm:text-[50px] sm:leading-[54px]">
              {guide.title}
            </h1>

            <p className="m-0 text-xl leading-8 text-pretty text-muted">
              {guide.summary}
            </p>
          </div>

          {/* Main Content Layout with Sticky Table of Contents */}
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_280px]">
            {/* Guide Content using Shared Renderer */}
            <div className="min-w-0 max-w-[800px]">
              <GuideRenderer guide={guide} />

              {/* Conversion CTA */}
              <div className="mt-12 rounded-2xl bg-ink p-8 text-surface shadow-card flex flex-col gap-4">
                <h2 className="m-0 font-serif text-2xl font-normal leading-8 text-surface">
                  Check if your site has this issue
                </h2>
                <p className="m-0 text-sm leading-6 text-surface/80">
                  Check any public page free against WCAG 2.2 AA in 30 seconds.
                </p>
                <div className="flex gap-4 pt-2">
                  <Link
                    href="/check"
                    className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover"
                  >
                    Run free scan
                  </Link>
                  <Link
                    href="/sign-up"
                    className="rounded-full border border-surface/30 px-6 py-2.5 text-sm font-semibold text-surface no-underline hover:bg-surface/10"
                  >
                    Start 14-day trial
                  </Link>
                </div>
              </div>
            </div>

            {/* Sidebar TOC & Related Guides */}
            <aside className="sticky top-24 hidden flex-col gap-8 lg:flex">
              {/* Table of Contents */}
              <nav aria-labelledby="toc-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <h2 id="toc-heading" className="m-0 text-xs font-bold uppercase tracking-wider text-muted pb-3 border-b border-line">
                  On this page
                </h2>
                <ul className="m-0 mt-3 list-none flex flex-col gap-2 p-0 text-sm">
                  {tocItems.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="text-muted hover:text-primary no-underline transition-colors block py-1"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Related Guides for this platform */}
              {relatedGuides.length > 0 && (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h2 className="m-0 text-xs font-bold uppercase tracking-wider text-muted pb-3 border-b border-line">
                    Related {platformName} guides
                  </h2>
                  <ul className="m-0 mt-1 list-none flex flex-col gap-3 p-0">
                    {relatedGuides.map((rel: FixGuideItem) => (
                      <li key={rel.slug}>
                        <Link
                          href={guideHref(rel)}
                          className="text-sm font-medium leading-5 text-ink hover:text-primary no-underline block"
                        >
                          {rel.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/fix"
                    className="text-xs font-semibold text-primary hover:text-primary-hover no-underline pt-2 border-t border-line"
                  >
                    View all {allGuides.length} guides →
                  </Link>
                </div>
              )}
            </aside>
          </div>
        </div>
        <ArticleJsonLd
          type="TechArticle"
          title={guide.title}
          description={guide.summary}
          path={guideHref(guide)}
          dateModified={guide.reviewedAt}
        />
        <BreadcrumbJsonLd
          items={[
            { name: "Home", path: "/" },
            { name: "Fix guides", path: "/fix" },
            { name: guide.title, path: guideHref(guide) },
          ]}
        />
      </main>

      <MarketingFooter />
    </div>
  );
}
