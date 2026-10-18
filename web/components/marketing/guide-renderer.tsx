"use client";

import { useState } from "react";
import { Icon, I } from "@/components/icons";
import type { FixGuideItem } from "@/lib/fix-guides-data";

interface GuideRendererProps {
  guide: FixGuideItem;
  className?: string;
  isCompact?: boolean;
}

export function GuideRenderer({ guide, className = "", isCompact = false }: GuideRendererProps) {
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

  // Extract code blocks from guide.codeSnippet
  const codeBlocks: { title: string; language: string; code: string }[] = [];
  const parts = guide.codeSnippet.split(/### (Incorrect|Correct)/g);

  for (let i = 1; i < parts.length; i += 2) {
    const blockType = parts[i];
    const rawContent = parts[i + 1] || "";
    const codeMatch = rawContent.match(/```(\w+)?\n([\s\S]*?)```/);
    if (codeMatch) {
      codeBlocks.push({
        title: blockType === "Correct" ? "Recommended Accessible Code" : "Problematic Code",
        language: codeMatch[1]?.toUpperCase() || "HTML",
        code: (codeMatch[2] || "").trim(),
      });
    }
  }

  // Fallback if no split blocks found
  if (codeBlocks.length === 0) {
    const generalMatch = guide.codeSnippet.match(/```(\w+)?\n([\s\S]*?)```/);
    if (generalMatch) {
      codeBlocks.push({
        title: "Code change",
        language: generalMatch[1]?.toUpperCase() || "HTML",
        code: (generalMatch[2] || "").trim(),
      });
    }
  }

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
          How to fix on {guide.platform === "shopify" ? "Shopify" : "WordPress"}
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
            const isCorrect = block.title.includes("Recommended") || block.title.includes("Correct");
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
