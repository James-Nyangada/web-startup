"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { StaffShell, btn, input, card, th, td } from "@/components/staff/staff-shell";
import { staffApi, type ContentPost } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

export default function StaffPostsPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffApi.listPosts({
        type: "blog",
        status: statusFilter || undefined,
        q: q || undefined,
      });
      setPosts(res.data || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => {
    const t = setTimeout(() => void loadPosts(), 200);
    return () => clearTimeout(t);
  }, [loadPosts]);

  return (
    <StaffShell
      title="Blog Posts (S-95)"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/staff/content/posts/new" className={btn.primary}>
            <Icon d={I.plus} size={15} />
            Write new post
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Filters */}
        <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Search posts by title or slug…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`${input} w-64`}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={input}
            >
              <option value="">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="text-xs text-muted">
            Found <strong>{posts.length}</strong> blog posts
          </div>
        </div>

        {/* Posts Table */}
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-subtle">
              <tr>
                <th scope="col" className={th}>Title & Slug</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Author</th>
                <th scope="col" className={th}>Tags</th>
                <th scope="col" className={th}>Publish date</th>
                <th scope="col" className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {posts.map((post) => {
                const isPublished = post.status === "published";
                const isScheduled = post.status === "scheduled";

                return (
                  <tr key={post.id} className="hover:bg-subtle/40">
                    <td className={td}>
                      <Link
                        href={`/staff/content/posts/${post.id}`}
                        className="font-semibold text-ink hover:text-primary hover:underline block"
                      >
                        {post.title}
                      </Link>
                      <span className="block text-xs font-mono text-muted mt-0.5">
                        /blog/{post.slug}
                      </span>
                    </td>
                    <td className={td}>
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          isPublished
                            ? "bg-ok-soft text-ok border border-ok/20"
                            : isScheduled
                            ? "bg-warn-soft text-warn border border-warn/20"
                            : post.status === "archived"
                            ? "bg-subtle text-muted border border-line"
                            : "bg-primary-soft text-primary border border-primary/20"
                        }`}
                      >
                        {post.status}
                      </span>
                    </td>
                    <td className={`${td} text-xs`}>
                      {post.author?.displayName || "Staff author"}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {(post.tags || []).map((t, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`${td} text-xs text-muted`}>
                      {post.publishedAt
                        ? new Date(post.publishedAt).toLocaleDateString()
                        : post.publishAt
                        ? `Scheduled: ${new Date(post.publishAt).toLocaleDateString()}`
                        : "Draft"}
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/staff/content/posts/${post.id}`}
                          className={`${btn.secondary} !py-1 !text-xs`}
                        >
                          Edit
                        </Link>
                        {isPublished && (
                          <a
                            href={`https://everyvisitor.com/blog/${post.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted hover:text-ink"
                            title="View live post"
                          >
                            <Icon d={I.external} size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {posts.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                    No blog posts matching your filter. Click "Write new post" to start drafting!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </StaffShell>
  );
}
