"use client";

import { useState } from "react";
import { Icon, I } from "@/components/icons";

interface CodeSnippetProps {
  code: string;
  language?: string;
  label?: string;
  className?: string;
}

export function CodeSnippet({
  code,
  language = "HTML",
  label,
  className = "",
}: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-line ${className}`}>
      <div className="flex items-center justify-between border-b border-line bg-subtle py-1.5 pr-2 pl-4">
        <span className="text-xs leading-4 font-medium text-muted">
          {label ?? language}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="ease-ui flex h-7 items-center gap-1.5 rounded border border-line-strong bg-surface px-2.5 text-[13px] font-semibold text-ink hover:bg-subtle focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={copied ? "Code copied to clipboard" : "Copy code"}
        >
          <Icon d={copied ? I.fixed : I.copy} size={14} className={copied ? "text-ok" : "text-muted"} />
          <span>{copied ? "Copied" : "Copy code"}</span>
        </button>
      </div>
      <div className="relative">
        <pre
          tabIndex={0}
          aria-label={`${label ?? language} snippet`}
          className="m-0 overflow-x-auto bg-sunk p-4 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {code}
        </pre>
        <span aria-live="polite" className="sr-only">
          {copied ? "Code copied to clipboard" : ""}
        </span>
      </div>
    </div>
  );
}
