"use client";

import { useState } from "react";
import { Icon, I } from "@/components/icons";
import type { FixGuideItem } from "@/lib/fix-guides-data";
import { GUIDE_PLATFORM_LABEL } from "@/lib/platforms";

interface GuideRendererProps {
  guide: FixGuideItem;
  className?: string;
  isCompact?: boolean;
  /** The site's tech stack (sites.framework): its framework example is shown first. */
  stack?: string | null;
}

interface CodeBlock {
  kind: "incorrect" | "correct" | "extra";
  title: string;
  language: string;
  code: string;
}

/**
 * Splits the Code example section into its `### Label` + fenced blocks: Incorrect, Correct,
 * then any framework or CSS examples (Custom code guides: "CSS", "React / Next.js (JSX)", "Vue").
 */
function parseCodeBlocks(snippet: string, platform: FixGuideItem["platform"]): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const m of snippet.matchAll(/^###\s*(.+?)\s*\n```(\w*)\n([\s\S]*?)```/gm)) {
    const label = m[1]!.trim();
    const kind = /^incorrect$/i.test(label) ? "incorrect" : /^correct$/i.test(label) ? "correct" : "extra";
    blocks.push({
      kind,
      title:
        kind === "incorrect"
          ? "Problematic code"
          : kind === "correct"
            ? platform === "custom"
              ? "The fix in HTML"
              : "Recommended accessible code"
            : label,
      language: m[2]?.toUpperCase() || "HTML",
      code: (m[3] || "").trim(),
    });
  }
  if (blocks.length === 0) {
    const general = snippet.match(/```(\w+)?\n([\s\S]*?)```/);
    if (general) {
      blocks.push({ kind: "correct", title: "Code change", language: general[1]?.toUpperCase() || "HTML", code: (general[2] || "").trim() });
    }
  }
  return blocks;
}

const STACK_EXAMPLE: Record<string, RegExp> = {
  react: /react|jsx/i,
  nextjs: /react|next|jsx/i,
  gatsby: /react|jsx/i,
  remix: /react|jsx/i,
  vue: /vue/i,
  nuxt: /vue|nuxt/i,
};

/** Puts the example for the site's own framework first, ahead of the plain HTML (spec 4.5). */
function orderForStack(blocks: CodeBlock[], stack?: string | null): CodeBlock[] {
  const match = stack ? STACK_EXAMPLE[stack] : undefined;
  if (!match) return blocks;
  const i = blocks.findIndex((b) => b.kind === "extra" && match.test(b.title));
  if (i === -1) return blocks;
  const preferred = { ...blocks[i]!, title: `${blocks[i]!.title}: your framework` };
  return [preferred, ...blocks.filter((_, j) => j !== i)];
}

export function GuideRenderer({ guide, className = "", isCompact = false, stack = null }: GuideRendererProps) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const handleCopyCode = async (codeText: string, index: number) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2500);
    } catch {
      // Fallback
    }
  };

  const codeBlocks = orderForStack(parseCodeBlocks(guide.codeSnippet, guide.platform), stack);
  const platformName = guide.platform === "custom" ? "a custom-coded site" : GUIDE_PLATFORM_LABEL[guide.platform];

  return (
    <article className={`flex flex-col gap-6 text-ink ${className}`}>
      {/* What's wrong */}
      <section aria-labelledby="section-wrong" className="flex flex-col gap-2">
        <h2 id="section-wrong" className="m-0 text-xl font-semibold tracking-tight">
          What&apos;s wrong
        </h2>
        <p className="m-0 text-base leading-7 text-pretty text-muted">{guide.wrong}</p>
      </section>

      {/* Who it affects */}
      <section aria-labelledby="section-affects" className="flex flex-col gap-2">
        <h2 id="section-affects" className="m-0 text-xl font-semibold tracking-tight">
          Who it affects
        </h2>
        <div className="rounded-xl border border-line bg-subtle p-4 text-base leading-7 text-ink">
          {guide.affects}
        </div>
      </section>

      {/* How to fix on platform */}
      <section aria-labelledby="section-fix" className="flex flex-col gap-2">
        <h2 id="section-fix" className="m-0 text-xl font-semibold tracking-tight">
          How to fix on {platformName}
        </h2>
        <p className="m-0 text-base leading-7 text-pretty text-ink">{guide.howToFix}</p>
      </section>

      {/* Code examples */}
      <section aria-labelledby="section-code" className="flex flex-col gap-4">
        <h2 id="section-code" className="m-0 text-xl font-semibold tracking-tight">
          Code example
        </h2>

        <div className="flex flex-col gap-4">
          {codeBlocks.map((block, idx) => {
            const isCorrect = block.kind !== "incorrect";
            const isCopied = copiedCodeIndex === idx;

            return (
              <div
                key={idx}
                className={`overflow-hidden rounded-xl border ${
                  isCorrect
                    ? "border-ok/40 bg-surface shadow-sm"
                    : "border-line bg-subtle/50"
                }`}
              >
                <div className="flex items-center justify-between border-b border-line bg-subtle/60 px-4 py-2 text-xs font-semibold">
                  <span className={`flex items-center gap-1.5 ${isCorrect ? "text-ok" : "text-muted"}`}>
                    <Icon d={isCorrect ? I.fixed : I.alert} size={14} />
                    {block.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted">{block.language}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(block.code, idx)}
                      aria-live="polite"
                      className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <Icon d={isCopied ? I.fixed : I.share} size={12} />
                      {isCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                <pre className="m-0 overflow-x-auto p-4 font-mono text-sm leading-6 text-ink">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          })}
        </div>
      </section>

      {/* How to check your fix */}
      <section aria-labelledby="section-check" className="flex flex-col gap-2">
        <h2 id="section-check" className="m-0 text-xl font-semibold tracking-tight">
          How to check your fix
        </h2>
        <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-4 text-base leading-7 text-ink">
          <p className="m-0">{guide.howToCheck}</p>
        </div>
      </section>
    </article>
  );
}
