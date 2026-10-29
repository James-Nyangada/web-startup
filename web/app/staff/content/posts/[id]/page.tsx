"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StaffShell, btn, input, card } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { staffApi, type ContentPost, type ContentRevision, type MediaAsset } from "@/lib/admin-api";
import { diffLines } from "@/lib/line-diff";
import { Markdown } from "@/components/marketing/markdown";
import { Icon, I } from "@/components/icons";

type Tab = "edit" | "seo" | "revisions";
type Warning = { type: string; message: string; detail?: string };
type Author = { id: string; displayName: string; jobTitle: string | null };

const AUTOSAVE_MS = 10_000;
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `<input type="datetime-local">` wants local time without a zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MediaPicker({
  onPick,
  onClose,
}: {
  onPick: (asset: MediaAsset) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaAsset[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let cancelled = false;
    staffApi
      .listMedia({ q: q || undefined, mime: "image/" })
      .then((res) => !cancelled && setItems(res.data.filter((m) => m.mime.startsWith("image/"))))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Choose an image" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-pop">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-ink">Choose an image from the media library</h2>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Close
          </button>
        </div>
        <label htmlFor="media-search" className="sr-only">Search images</label>
        <input id="media-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name or alt text" className={`${input} mb-3`} />
        {items === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">
            No images yet. <Link href="/staff/media" className="underline">Upload one in the media library</Link>.
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-line bg-subtle p-2 text-left hover:border-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.url && <img src={m.url} alt={m.altText ?? ""} className="aspect-video w-full rounded-lg object-cover" loading="lazy" />}
                  <span className="truncate text-xs font-semibold text-ink">{m.filename}</span>
                  <span className="truncate text-[11px] text-muted">
                    {m.isDecorative ? "Decorative" : m.altText || "No alt text"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const { showToast } = useToast();

  const [post, setPost] = useState<Partial<ContentPost>>({
    type: "blog",
    title: "",
    slug: "",
    excerpt: "",
    bodyMd: "",
    tags: [],
    seoTitle: "",
    seoDescription: "",
    noindex: false,
    status: "draft",
  });
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "free" | "taken">("idle");

  const [authors, setAuthors] = useState<Author[]>([]);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [picker, setPicker] = useState<null | "cover" | "og" | "inline">(null);
  const [cover, setCover] = useState<MediaAsset | null>(null);
  const [og, setOg] = useState<MediaAsset | null>(null);
  const [publishAtLocal, setPublishAtLocal] = useState("");
  const [diffRev, setDiffRev] = useState<ContentRevision | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const postRef = useRef(post);
  postRef.current = post;

  const update = useCallback((patch: Partial<ContentPost>) => {
    setPost((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  // Load authors (real staff only), the post, its revisions and its media.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await staffApi.listAuthors();
        if (cancelled) return;
        setAuthors(list);
        if (isNew) {
          setPost((prev) => ({ ...prev, authorStaffId: prev.authorStaffId ?? list[0]?.id }));
          return;
        }
        const fetched = await staffApi.getPost(id);
        if (cancelled) return;
        setPost(fetched);
        setSavedSlug(fetched.slug);
        setPublishAtLocal(toLocalInput(fetched.publishAt));
        setRevisions((await staffApi.getPostRevisions(id)) || []);
        const media = await staffApi.listMedia({}).then((r) => r.data).catch(() => [] as MediaAsset[]);
        setCover(media.find((m) => m.id === fetched.coverMediaId) ?? null);
        setOg(media.find((m) => m.id === fetched.ogMediaId) ?? null);
      } catch {
        showToast("Failed to load post.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, showToast]);

  // Content checks, 500 ms after typing stops. Editing the text clears the acknowledgement.
  useEffect(() => {
    if (!post.bodyMd && !post.title) return;
    const t = setTimeout(() => {
      staffApi
        .checkContent({ title: post.title, bodyMd: post.bodyMd, excerpt: post.excerpt || "" })
        .then((res) => {
          setWarnings(res.warnings || []);
          setAcknowledged(false);
        })
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [post.title, post.bodyMd, post.excerpt]);

  // Live slug uniqueness check.
  useEffect(() => {
    const slug = post.slug?.trim();
    if (!slug) {
      setSlugState("idle");
      return;
    }
    setSlugState("checking");
    const t = setTimeout(() => {
      staffApi
        .slugAvailable({ type: post.type ?? "blog", slug, excludeId: isNew ? undefined : id })
        .then((r) => setSlugState(r.available ? "free" : "taken"))
        .catch(() => setSlugState("idle"));
    }, 400);
    return () => clearTimeout(t);
  }, [post.slug, post.type, id, isNew]);

  const save = useCallback(
    async (manual: boolean) => {
      const current = postRef.current;
      if (!current.title?.trim() || !current.slug?.trim()) {
        if (manual) showToast("A title and a slug are needed to save.");
        return;
      }
      setSaving(true);
      try {
        if (isNew) {
          const created = await staffApi.createPost(current);
          showToast("Draft created.");
          router.replace(`/staff/content/posts/${created.id}`);
        } else {
          const updated = await staffApi.updatePost(id, current);
          setPost((prev) => ({ ...prev, ...updated }));
          setSavedSlug(updated.slug);
          setDirty(false);
          setLastSavedAt(new Date());
          if (manual) showToast("Saved.");
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not save.");
      } finally {
        setSaving(false);
      }
    },
    [id, isNew, router, showToast],
  );

  // Autosave every 10 s. A live post is never autosaved: its edits go out only on an explicit save.
  useEffect(() => {
    if (isNew) return;
    const timer = setInterval(() => {
      const current = postRef.current;
      if (dirty && !saving && current.status !== "published" && slugState !== "taken") void save(false);
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [dirty, saving, isNew, slugState, save]);

  const needsAck = warnings.length > 0 && !acknowledged;

  const publishNow = async () => {
    if (dirty) await save(false);
    setSaving(true);
    try {
      setPost(await staffApi.publishPost(id));
      setDirty(false);
      showToast("Published. The site rebuild has been queued.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setSaving(false);
    }
  };

  const schedule = async () => {
    if (!publishAtLocal) {
      showToast("Choose a date and time first.");
      return;
    }
    if (dirty) await save(false);
    setSaving(true);
    try {
      setPost(await staffApi.schedulePost(id, new Date(publishAtLocal).toISOString()));
      showToast("Scheduled.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not schedule.");
    } finally {
      setSaving(false);
    }
  };

  const unpublish = async () => {
    setSaving(true);
    try {
      setPost(await staffApi.unpublishPost(id));
      showToast(post.status === "scheduled" ? "Schedule cancelled." : "Unpublished.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not unpublish.");
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async () => {
    try {
      const res = await staffApi.previewLink(id);
      window.open(res.previewUrl, "_blank", "noopener");
    } catch {
      showToast("Could not create a preview link.");
    }
  };

  // Markdown toolbar: acts on the selection, not just the end of the text.
  const edit = (apply: (selected: string) => { text: string; select?: [number, number] }) => {
    const el = bodyRef.current;
    const body = postRef.current.bodyMd ?? "";
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const { text, select } = apply(body.slice(start, end));
    update({ bodyMd: body.slice(0, start) + text + body.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      const [a, b] = select ?? [start + text.length, start + text.length];
      el?.setSelectionRange(start + a, start + b);
    });
  };
  const wrap = (before: string, after: string, placeholder: string) => () =>
    edit((sel) => {
      const inner = sel || placeholder;
      return { text: `${before}${inner}${after}`, select: [before.length, before.length + inner.length] };
    });
  const linePrefix = (prefix: string, placeholder: string) => () =>
    edit((sel) => {
      const lines = (sel || placeholder).split("\n").map((l) => `${prefix}${l}`);
      const text = `${lines.join("\n")}`;
      return { text, select: [prefix.length, text.length] };
    });
  const TOOLBAR: { label: string; title: string; run: () => void; className?: string }[] = [
    { label: "H2", title: "Heading 2", run: linePrefix("## ", "Heading"), className: "font-bold" },
    { label: "H3", title: "Heading 3", run: linePrefix("### ", "Heading"), className: "font-bold" },
    { label: "B", title: "Bold", run: wrap("**", "**", "bold text"), className: "font-bold" },
    { label: "I", title: "Italic", run: wrap("*", "*", "italic text"), className: "italic" },
    { label: "List", title: "Bulleted list", run: linePrefix("- ", "List item") },
    { label: "1.", title: "Numbered list", run: linePrefix("1. ", "List item") },
    { label: "Quote", title: "Quote", run: linePrefix("> ", "Quote") },
    { label: "Link", title: "Link", run: wrap("[", "](https://)", "link text") },
    { label: "Code", title: "Code block", run: wrap("\n```\n", "\n```\n", "code"), className: "font-mono text-[11px]" },
    {
      label: "Table",
      title: "Table",
      run: () =>
        edit(() => ({ text: "\n| Column A | Column B |\n| --- | --- |\n| Cell | Cell |\n" })),
    },
  ];

  const insertImage = (asset: MediaAsset) => {
    const alt = asset.isDecorative ? "" : asset.altText || asset.filename;
    edit(() => ({ text: `\n![${alt}](${asset.url})\n` }));
    setPicker(null);
  };

  const words = (post.bodyMd || "").trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMin = Math.max(1, Math.ceil(words / 200));
  const slugChangeRedirects = !isNew && post.status === "published" && savedSlug && post.slug !== savedSlug;

  const diff = useMemo(
    () => (diffRev ? diffLines(String((diffRev.data as { bodyMd?: string })?.bodyMd ?? ""), post.bodyMd ?? "") : []),
    [diffRev, post.bodyMd],
  );

  if (loading) {
    return (
      <StaffShell title="Post editor">
        <div className="flex h-64 items-center justify-center text-sm text-muted">Loading editor…</div>
      </StaffShell>
    );
  }

  const status = post.status ?? "draft";
  const tabClass = (t: Tab) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      activeTab === t ? "bg-primary text-on-primary" : "text-muted hover:text-ink hover:bg-subtle"
    }`;

  return (
    <StaffShell
      title={isNew ? "New blog post" : `Edit post: ${post.title || "Untitled"}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && (
            <button type="button" onClick={openPreview} className={btn.secondary} title="Private link, valid for 7 days">
              <Icon d={I.eye} size={15} />
              Preview link
            </button>
          )}
          <button type="button" onClick={() => void save(true)} disabled={saving || slugState === "taken"} className={btn.secondary}>
            {saving ? "Saving…" : status === "published" ? "Save changes" : "Save draft"}
          </button>
        </div>
      }
    >
      {picker && (
        <MediaPicker
          onClose={() => setPicker(null)}
          onPick={(asset) => {
            if (picker === "inline") return insertImage(asset);
            if (picker === "cover") {
              setCover(asset);
              update({ coverMediaId: asset.id, coverAlt: asset.isDecorative ? "" : asset.altText ?? "" });
            } else {
              setOg(asset);
              update({ ogMediaId: asset.id });
            }
            setPicker(null);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className={`${card} flex flex-col gap-4 p-5`}>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="post-title" className="text-xs font-semibold text-ink">Title *</label>
                <span className="text-xs text-muted">{(post.title || "").length} / 90</span>
              </div>
              <input
                id="post-title"
                type="text"
                maxLength={90}
                value={post.title || ""}
                onChange={(e) =>
                  update({ title: e.target.value, ...(slugEdited || status === "published" ? {} : { slug: slugify(e.target.value) }) })
                }
                placeholder="e.g. 5 accessibility pitfalls in modern checkout flows"
                className={`${input} mt-1 text-lg font-semibold`}
              />
            </div>

            <div>
              <label htmlFor="post-slug" className="text-xs font-semibold text-ink">URL slug</label>
              <div className="mt-1 flex items-center rounded-xl border border-line bg-subtle px-3 py-2 text-sm">
                <span className="select-none text-muted">/blog/</span>
                <input
                  id="post-slug"
                  type="text"
                  value={post.slug || ""}
                  onChange={(e) => {
                    setSlugEdited(true);
                    update({ slug: slugify(e.target.value) });
                  }}
                  aria-describedby="slug-status"
                  className="w-full bg-transparent p-0 font-mono text-sm text-ink focus:outline-none"
                />
              </div>
              <p id="slug-status" role="status" className={`mt-1 text-xs ${slugState === "taken" ? "text-crit" : "text-muted"}`}>
                {slugState === "checking" && "Checking…"}
                {slugState === "free" && "This slug is available."}
                {slugState === "taken" && "Another blog post already uses this slug."}
              </p>
              {slugChangeRedirects && (
                <p className="mt-1 text-xs text-warn">
                  The old address /blog/{savedSlug} will redirect to the new one automatically (301).
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="post-excerpt" className="text-xs font-semibold text-ink">Excerpt</label>
                <span className="text-xs text-muted">{(post.excerpt || "").length} / 200</span>
              </div>
              <textarea
                id="post-excerpt"
                rows={2}
                maxLength={200}
                value={post.excerpt || ""}
                onChange={(e) => update({ excerpt: e.target.value })}
                placeholder="Shown on the blog list and used as the default meta description."
                className={`${input} mt-1`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-line pb-2">
            <button type="button" onClick={() => setActiveTab("edit")} className={tabClass("edit")}>Write</button>
            <button type="button" onClick={() => setActiveTab("seo")} className={tabClass("seo")}>SEO &amp; social</button>
            {!isNew && (
              <button type="button" onClick={() => setActiveTab("revisions")} className={tabClass("revisions")}>
                Revisions ({revisions.length})
              </button>
            )}
            <span className="flex-1" />
            <span className="font-mono text-xs text-muted" aria-live="polite">
              {words} words · ~{readingTimeMin} min read
              {lastSavedAt && ` · saved ${lastSavedAt.toLocaleTimeString()}`}
              {dirty && " · unsaved changes"}
            </span>
          </div>

          {activeTab === "edit" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className={`${card} flex flex-col p-0`}>
                <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 border-b border-line bg-subtle/50 px-3 py-2 text-xs">
                  {TOOLBAR.map((t) => (
                    <button key={t.label} type="button" title={t.title} aria-label={t.title} onClick={t.run} className={`rounded px-2 py-1 hover:bg-subtle ${t.className ?? ""}`}>
                      {t.label}
                    </button>
                  ))}
                  <button type="button" title="Insert image from the media library" aria-label="Insert image" onClick={() => setPicker("inline")} className="rounded px-2 py-1 hover:bg-subtle">
                    Image
                  </button>
                </div>
                <label htmlFor="post-body" className="sr-only">Article body (Markdown)</label>
                <textarea
                  id="post-body"
                  ref={bodyRef}
                  rows={24}
                  value={post.bodyMd || ""}
                  onChange={(e) => update({ bodyMd: e.target.value })}
                  placeholder="Write your article in Markdown…"
                  className="w-full resize-y rounded-b-2xl bg-surface p-4 font-mono text-sm leading-relaxed text-ink focus:outline-none"
                />
              </div>

              <article aria-label="Live preview" className={`${card} bg-surface p-6 text-base leading-relaxed text-ink/90`}>
                <h2 className="m-0 mb-3 font-serif text-2xl font-normal text-ink">{post.title || "Untitled post"}</h2>
                {cover?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.url} alt={post.coverAlt ?? ""} className="mb-4 w-full rounded-xl border border-line" />
                )}
                <Markdown>{post.bodyMd || "Nothing written yet."}</Markdown>
              </article>
            </div>
          )}

          {activeTab === "seo" && (
            <div className={`${card} flex flex-col gap-4 p-5`}>
              <h3 className="m-0 text-base font-semibold text-ink">SEO &amp; metadata</h3>

              <div>
                <label htmlFor="seo-title" className="text-xs font-semibold text-ink">SEO title ({(post.seoTitle || "").length} / 60)</label>
                <input id="seo-title" type="text" maxLength={60} value={post.seoTitle || ""} onChange={(e) => update({ seoTitle: e.target.value })} placeholder={post.title || "Defaults to the post title"} className={`${input} mt-1`} />
              </div>

              <div>
                <label htmlFor="seo-desc" className="text-xs font-semibold text-ink">Meta description ({(post.seoDescription || "").length} / 160)</label>
                <textarea id="seo-desc" rows={2} maxLength={160} value={post.seoDescription || ""} onChange={(e) => update({ seoDescription: e.target.value })} placeholder={post.excerpt || "Defaults to the excerpt"} className={`${input} mt-1`} />
              </div>

              <div>
                <label htmlFor="seo-canonical" className="text-xs font-semibold text-ink">Canonical URL (optional)</label>
                <input id="seo-canonical" type="url" value={post.canonicalUrl || ""} onChange={(e) => update({ canonicalUrl: e.target.value || null })} placeholder="https://… only if this article was first published elsewhere" className={`${input} mt-1`} />
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={!!post.noindex} onChange={(e) => update({ noindex: e.target.checked })} />
                Ask search engines not to index this post (noindex)
              </label>

              <div>
                <span className="text-xs font-semibold text-ink">Social share image</span>
                <div className="mt-1 flex items-center gap-3">
                  {og?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={og.url} alt={og.altText ?? ""} className="h-16 w-28 rounded-lg border border-line object-cover" />
                  )}
                  <button type="button" onClick={() => setPicker("og")} className={btn.secondary}>
                    {og ? "Change image" : "Choose image"}
                  </button>
                  {og && (
                    <button type="button" onClick={() => { setOg(null); update({ ogMediaId: null }); }} className="text-xs font-semibold text-crit hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">If none is chosen, the cover image is used.</p>
              </div>

              <div className="rounded-xl border border-line bg-subtle p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted">Search result preview</span>
                <div className="text-xs text-ink/70">https://everyvisitor.app/blog/{post.slug || "post-slug"}</div>
                <div className="mt-0.5 text-base font-semibold text-primary">{post.seoTitle || post.title || "Post title"}</div>
                <div className="mt-1 text-xs text-muted">{post.seoDescription || post.excerpt || "The description shown in search results."}</div>
              </div>
            </div>
          )}

          {activeTab === "revisions" && (
            <div className={`${card} flex flex-col gap-3 p-5`}>
              <h3 className="m-0 text-base font-semibold text-ink">Revision history</h3>
              <p className="text-xs text-muted">Every save of a published post is kept. Compare any version with the text in the editor, or restore it.</p>
              <div className="divide-y divide-line">
                {revisions.map((rev) => (
                  <div key={rev.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <span className="font-semibold text-ink">Version {rev.version}</span>
                      <span className="ml-2 text-xs text-muted">{new Date(rev.createdAt).toLocaleString()}</span>
                      {rev.note && <p className="mt-0.5 text-xs italic text-muted">{rev.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDiffRev(diffRev?.id === rev.id ? null : rev)} className={btn.secondary} aria-pressed={diffRev?.id === rev.id}>
                        {diffRev?.id === rev.id ? "Hide changes" : "Compare"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Restore version ${rev.version}? Your current text is replaced.`)) return;
                          try {
                            const restored = await staffApi.restoreRevision(id, rev.version);
                            setPost((prev) => ({ ...prev, ...restored }));
                            setDirty(false);
                            showToast(`Restored version ${rev.version}.`);
                          } catch {
                            showToast("Could not restore that version.");
                          }
                        }}
                        className={btn.secondary}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
                {revisions.length === 0 && <div className="py-6 text-center text-sm text-muted">No revisions yet.</div>}
              </div>

              {diffRev && (
                <section aria-label={`Changes from version ${diffRev.version} to the current text`}>
                  <h4 className="m-0 mb-2 text-sm font-semibold text-ink">Version {diffRev.version} → current text</h4>
                  <pre className="max-h-96 overflow-auto rounded-xl border border-line bg-subtle p-3 font-mono text-xs leading-relaxed">
                    {diff.map((l, i) => (
                      <div
                        key={i}
                        className={l.kind === "add" ? "bg-ok-soft text-ok" : l.kind === "del" ? "bg-crit-soft text-crit" : "text-ink/80"}
                      >
                        <span aria-hidden="true">{l.kind === "add" ? "+ " : l.kind === "del" ? "− " : "  "}</span>
                        <span className="sr-only">{l.kind === "add" ? "Added: " : l.kind === "del" ? "Removed: " : ""}</span>
                        {l.text || " "}
                      </div>
                    ))}
                  </pre>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <div className={`${card} flex flex-col gap-3 p-5`}>
            <h3 className="m-0 text-sm font-semibold text-ink">Publish</h3>
            <div>
              <span className="mb-1 block text-xs text-muted">Status</span>
              <span className="inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold capitalize text-primary">{status}</span>
              {status === "scheduled" && post.publishAt && (
                <span className="ml-2 text-xs text-muted">goes live {new Date(post.publishAt).toLocaleString()}</span>
              )}
            </div>

            {!isNew && (
              <>
                {warnings.length > 0 && status !== "published" && (
                  <label className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft p-2 text-xs text-ink">
                    <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
                    <span>I have read the {warnings.length} warning{warnings.length === 1 ? "" : "s"} below and want to continue.</span>
                  </label>
                )}

                {status === "published" ? (
                  <button type="button" onClick={unpublish} disabled={saving} className={btn.danger}>Unpublish</button>
                ) : (
                  <>
                    <button type="button" onClick={publishNow} disabled={saving || needsAck || slugState === "taken"} className={btn.primary}>
                      Publish now
                    </button>
                    <div>
                      <label htmlFor="publish-at" className="mb-1 block text-xs font-semibold text-ink">Or schedule for</label>
                      <input id="publish-at" type="datetime-local" value={publishAtLocal} onChange={(e) => setPublishAtLocal(e.target.value)} className={input} />
                      <p className="mt-1 text-xs text-muted">Times are in your time zone ({TIME_ZONE}).</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={schedule} disabled={saving || needsAck || !publishAtLocal || slugState === "taken"} className={btn.secondary}>
                          Schedule
                        </button>
                        {status === "scheduled" && (
                          <button type="button" onClick={unpublish} disabled={saving} className={btn.secondary}>Cancel schedule</button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {isNew && <p className="m-0 text-xs text-muted">Save the draft first, then publish or schedule it.</p>}
          </div>

          <div className={`${card} flex flex-col gap-3 p-5`}>
            <div>
              <label htmlFor="author-select" className="mb-1 block text-xs font-semibold text-ink">Author (real staff only) *</label>
              <select id="author-select" value={post.authorStaffId || ""} onChange={(e) => update({ authorStaffId: e.target.value })} className={input}>
                {authors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                    {m.jobTitle ? `, ${m.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="post-tags" className="mb-1 block text-xs font-semibold text-ink">Tags (comma separated)</label>
              <input
                id="post-tags"
                type="text"
                defaultValue={(post.tags || []).join(", ")}
                key={post.id ?? "new"}
                onChange={(e) => update({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="accessibility, contrast, wcag"
                className={input}
              />
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-ink">Cover image</span>
              {cover?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover.url} alt={post.coverAlt ?? ""} className="mb-2 w-full rounded-lg border border-line" />
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPicker("cover")} className={btn.secondary}>
                  {cover ? "Change image" : "Choose image"}
                </button>
                {cover && (
                  <button type="button" onClick={() => { setCover(null); update({ coverMediaId: null, coverAlt: null }); }} className="text-xs font-semibold text-crit hover:underline">
                    Remove
                  </button>
                )}
              </div>
              {cover && !cover.isDecorative && (
                <div className="mt-2">
                  <label htmlFor="cover-alt" className="mb-1 block text-xs font-semibold text-ink">Alt text (required)</label>
                  <input id="cover-alt" type="text" value={post.coverAlt ?? ""} onChange={(e) => update({ coverAlt: e.target.value })} className={input} />
                </div>
              )}
              {cover?.isDecorative && <p className="mt-2 text-xs text-muted">This image is marked decorative in the media library, so it needs no alt text.</p>}
            </div>
          </div>

          <div className={`${card} flex flex-col gap-2 p-5`}>
            <h3 className="m-0 flex items-center justify-between text-sm font-semibold text-ink">
              <span>Content checks</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${warnings.length > 0 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </span>
            </h3>
            <p className="text-xs text-muted">Warnings never block publishing, but you confirm you have read them first.</p>
            <ul className="m-0 mt-1 list-none divide-y divide-line p-0" aria-live="polite">
              {warnings.map((w, idx) => (
                <li key={idx} className="py-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-warn">
                    <Icon d={I.alert} size={14} />
                    {w.type.replace(/_/g, " ")}
                  </div>
                  <div className="mt-0.5 text-ink/80">{w.message}</div>
                </li>
              ))}
              {warnings.length === 0 && <li className="py-4 text-center text-xs font-semibold text-ok">No warnings.</li>}
            </ul>
          </div>
        </div>
      </div>
    </StaffShell>
  );
}
