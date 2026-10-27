import type { Metadata } from "next";
import Link from "next/link";
import { HelpLayout } from "@/components/help/help-layout";
import { HELP_ARTICLES, HELP_CATEGORIES } from "@/lib/help-articles";

export const metadata: Metadata = {
  title: "Help centre",
  description: "How to add sites, read issues, verify ownership, invite clients, manage billing and look after your data.",
};

const statusUrl = process.env.NEXT_PUBLIC_STATUS_URL;

/** Help centre basics (P6-13). */
export default function HelpIndexPage() {
  return (
    <HelpLayout>
      <p className="m-0 text-xs font-bold uppercase tracking-wider text-primary">Help centre</p>
      <h1 className="m-0 mt-2 font-serif text-4xl font-normal sm:text-5xl">How can we help?</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
        Short guides to the things people ask us most. Can’t find an answer? Email{" "}
        <a href="mailto:info@everyvisitor.app">info@everyvisitor.app</a>; we reply within one working day.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        {HELP_CATEGORIES.map((category) => (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <h2 id={`cat-${category}`} className="m-0 text-xl font-semibold">
              {category}
            </h2>
            <ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
              {HELP_ARTICLES.filter((a) => a.category === category).map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/help/${a.slug}`}
                    className="ease-ui flex h-full flex-col gap-1 rounded-2xl border border-line bg-surface p-5 text-ink no-underline shadow-card hover:-translate-y-0.5 hover:text-ink hover:shadow-pop"
                  >
                    <span className="font-semibold">{a.title}</span>
                    <span className="text-sm text-muted">{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="more-help" className="mt-12 rounded-2xl border border-line bg-subtle p-6">
        <h2 id="more-help" className="m-0 text-lg font-semibold">
          More help
        </h2>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-sm">
          <li>
            <Link href="/fix">Fix guides for Shopify, WordPress and more</Link>
          </li>
          <li>
            <Link href="/developers/api">API reference (Agency Pro)</Link>
          </li>
          {statusUrl && (
            <li>
              <a href={statusUrl}>System status</a>
            </li>
          )}
          <li>
            <a href="mailto:info@everyvisitor.app">Email info@everyvisitor.app</a>
          </li>
        </ul>
      </section>
    </HelpLayout>
  );
}
