"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { useToast } from "./toast-context";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/app-api";

export interface OrgItem {
  id: string;
  name: string;
  slug: string;
  type: "agency" | "store";
  sitesCount: number;
  initials: string;
  logoUrl?: string | null;
  isCurrent?: boolean;
}


/** Org mark: the uploaded logo when there is one (falling back to initials if it fails to load). */
function OrgMark({
  org,
  className,
}: {
  org: OrgItem;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [org.logoUrl]);

  if (org.logoUrl && !failed) {
    return (
      <span aria-hidden="true" className={`${className} overflow-hidden bg-white border border-line flex-none`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={org.logoUrl}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-contain"
        />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${className} bg-primary font-bold text-on-primary flex-none`}>
      {org.initials}
    </span>
  );
}

export function OrgSwitcher({
  variant = "topbar",
  onOrgSelected,
}: {
  variant?: "topbar" | "sidebar";
  onOrgSelected?: (org: OrgItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The org in the URL wins; otherwise the user's last active org.
  useEffect(() => {
    authClient
      .getMe()
      .then((me) => {
        const fromPath = pathname.split("/")[1];
        const active = me.activeOrg?.id;
        const list = me.memberships.map((m) => ({
          id: m.org.id,
          name: m.org.name,
          slug: m.org.slug,
          type: m.org.type,
          sitesCount: 0,
          initials: initials(m.org.name) ?? "?",
          logoUrl: m.org.hasLogo
            ? `/v1/orgs/${m.org.slug}/branding/logo/light?v=${m.org.logoVersion ?? 0}`
            : null,
          isCurrent: false,
        }));
        const current =
          list.find((o) => o.slug === fromPath || o.id === fromPath) ??
          list.find((o) => o.id === active) ??
          list[0];
        setOrgs(list.map((o) => ({ ...o, isCurrent: o.id === current?.id })));
      })
      .catch(() => setOrgs([]));
  }, [pathname]);

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
    void authClient.updateProfile({ lastActiveOrgId: targetOrg.id }).catch(() => {});
    showToast(`Switched to organisation: ${targetOrg.name}`);
    onOrgSelected?.(targetOrg);
    router.push(`/${targetOrg.slug}`);
  };

  if (!currentOrg) return null;

  if (variant === "sidebar") {
    return (
      <div className="relative mb-4" ref={menuRef}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="true"
          className="ease-ui flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-2 pr-3 text-left text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
        >
          <OrgMark org={currentOrg} className="grid size-8 place-items-center rounded-md text-[13px]" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm leading-5 font-semibold">{currentOrg.name}</span>
            <span className="truncate text-xs leading-4 text-muted">
              {currentOrg.type === "agency" ? "Agency" : "Store"}
            </span>
          </span>
          <span className="sr-only">, switch organisation</span>
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
                <OrgMark org={o} className="grid size-6 place-items-center rounded text-xs" />
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
        className="ease-ui flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-left text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary max-w-[200px] sm:max-w-[240px]"
      >
        <OrgMark org={currentOrg} className="grid size-5.5 place-items-center rounded text-[11px]" />
        <span className="truncate text-xs font-semibold sm:text-sm">{currentOrg.name}</span>
        <span className="sr-only">, switch organisation</span>
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
              <OrgMark org={o} className="grid size-6 place-items-center rounded text-xs" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{o.name}</span>
                <span className="text-[11px] text-muted">
                  {o.type === "agency" ? "Agency" : "Store"}
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
