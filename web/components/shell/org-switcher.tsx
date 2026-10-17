"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { useToast } from "./toast-context";

export interface OrgItem {
  id: string;
  name: string;
  slug: string;
  type: "agency" | "store";
  sitesCount: number;
  initials: string;
  isCurrent?: boolean;
}

const DEFAULT_ORGS: OrgItem[] = [
  {
    id: "org-brightline",
    name: "Brightline Studio",
    slug: "brightline",
    type: "agency",
    sitesCount: 18,
    initials: "BS",
    isCurrent: true,
  },
  {
    id: "org-oakhaus",
    name: "Oakhaus Store",
    slug: "oakhaus-store",
    type: "store",
    sitesCount: 1,
    initials: "OS",
  },
  {
    id: "org-meridian",
    name: "Meridian Agency",
    slug: "meridian",
    type: "agency",
    sitesCount: 6,
    initials: "MA",
  },
];

export function OrgSwitcher({
  variant = "topbar",
  onOrgSelected,
}: {
  variant?: "topbar" | "sidebar";
  onOrgSelected?: (org: OrgItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgItem[]>(DEFAULT_ORGS);
  const { showToast } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentOrg = orgs.find((o) => o.isCurrent) ?? orgs[0];

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectOrg = (targetOrg: OrgItem) => {
    setOrgs((prev) =>
      prev.map((o) => ({
        ...o,
        isCurrent: o.id === targetOrg.id,
      }))
    );
    setOpen(false);
    showToast(`Switched to organisation: ${targetOrg.name}`);
    onOrgSelected?.(targetOrg);
    buttonRef.current?.focus();
  };

  if (variant === "sidebar") {
    return (
      <div className="relative mb-4" ref={menuRef}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={`Switch organisation. Current: ${currentOrg.name}`}
          className="ease-ui flex w-full items-center gap-3 rounded-full border border-line bg-surface p-2 text-left text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-[13px] font-bold text-on-primary">
            {currentOrg.initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm leading-5 font-semibold">{currentOrg.name}</span>
            <span className="truncate text-xs leading-4 text-muted">
              {currentOrg.type === "agency" ? "Agency" : "Store"} · {currentOrg.sitesCount} {currentOrg.sitesCount === 1 ? "site" : "sites"}
            </span>
          </span>
          <Icon d={I.chevronsUpDown} size={16} className="text-muted" />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Switch organisation"
            className="absolute top-full left-0 z-50 mt-1.5 w-full rounded-2xl border border-line bg-surface p-2 shadow-dialog text-ink"
          >
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              Organisations
            </div>
            {orgs.map((o) => (
              <button
                key={o.id}
                role="menuitem"
                type="button"
                onClick={() => selectOrg(o)}
                className={`ease-ui flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${
                  o.isCurrent ? "bg-primary-soft font-semibold text-ptext" : "hover:bg-subtle text-ink"
                }`}
              >
                <span className="grid size-6 place-items-center rounded bg-primary/20 text-xs font-bold text-primary">
                  {o.initials}
                </span>
                <span className="flex-1 truncate">{o.name}</span>
                {o.isCurrent && <Icon d={I.check} size={16} className="text-primary" />}
              </button>
            ))}
            <div className="my-1.5 h-px bg-line" />
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="ease-ui flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft no-underline"
            >
              <Icon d={I.plus} size={16} />
              <span>New organisation</span>
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Topbar variant: compact pill button
  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Current organisation: ${currentOrg.name}. Switch organisation`}
        className="ease-ui flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-left text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary max-w-[200px] sm:max-w-[240px]"
      >
        <span className="grid size-5.5 place-items-center rounded bg-primary text-[11px] font-bold text-on-primary flex-none">
          {currentOrg.initials}
        </span>
        <span className="truncate text-xs font-semibold sm:text-sm">{currentOrg.name}</span>
        <Icon d={I.chevronsUpDown} size={14} className="text-muted flex-none" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch organisation"
          className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-2xl border border-line bg-surface p-2 shadow-dialog text-ink"
        >
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Organisations
          </div>
          {orgs.map((o) => (
            <button
              key={o.id}
              role="menuitem"
              type="button"
              onClick={() => selectOrg(o)}
              className={`ease-ui flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${
                o.isCurrent ? "bg-primary-soft font-semibold text-ptext" : "hover:bg-subtle text-ink"
              }`}
            >
              <span className="grid size-6 place-items-center rounded bg-primary/20 text-xs font-bold text-primary flex-none">
                {o.initials}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{o.name}</span>
                <span className="text-[11px] text-muted">
                  {o.type === "agency" ? "Agency" : "Store"} · {o.sitesCount} sites
                </span>
              </div>
              {o.isCurrent && <Icon d={I.check} size={16} className="text-primary flex-none" />}
            </button>
          ))}
          <div className="my-1.5 h-px bg-line" />
          <Link
            href="/onboarding"
            onClick={() => setOpen(false)}
            className="ease-ui flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft no-underline"
          >
            <Icon d={I.plus} size={16} />
            <span>New organisation</span>
          </Link>
        </div>
      )}
    </div>
  );
}
