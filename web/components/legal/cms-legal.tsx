import Link from "next/link";
import { Markdown } from "@/components/marketing/markdown";
import { getPage, getPageVersions, type CmsPage } from "@/lib/cms";

export interface LegalContent {
  title: string;
  bodyMd: string;
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;

/**
 * A legal page published from the staff area. "Last updated" and the effective date come from
 * the publish itself, so they can never be out of step with the text.
 */
export async function CmsLegal({
  slug,
  page,
  currentVersion,
}: {
  slug: string;
  page: CmsPage;
  /** Set when showing an old version, so the page can point back to the current one. */
  currentVersion?: number;
}) {
  const content = page.data as unknown as LegalContent;
  const versions = ["terms", "privacy", "refunds", "dpa", "subprocessors"].includes(slug)
    ? ((await getPageVersions(`legal.${slug}`)) ?? [])
    : [];
  const isOld = currentVersion !== undefined && currentVersion !== page.version;

  return (
    <div className="prose prose-slate max-w-none text-ink">
      {isOld && (
        <div role="note" className="mb-6 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-ink">
          This is version {page.version}, an earlier version kept for reference.{" "}
          <Link href={`/legal/${slug}`} className="font-semibold underline">
            Read the current version
          </Link>
          .
        </div>
      )}
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">EveryVisitor Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">{content.title}</h1>
        <p className="mt-2 text-sm text-muted">
          Last updated: {fmt(page.publishedAt)} · Effective date: {fmt(page.effectiveDate ?? page.publishedAt)} · Version {page.version}
        </p>
      </div>
      <div className="text-sm leading-relaxed text-ink/90">
        <Markdown>{content.bodyMd}</Markdown>
      </div>
      {versions.length > 1 && (
        <section aria-label="Earlier versions" className="mt-12 border-t border-line pt-6">
          <h2 className="m-0 text-base font-bold text-ink">Earlier versions</h2>
          <ul className="mt-2 flex flex-col gap-1 pl-4 text-sm">
            {versions.map((v) => (
              <li key={v.version}>
                <Link href={`/legal/${slug}/v/${v.version}`} className="underline">
                  Version {v.version}
                </Link>{" "}
                <span className="text-muted">
                  effective {fmt(v.effectiveDate ?? v.publishedAt)}
                  {v.changeSummary ? `. ${v.changeSummary}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The published CMS version of a legal page, or undefined to fall back to the built-in text. */
export async function loadLegalPage(slug: string): Promise<CmsPage | undefined> {
  const page = await getPage(`legal.${slug}`);
  return page ?? undefined;
}
