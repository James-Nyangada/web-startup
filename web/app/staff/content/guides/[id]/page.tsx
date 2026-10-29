"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { StaffShell, btn, input, card } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { staffApi, type ContentPost } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

export default function GuideEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [post, setPost] = useState<Partial<ContentPost>>({
    type: "guide",
    title: "",
    slug: "",
    excerpt: "",
    platform: (searchParams.get("platform") as any) || "generic",
    ruleId: searchParams.get("ruleId") || "",
    status: "draft",
    sections: {
      whatsWrong: "",
      whoItAffects: "",
      howToFix: "",
      codeExample: "",
      howToCheck: "",
    },
  });

  const [staffMembers, setStaffMembers] = useState<{ id: string; displayName: string; jobTitle: string | null }[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const members = await staffApi.listAuthors();
      setStaffMembers(members || []);
      if (isNew && members && members.length > 0 && !post.authorStaffId) {
        setPost((p) => ({ ...p, authorStaffId: members[0]!.id }));
      }

      if (!isNew) {
        const fetched = await staffApi.getPost(id);
        setPost({
          ...fetched,
          sections: fetched.sections || {
            whatsWrong: "",
            whoItAffects: "",
            howToFix: "",
            codeExample: "",
            howToCheck: "",
          },
        });
      }
    } catch {
      showToast("Failed to load guide.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateSection = (key: string, val: string) => {
    setPost((prev) => ({
      ...prev,
      sections: {
        ...(prev.sections || {}),
        [key]: val,
      },
    }));
  };

  const handleSave = async (publish = false) => {
    if (!post.title?.trim()) {
      showToast("Please provide a guide title.");
      return;
    }
    setSaving(true);
    try {
      // Assemble body markdown from guide sections
      const s = post.sections || {};
      const fullMd = `## What's wrong\n${s.whatsWrong || ""}\n\n## Who it affects\n${
        s.whoItAffects || ""
      }\n\n## How to fix on ${post.platform || "your site"}\n${s.howToFix || ""}\n\n## Code example\n\`\`\`html\n${
        s.codeExample || ""
      }\n\`\`\`\n\n## How to check your fix\n${s.howToCheck || ""}`;

      const payload = {
        ...post,
        bodyMd: fullMd,
        slug:
          post.slug ||
          post.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""),
      };

      if (isNew) {
        const created = await staffApi.createPost(payload);
        showToast("Guide draft created.");
        router.replace(`/staff/content/guides/${created.id}`);
      } else {
        await staffApi.updatePost(id, payload);
        if (publish) {
          await staffApi.publishPost(id);
          showToast("Guide published to site and in-app fix drawer!");
        } else {
          showToast("Guide saved.");
        }
        await loadData();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save guide.");
    } finally {
      setSaving(false);
    }
  };

  const markReviewed = async () => {
    try {
      await staffApi.markGuideReviewed(id);
      showToast("Guide marked as reviewed.");
      await loadData();
    } catch {
      showToast("Only an Admin or the Owner can mark a guide as reviewed.");
    }
  };

  if (loading) {
    return (
      <StaffShell title="Guide Editor">
        <div className="flex h-64 items-center justify-center text-sm text-muted">
          Loading guide template…
        </div>
      </StaffShell>
    );
  }

  const sections = post.sections || {};

  return (
    <StaffShell
      title={isNew ? "New Fix Guide" : `Edit Guide: ${post.title || "Untitled"}`}
      actions={
        <div className="flex items-center gap-2">
          {!isNew && !post.reviewedAt && (
            <button type="button" onClick={markReviewed} className={btn.secondary}>
              Mark reviewed
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className={btn.secondary}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className={btn.primary}
            >
              Publish guide
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Guide Template (Col 1 & 2) */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className={`${card} p-5 flex flex-col gap-4`}>
            <div>
              <label htmlFor="guide-title" className="text-xs font-semibold text-ink">
                Guide Title *
              </label>
              <input
                id="guide-title"
                type="text"
                required
                value={post.title || ""}
                onChange={(e) => setPost((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. How to Fix Insufficient Color Contrast"
                className={`${input} mt-1 text-lg font-semibold`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="guide-rule" className="text-xs font-semibold text-ink">
                  Axe Rule ID *
                </label>
                <input
                  id="guide-rule"
                  type="text"
                  required
                  value={post.ruleId || ""}
                  onChange={(e) => setPost((p) => ({ ...p, ruleId: e.target.value }))}
                  placeholder="e.g. color-contrast, image-alt"
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="guide-platform" className="text-xs font-semibold text-ink">
                  Platform *
                </label>
                <select
                  id="guide-platform"
                  value={post.platform || "generic"}
                  onChange={(e) => setPost((p) => ({ ...p, platform: e.target.value }))}
                  className={input}
                >
                  <option value="shopify">Shopify (Liquid / Theme Editor)</option>
                  <option value="wordpress">WordPress (Gutenberg / Classic)</option>
                  <option value="generic">Generic (HTML / CSS / React)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="guide-summary" className="text-xs font-semibold text-ink">
                Summary (One-line description)
              </label>
              <input
                id="guide-summary"
                type="text"
                value={post.excerpt || ""}
                onChange={(e) => setPost((p) => ({ ...p, excerpt: e.target.value }))}
                placeholder="High-level summary of the issue and resolution…"
                className={input}
              />
            </div>
          </div>

          {/* Guide Template Sections (Spec 3.3) */}
          <div className="flex flex-col gap-4">
            <div className={`${card} p-5`}>
              <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-2">
                1. What's wrong *
              </label>
              <textarea
                rows={3}
                value={sections.whatsWrong || ""}
                onChange={(e) => updateSection("whatsWrong", e.target.value)}
                placeholder="Explain the underlying technical or design defect in clear terms…"
                className={input}
              />
            </div>

            <div className={`${card} p-5`}>
              <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-2">
                2. Who it affects *
              </label>
              <textarea
                rows={3}
                value={sections.whoItAffects || ""}
                onChange={(e) => updateSection("whoItAffects", e.target.value)}
                placeholder="e.g. Visitors with low vision, color blindness, or using screen magnifiers…"
                className={input}
              />
            </div>

            <div className={`${card} p-5`}>
              <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-2">
                3. How to fix on {post.platform || "your site"} *
              </label>
              <textarea
                rows={5}
                value={sections.howToFix || ""}
                onChange={(e) => updateSection("howToFix", e.target.value)}
                placeholder="Step-by-step instructions (e.g. Open theme.liquid, navigate to CSS file)…"
                className={input}
              />
            </div>

            <div className={`${card} p-5`}>
              <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-2">
                4. Code example (HTML / CSS) *
              </label>
              <textarea
                rows={4}
                value={sections.codeExample || ""}
                onChange={(e) => updateSection("codeExample", e.target.value)}
                placeholder="<button class='bg-primary text-white font-bold'>Accessible Button</button>"
                className={`${input} font-mono text-xs`}
              />
            </div>

            <div className={`${card} p-5`}>
              <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-2">
                5. How to check your fix *
              </label>
              <textarea
                rows={3}
                value={sections.howToCheck || ""}
                onChange={(e) => updateSection("howToCheck", e.target.value)}
                placeholder="How the user or client can retest using EveryVisitor or browser DevTools…"
                className={input}
              />
            </div>
          </div>
        </div>

        {/* Sidebar Controls (Col 3) */}
        <div className="flex flex-col gap-5">
          <div className={`${card} p-5 flex flex-col gap-3`}>
            <h3 className="m-0 text-sm font-semibold text-ink">Guide Meta</h3>

            <div>
              <span className="text-xs text-muted block mb-1">Status</span>
              <span className="rounded-full bg-primary-soft text-primary font-semibold text-xs px-2.5 py-0.5 capitalize inline-block">
                {post.status}
              </span>
            </div>

            <div>
              <span className="text-xs text-muted block mb-1">Review status</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold inline-block ${
                  post.reviewedAt ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
                }`}
              >
                {post.reviewedAt ? "Reviewed" : "Not yet reviewed"}
              </span>
            </div>

            <div>
              <label htmlFor="guide-author" className="text-xs font-semibold text-ink block mb-1">
                Author *
              </label>
              <select
                id="guide-author"
                value={post.authorStaffId || ""}
                onChange={(e) => setPost((p) => ({ ...p, authorStaffId: e.target.value }))}
                className={input}
              >
                {staffMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}{m.jobTitle ? `, ${m.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </StaffShell>
  );
}
