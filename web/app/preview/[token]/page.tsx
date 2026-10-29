import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideRenderer } from "@/components/marketing/guide-renderer";
import { Markdown } from "@/components/marketing/markdown";
import { API_BASE_URL } from "@/lib/api";
import { formatPostDate, initials, readingTime, type CmsPost } from "@/lib/cms";
import { toGuideItem } from "@/lib/guide-source";

/** Preview links are private and short-lived, so this page is never cached or indexed. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false, nocache: true },
};

type PreviewPost = CmsPost & { id: string; status: string };

async function loadPreview(token: string): Promise<PreviewPost | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/public/content/preview/${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data: PreviewPost }).data;
  } catch {
    return null;
  }
}

export default async function ContentPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const post = await loadPreview(token);
  if (!post) notFound();

  const editorHref = post.type === "guide" ? `/staff/content/guides/${post.id}` : `/staff/content/posts/${post.id}`;
  const guide = post.type === "guide" ? toGuideItem(post) : null;

  return (
    <div className="min-h-screen bg-page text-ink antialiased">
      <div
        role="region"
        aria-label="Draft preview notice"
        className="sticky top-0 z-50 flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-ink backdrop-blur-md"
      >
        <span>
          Draft preview, status: <strong className="capitalize">{post.status}</strong>. Not visible to search engines. The link expires 7 days after it was created.
        </span>
        <Link href={editorHref} className="rounded-full border border-line bg-surface px-3 py-1 text-ink no-underline hover:bg-subtle">
          Return to editor
        </Link>
      </div>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[840px] px-4 py-12 outline-none sm:px-8">
        <h1 className="m-0 font-serif text-[38px] leading-[42px] font-normal sm:text-[52px] sm:leading-[56px] text-pretty">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-lg leading-relaxed text-muted">{post.excerpt}</p>}

        <div className="my-8 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4 text-sm text-muted">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(post.authorName)}</span>
            <div>
              <div className="font-semibold text-ink">{post.authorName}</div>
              <div className="text-xs">{post.authorJobTitle}</div>
            </div>
          </div>
          <div className="text-xs">
            {post.publishedAt ? formatPostDate(post.publishedAt) : "Not published yet"} · {readingTime(post.bodyMd)}
          </div>
        </div>

        {post.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverUrl} alt={post.coverAlt ?? ""} className="mb-10 w-full rounded-2xl border border-line" />
        )}

        {guide ? (
          <GuideRenderer guide={guide} />
        ) : (
          <div className="text-base leading-relaxed text-ink/90">
            <Markdown>{post.bodyMd || "Nothing written yet."}</Markdown>
          </div>
        )}

        {post.tags.length > 0 && (
          <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-line pt-6 text-xs text-muted">
            {post.tags.map((t) => (
              <span key={t} className="rounded bg-subtle px-2.5 py-1 font-semibold">{t}</span>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
