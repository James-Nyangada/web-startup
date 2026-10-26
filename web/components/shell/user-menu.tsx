"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { useToast } from "./toast-context";
import { authClient } from "@/lib/auth-client";
import { resetCurrentUser, useCurrentUser } from "@/lib/use-current-user";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();
  const user = useCurrentUser();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  const handleSignOut = async () => {
    setOpen(false);
    showToast("Signing out...");
    try {
      await authClient.signOut();
    } catch {
      // The session may already be gone; continue to the sign-in page.
    }
    resetCurrentUser();
    router.push("/sign-in");
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className="ease-ui flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true" className="text-xs font-bold">{user.initials}</span>
        <span className="sr-only">Account menu for {user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="User account menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-dialog text-ink"
        >
          {/* User profile header */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="grid size-9 place-items-center rounded-full border border-line bg-sunk text-xs font-bold">
              {user.initials}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{user.name}</span>
              <span className="truncate text-xs text-muted">{user.email}</span>
            </div>
          </div>

          <div className="my-1.5 h-px bg-line" />

          {/* Links */}
          <Link
            href="/settings/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="ease-ui flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-subtle no-underline"
          >
            <Icon d={I.user} size={16} className="text-muted" />
            <span>Account &amp; Profile</span>
          </Link>

          <Link
            href="/settings/general"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="ease-ui flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-subtle no-underline"
          >
            <Icon d={I.settings} size={16} className="text-muted" />
            <span>Organisation Settings</span>
          </Link>

          <a
            href="/help"
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="ease-ui flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-subtle no-underline"
          >
            <Icon d={I.external} size={16} className="text-muted" />
            <span>Help &amp; Documentation</span>
          </a>

          <div className="my-1.5 h-px bg-line" />

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="ease-ui flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-crit hover:bg-rose-500/10"
          >
            <Icon d={I.logOut} size={16} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
