"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, I } from "./icons";
import { ThemeIconToggle } from "./theme";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";
import { useFocusTrap } from "./use-focus-trap";
import { ToastProvider } from "./shell/toast-context";
import { GlobalBannersRegion, type GlobalBannerData } from "./shell/global-banners";
import { CommandPalette } from "./shell/command-palette";
import { OrgSwitcher } from "./shell/org-switcher";
import { UserMenu } from "./shell/user-menu";
import { NotificationsBell } from "./shell/notifications-bell";

export type NavKey = "overview" | "sites" | "tasks" | "reports" | "settings";

const NAV_ITEMS: { key: NavKey; label: string; href: string; icon: string; count?: number }[] = [
  { key: "overview", label: "Overview", href: "/overview", icon: I.layout },
  { key: "sites", label: "Sites", href: "/sites", icon: I.globe },
  { key: "tasks", label: "My tasks", href: "/tasks", icon: I.check, count: 4 },
  { key: "reports", label: "Reports", href: "/reports", icon: I.fileText },
];

function SidebarContent({
  active,
  collapsed = false,
  onNavigate,
}: {
  active?: NavKey;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const item = (key: NavKey, label: string, href: string, icon: string, count?: number) => {
    const on = key === active;
    return (
      <Link
        key={key}
        href={href}
        onClick={onNavigate}
        aria-current={on ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={`ease-ui flex items-center gap-3 rounded-full py-2 text-sm leading-5 no-underline transition-colors ${
          collapsed ? "justify-center px-2" : "justify-between px-3.5"
        } ${
          on
            ? "bg-primary-soft font-semibold text-ptext hover:text-ptext"
            : "font-medium text-ink hover:bg-surface hover:text-ink"
        }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon d={icon} size={18} className="flex-none" />
          {!collapsed && <span className="truncate">{label}</span>}
        </span>
        {!collapsed && count != null && (
          <span className="tnum text-xs font-semibold text-muted bg-surface rounded-full px-2 py-0.5 border border-line">
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {!collapsed && <OrgSwitcher variant="sidebar" />}

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map((n) => item(n.key, n.label, n.href, n.icon, n.count))}
      </div>

      <div className="mx-1 my-3 h-px bg-line" />

      <div className="flex flex-col gap-1">
        {item("settings", "Settings", "/settings/general", I.settings)}
        <a
          href="https://plainsight.example.com/docs"
          target="_blank"
          rel="noreferrer"
          title={collapsed ? "Help & docs" : undefined}
          className={`ease-ui flex items-center gap-3 rounded-full py-2 text-sm leading-5 font-medium text-ink no-underline hover:bg-surface hover:text-ink ${
            collapsed ? "justify-center px-2" : "px-3.5"
          }`}
        >
          <Icon d={I.external} size={18} className="flex-none text-muted" />
          {!collapsed && <span>Help &amp; docs</span>}
        </a>
      </div>

      <div className="flex-1" />

      {!collapsed && (
        <div className="pt-3 border-t border-line">
          <Link
            href="/settings/account"
            className="flex items-center gap-3 rounded-2xl border border-transparent p-2 text-left text-ink hover:bg-surface no-underline"
          >
            <span className="grid size-8 place-items-center rounded-full border border-line bg-sunk text-xs font-semibold flex-none">
              DM
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm leading-5 font-medium truncate">Daniel Mwangi</span>
              <span className="text-xs leading-4 text-muted truncate">Owner</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Mobile/tablet navigation drawer for screens down to 360 px (spec 13: sidebar becomes a drawer). */
function NavDrawer({
  open,
  onClose,
  active,
}: {
  open: boolean;
  onClose: () => void;
  active?: NavKey;
}) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  // Trap focus inside drawer when active (WCAG 2.1.1, 2.4.3)
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useGSAP(
    () => {
      if (!mounted || !panelRef.current || !scrimRef.current) return;
      const reduced = prefersReducedMotion();
      if (open) {
        gsap.fromTo(scrimRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: MOTION.panel, ease: MOTION.ease });
        gsap.fromTo(
          panelRef.current,
          reduced ? { autoAlpha: 0 } : { xPercent: -100 },
          { xPercent: 0, autoAlpha: 1, duration: MOTION.panel, ease: MOTION.ease }
        );
        panelRef.current.querySelector<HTMLElement>("a,button")?.focus();
      } else {
        gsap.to(scrimRef.current, { autoAlpha: 0, duration: MOTION.panel, ease: MOTION.ease });
        gsap.to(panelRef.current, {
          ...(reduced ? { autoAlpha: 0 } : { xPercent: -100 }),
          duration: MOTION.panel,
          ease: MOTION.ease,
          onComplete: () => setMounted(false),
        });
      }
    },
    { dependencies: [open, mounted] }
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        ref={scrimRef}
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-scrim/60 backdrop-blur-xs"
      />
      <nav
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation drawer"
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-1 border-r border-line bg-subtle px-4 py-4 shadow-dialog text-ink"
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Navigation</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon d={I.close} size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarContent active={active} onNavigate={onClose} />
        </div>
      </nav>
    </div>
  );
}

export interface AppShellProps {
  active?: NavKey;
  crumbs?: { label: string; href?: string }[];
  banners?: GlobalBannerData[];
  children: React.ReactNode;
}

export function AppShell({ active, crumbs = [], banners, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    hamburgerRef.current?.focus();
  };

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-page text-ink antialiased">
        {/* Skip to main content link (WCAG 2.4.1) */}
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 shadow-pop outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          Skip to content
        </a>

        {/* Desktop Sidebar Landmark (nav aria-label="Main") */}
        <nav
          aria-label="Main"
          className={`sticky top-0 hidden h-screen flex-none flex-col border-r border-line bg-subtle px-3 py-4 transition-all duration-200 lg:flex ${
            sidebarCollapsed ? "w-[68px]" : "w-[248px]"
          }`}
        >
          <div className="flex-1 overflow-y-auto">
            <SidebarContent active={active} collapsed={sidebarCollapsed} />
          </div>
          <div className="pt-2 border-t border-line flex justify-end">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink hover:bg-subtle"
            >
              <Icon d={sidebarCollapsed ? I.chevronRight : I.chevronLeft} size={16} />
            </button>
          </div>
        </nav>

        {/* Mobile / Tablet Drawer */}
        <NavDrawer open={drawerOpen} onClose={handleCloseDrawer} active={active} />

        {/* Content Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Bar Header Landmark (header) */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-page/90 backdrop-blur-md px-4 sm:gap-4 sm:px-8">
            {/* Hamburger button for mobile/drawer */}
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              className="grid size-10 flex-none place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
            >
              <Icon d={I.menu} size={20} />
            </button>

            {/* Org Switcher in Top Bar */}
            <div className="flex-none hidden sm:block">
              <OrgSwitcher variant="topbar" />
            </div>

            {/* Breadcrumbs Navigation Landmark (nav aria-label="Breadcrumb") */}
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="m-0 flex list-none items-center gap-2 overflow-hidden p-0 text-sm leading-5 text-ellipsis whitespace-nowrap text-muted">
                {crumbs.map((c, i) => {
                  const isLast = i === crumbs.length - 1;
                  return (
                    <li key={c.label} className={`flex min-w-0 items-center gap-2 ${isLast ? "" : "hidden md:flex"}`}>
                      {isLast ? (
                        <span aria-current="page" className="truncate font-semibold text-ink">
                          {c.label}
                        </span>
                      ) : (
                        <>
                          <Link
                            href={c.href ?? "#"}
                            className="truncate text-muted hover:text-ink no-underline transition-colors"
                          >
                            {c.label}
                          </Link>
                          <span aria-hidden="true" className="text-line-strong">
                            /
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Search / Command Palette Trigger (S-81) */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Search or jump to command palette (Press Ctrl+K or Cmd+K)"
              className="ease-ui flex h-9 items-center gap-2 sm:gap-3 rounded-full border border-line bg-surface px-3 text-sm text-muted hover:border-line-strong hover:text-ink md:min-w-[220px] lg:min-w-[260px] md:pr-2 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon d={I.search} size={16} />
              <span className="sr-only md:not-sr-only md:flex-1 md:text-left">Search or jump to…</span>
              <kbd className="hidden rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-xs text-muted md:inline-block">
                ⌘K
              </kbd>
            </button>

            {/* Theme Toggle */}
            <ThemeIconToggle />

            {/* Notifications Bell Placeholder (S-50) */}
            <NotificationsBell />

            {/* User Account Menu (S-48) */}
            <UserMenu />
          </header>

          {/* S-82 Global Banners Region */}
          <GlobalBannersRegion banners={banners} />

          {/* S-81 Command Palette Dialog */}
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
          />

          {/* Main Landmark (main id="main") */}
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1344px] flex-1 px-4 pt-6 pb-16 outline-none sm:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
