import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpLayout } from "@/components/help/help-layout";
import { HELP_ARTICLES, findHelpArticle, type HelpBlock } from "@/lib/help-articles";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = findHelpArticle((await params).slug);
  return article
    ? pageMetadata({ title: `${article.title} · Help`, description: article.summary, path: `/help/${article.slug}`, type: "article" })
    : { title: "Help" };
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "h":
      return <h2 className="m-0 mt-8 text-xl font-semibold">{block.text}</h2>;
    case "p":
      return <p className="m-0 mt-4 text-base leading-7">{block.text}</p>;
    case "ul":
      return (
        <ul className="m-0 mt-4 flex list-disc flex-col gap-2 pl-6 text-base leading-7">
          {block.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="m-0 mt-4 flex list-decimal flex-col gap-2 pl-6 text-base leading-7">
          {block.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre tabIndex={0} className="m-0 mt-3 overflow-x-auto rounded-xl border border-line bg-sunk p-4 font-mono text-sm">
          <code>{block.text}</code>
        </pre>
      );
    case "note":
      return (
        <p role="note" className="m-0 mt-5 rounded-xl border border-line bg-primary-soft px-4 py-3 text-sm leading-6 text-ink">
          {block.text}
        </p>
      );
  }
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = findHelpArticle((await params).slug);
  if (!article) notFound();
  const related = HELP_ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug);

  return (
    <HelpLayout>
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="m-0 flex list-none gap-2 p-0 text-muted">
          <li>
            <Link href="/help">Help centre</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>{article.category}</li>
        </ol>
      </nav>
      <article aria-labelledby="article-title" className="mt-6 max-w-[42rem]">
        <h1 id="article-title" className="m-0 font-serif text-4xl font-normal">
          {article.title}
        </h1>
        <p className="m-0 mt-3 text-lg leading-7 text-muted">{article.summary}</p>
        {article.body.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </article>

      <aside aria-labelledby="related-title" className="mt-12 max-w-[42rem] border-t border-line pt-6">
        <h2 id="related-title" className="m-0 text-base font-semibold">
          {related.length ? `More on ${article.category.toLowerCase()}` : "Still stuck?"}
        </h2>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-sm">
          {related.map((a) => (
            <li key={a.slug}>
              <Link href={`/help/${a.slug}`}>{a.title}</Link>
            </li>
          ))}
          <li>
            <a href="mailto:info@everyvisitor.app">Email info@everyvisitor.app</a>
          </li>
        </ul>
      </aside>
    </HelpLayout>
  );
}
