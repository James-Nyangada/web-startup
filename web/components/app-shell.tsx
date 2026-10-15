"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, I } from "./icons";
import { ThemeIconToggle } from "./theme";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";

type NavKey = "overview" | "sites" | "tasks" | "reports" | "settings";

const NAV: { key: NavKey; label: string; href: string; count?: number }[] = [
  { key: "overview", label: "Overview", href: "/overview" },
  { key: "sites", label: "Sites", href: "/sites/oakhaus" },
  { key: "tasks", label: "My tasks", href: "#", count: 4 },
  { key: "reports", label: "Reports", href: "#" },
];

function SidebarContent({ active, onNavigate }: { active: NavKey; onNavigate?: () => void }) {
  const item = (key: NavKey, label: string, href: string, count?: number) => {
    const on = key === active;
    return (
      <Link
        key={key}
        href={href}
        onClick={onNavigate}
        aria-current={on ? "page" : undefined}
        className={`ease-ui flex justify-between rounded-full px-3.5 py-2 text-sm leading-5 no-underline ${
          on ? "bg-primary-soft font-semibold text-ptext hover:text-ptext" : "font-medium text-ink hover:bg-surface hover:text-ink"
        }`}
      >
        {label}
        {count != null && <span className="tnum text-xs text-muted">{count}</span>}
      </Link>
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label="Switch organisation. Current: Brightline Studio"
        className="ease-ui mb-4 flex items-center gap-3 rounded-full border border-line bg-surface p-2 text-left text-ink hover:border-line-strong"
      >
        <span className="grid size-8 place-items-center rounded-md bg-primary text-[13px] font-bold text-on-primary">BS</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-5 font-semibold">Brightline Studio</span>
          <span className="text-xs leading-4 text-muted">Agency · 18 sites</span>
        </span>
        <Icon d={I.chevronsUpDown} />
      </button>
      {NAV.map((n) => item(n.key, n.label, n.href, n.count))}
      <div className="mx-1 my-3 h-px bg-line" />
      {item("settings", "Settings", "#")}
      <a href="#" className="ease-ui rounded-full px-3.5 py-2 text-sm leading-5 font-medium text-ink no-underline hover:bg-surface hover:text-ink">
        Help &amp; docs
      </a>
      <div className="flex-1" />
      <button type="button" aria-label="Account menu: Daniel Mwangi" className="flex items-center gap-3 rounded-full border-0 bg-transparent p-2 text-left text-ink">
        <span className="grid size-8 place-items-center rounded-full border border-line bg-sunk text-xs font-semibold">DM</span>
        <span className="flex flex-col">
          <span className="text-sm leading-5 font-medium">Daniel Mwangi</span>
          <span className="text-xs leading-4 text-muted">Owner</span>
        </span>
      </button>
    </>
  );
}

/** Mobile/tablet navigation drawer (spec 13: sidebar becomes a drawer). */
function NavDrawer({ open, onClose, active }: { open: boolean; onClose: () => void; active: NavKey }) {
  const [mounted, setMounted] = useState(open);
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useGSAP(
    () => {
      if (!mounted || !panel.current || !scrim.current) return;
      const reduced = prefersReducedMotion();
      if (open) {
        gsap.fromTo(scrim.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: MOTION.panel, ease: MOTION.ease });
        gsap.fromTo(panel.current, reduced ? { autoAlpha: 0 } : { xPercent: -100 }, { xPercent: 0, autoAlpha: 1, duration: MOTION.panel, ease: MOTION.ease });
        panel.current.querySelector<HTMLElement>("a,button")?.focus();
      } else {
        gsap.to(scrim.current, { autoAlpha: 0, duration: MOTION.panel, ease: MOTION.ease });
        gsap.to(panel.current, {
          ...(reduced ? { autoAlpha: 0 } : { xPercent: -100 }),
          duration: MOTION.panel,
          ease: MOTION.ease,
          onComplete: () => setMounted(false),
        });
      }
    },
    { dependencies: [open, mounted] },
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div ref={scrim} onClick={onClose} className="absolute inset-0 bg-scrim" />
      <nav
        ref={panel}
        aria-label="Main"
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-1 border-r border-line bg-subtle px-3 py-4 shadow-dialog"
      >
        <button type="button" onClick={onClose} aria-label="Close menu" className="mb-2 grid size-11 place-items-center self-end rounded-full border-0 bg-transparent text-ink">
          <Icon d={I.close} size={20} />
        </button>
        <SidebarContent active={active} onNavigate={onClose} />
      </nav>
    </div>
  );
}

export function AppShell({
  active,
  crumbs,
  children,
}: {
  active: NavKey;
  crumbs: { label: string; href?: string }[];
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <div className="flex min-h-screen bg-page text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="sticky top-0 hidden h-screen w-[248px] flex-none flex-col gap-1 overflow-y-auto border-r border-line bg-subtle px-3 py-4 lg:flex">
        <SidebarContent active={active} />
      </nav>
      <NavDrawer open={menu} onClose={() => setMenu(false)} active={active} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-line px-4 sm:gap-4 sm:px-8">
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="Open menu"
            aria-expanded={menu}
            className="grid size-11 flex-none place-items-center rounded-full border border-line bg-surface text-ink lg:hidden"
          >
            <Icon d={I.menu} size={20} />
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="m-0 flex list-none gap-2 overflow-hidden p-0 text-sm leading-5 text-ellipsis whitespace-nowrap text-muted">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={c.label} className={`flex min-w-0 gap-2 ${last ? "" : "hidden sm:flex"}`}>
                    {last ? (
                      <span aria-current="page" className="truncate font-medium text-ink">
                        {c.label}
                      </span>
                    ) : (
                      <>
                        <Link href={c.href ?? "#"} className="truncate text-muted">
                          {c.label}
                        </Link>
                        <span aria-hidden="true">/</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <button
            type="button"
            className="ease-ui flex h-9 items-center gap-3 rounded-lg border border-line-strong bg-surface px-3 text-sm text-muted hover:border-ink md:min-w-[260px] md:pr-2"
          >
            <Icon d={I.search} />
            <span className="sr-only md:not-sr-only md:flex-1 md:text-left">Search or jump to…</span>
            <kbd className="hidden rounded border border-line bg-subtle px-1.5 font-mono text-xs text-muted md:inline">Ctrl K</kbd>
          </button>
          <ThemeIconToggle />
          <button
            type="button"
            aria-label="Notifications, 3 unread"
            className="ease-ui relative grid size-9 flex-none place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle"
          >
            <Icon d={I.bell} size={18} />
            <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] rounded-[9px] bg-crit px-[5px] text-[11px] leading-[18px] font-bold text-surface">
              3
            </span>
          </button>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1344px] flex-1 px-4 pt-8 pb-16 outline-none sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
