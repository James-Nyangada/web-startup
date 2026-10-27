"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { appApi, platformLabel, type ApiSite } from "@/lib/app-api";

export interface CommandItem {
  id: string;
  category: "Sites" | "Settings" | "Navigation" | "Actions" | "Issues";
  label: string;
  subtext?: string;
  href?: string;
  action?: () => void;
  icon?: string;
  keywords?: string[];
}

const SETTINGS_PAGES: CommandItem[] = [
  {
    id: "settings-general",
    category: "Settings",
    label: "General Settings",
    subtext: "Organisation name, slug, time zone, ownership",
    href: "/settings/general",
    icon: I.settings,
    keywords: ["general", "org", "slug", "name", "timezone", "delete"],
  },
  {
    id: "settings-members",
    category: "Settings",
    label: "Team Members",
    subtext: "Invite colleagues, change roles, manage pending invites",
    href: "/settings/members",
    icon: I.users,
    keywords: ["team", "users", "roles", "admin", "owner", "invite"],
  },
  {
    id: "settings-billing",
    category: "Settings",
    label: "Billing & Plans",
    subtext: "Subscription plan, usage meters, invoices, payment method",
    href: "/settings/billing",
    icon: I.creditCard,
    keywords: ["billing", "subscription", "plan", "invoices", "upgrade", "payment", "card"],
  },
  {
    id: "settings-notifications",
    category: "Settings",
    label: "Notification Settings",
    subtext: "Weekly email digests, scan alerts, slack webhooks",
    href: "/settings/notifications",
    icon: I.bell,
    keywords: ["notifications", "email", "alerts", "digest", "frequency"],
  },
  {
    id: "settings-integrations",
    category: "Settings",
    label: "Integrations",
    subtext: "Connect Jira, GitHub, Slack, webhooks",
    href: "/settings/integrations",
    icon: I.link,
    keywords: ["integrations", "jira", "github", "slack", "webhooks"],
  },
  {
    id: "settings-audit",
    category: "Settings",
    label: "Audit Log",
    subtext: "Security and compliance log of all team actions",
    href: "/settings/audit-log",
    icon: I.fileText,
    keywords: ["audit", "log", "security", "history", "compliance"],
  },
  {
    id: "settings-account",
    category: "Settings",
    label: "Account & Profile",
    subtext: "Your email, password, authentication methods",
    href: "/settings/account",
    icon: I.user,
    keywords: ["account", "profile", "password", "email", "me"],
  },
];

const NAV_ITEMS: CommandItem[] = [
  {
    id: "nav-overview",
    category: "Navigation",
    label: "Overview",
    subtext: "Portfolio summary, triage lanes, high-level metrics",
    href: "/overview",
    icon: I.layout,
    keywords: ["dashboard", "home", "portfolio"],
  },
  {
    id: "nav-sites",
    category: "Navigation",
    label: "All Sites",
    subtext: "View and filter all monitored stores",
    href: "/sites",
    icon: I.globe,
    keywords: ["sites", "stores", "websites"],
  },
  {
    id: "nav-tasks",
    category: "Navigation",
    label: "My Tasks",
    subtext: "Accessibility issues assigned to you",
    href: "/tasks",
    icon: I.check,
    keywords: ["tasks", "todo", "assigned", "my"],
  },
  {
    id: "nav-reports",
    category: "Navigation",
    label: "Reports",
    subtext: "Download PDF compliance reports and summaries",
    href: "/reports",
    icon: I.fileText,
    keywords: ["reports", "pdf", "compliance", "export"],
  },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const liveRegionId = useId();
  const [org, setOrg] = useState<string | null>(null);
  const [sites, setSites] = useState<ApiSite[]>([]);

  // Load the active organisation's sites the first time the palette opens.
  useEffect(() => {
    if (!open || org) return;
    authClient
      .getMe()
      .then(async (me) => {
        const active = me.activeOrg ?? me.memberships[0]?.org;
        if (!active) return;
        const slug = active.slug ?? active.id;
        setOrg(slug);
        setSites(await appApi.listSites(slug));
      })
      .catch(() => setSites([]));
  }, [open, org]);

  // Remember previous active element to restore focus on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    } else {
      if (triggerRef.current && triggerRef.current.isConnected) {
        triggerRef.current.focus();
      }
    }
  }, [open]);

  // Build the complete search pool
  const allCommands = useMemo<CommandItem[]>(() => {
    // 1. Sites
    const siteCommands: CommandItem[] = sites.map((s) => {
      const host = s.rootUrl.replace(/^https?:\/\//, "");
      return {
        id: `site-${s.id}`,
        category: "Sites",
        label: s.name,
        subtext: `${host} · ${platformLabel(s.platform)} · Score: ${s.score ?? "-"}`,
        href: `/${org}/sites/${s.id}`,
        icon: I.globe,
        keywords: [host, s.clientName ?? "", s.platform, "site", "store"],
      };
    });

    // 2. Actions
    const actionCommands: CommandItem[] = [
      {
        id: "action-add-site",
        category: "Actions",
        label: "Add new site",
        subtext: "Begin monitoring a new Shopify or WordPress store",
        action: () => {
          router.push(org ? `/${org}/sites` : "/sites");
        },
        icon: I.plus,
        keywords: ["new", "create", "site", "add"],
      },
      {
        id: "action-invite-member",
        category: "Actions",
        label: "Invite team member",
        subtext: "Send an email invitation to join your organisation",
        action: () => {
          router.push("/settings/members?action=invite");
        },
        icon: I.users,
        keywords: ["invite", "member", "colleague", "team"],
      },
    ];

    return [...siteCommands, ...SETTINGS_PAGES, ...NAV_ITEMS, ...actionCommands];
  }, [router, sites, org]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default / recent items when empty
      return [
        ...allCommands.filter((c) => c.category === "Sites").slice(0, 3),
        allCommands.find((c) => c.id === "nav-overview"),
        allCommands.find((c) => c.id === "settings-members"),
        allCommands.find((c) => c.id === "action-add-site"),
      ].filter((c): c is CommandItem => Boolean(c));
    }

    return allCommands.filter((c) => {
      if (c.label.toLowerCase().includes(q)) return true;
      if (c.subtext?.toLowerCase().includes(q)) return true;
      if (c.category.toLowerCase().includes(q)) return true;
      if (c.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [query, allCommands]);

  // Reset or adjust selection index
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeItem = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [onClose, router]
  );

  // Keyboard navigation within command palette
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredCommands[selectedIndex];
      if (current) executeItem(current);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Ensure active item is scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>("[aria-selected='true']");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 sm:pt-24"
    >
      {/* Scrim / Backdrop */}
      <div
        className="fixed inset-0 bg-scrim/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        className="relative z-10 w-full max-w-[620px] overflow-hidden rounded-2xl border border-line bg-surface shadow-dialog text-ink"
        onKeyDown={onKeyDown}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <Icon d={I.search} size={20} className="flex-none text-muted" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-activedescendant={
              filteredCommands[selectedIndex] ? `cmd-${filteredCommands[selectedIndex].id}` : undefined
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search sites, settings, actions..."
            className="w-full border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid size-6 place-items-center rounded border-0 bg-transparent text-muted hover:text-ink"
            >
              <Icon d={I.close} size={14} />
            </button>
          )}
          <kbd className="hidden rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-xs text-muted sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Live region for accessibility announcements */}
        <div id={liveRegionId} role="status" aria-live="polite" className="sr-only">
          {query
            ? `${filteredCommands.length} command${filteredCommands.length === 1 ? "" : "s"} found for "${query}"`
            : "Showing suggested commands"}
        </div>

        {/* Results List */}
        <ul
          id="command-results"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="m-0 max-h-[380px] list-none overflow-y-auto p-2"
        >
          {filteredCommands.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted">
              No matching commands or pages found for &ldquo;{query}&rdquo;.
            </li>
          ) : (
            filteredCommands.map((item, idx) => {
              const selected = idx === selectedIndex;
              return (
                <li
                  key={item.id}
                  id={`cmd-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    selected ? "bg-primary-soft text-ptext" : "text-ink hover:bg-subtle"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid size-8 flex-none place-items-center rounded-lg border ${
                        selected ? "border-primary/30 bg-primary/10 text-primary" : "border-line bg-surface text-muted"
                      }`}
                    >
                      <Icon d={item.icon ?? I.circle} size={16} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{item.label}</span>
                      {item.subtext && (
                        <span className="truncate text-xs text-muted">{item.subtext}</span>
                      )}
                    </div>
                  </div>
                  <span className="flex-none rounded border border-line/60 bg-surface/50 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {item.category}
                  </span>
                </li>
              );
            })
          )}
        </ul>

        {/* Command palette footer */}
        <div className="flex items-center justify-between border-t border-line bg-subtle/50 px-4 py-2 text-xs text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-line bg-surface px-1 py-0.5 font-mono">↑</kbd>{" "}
              <kbd className="rounded border border-line bg-surface px-1 py-0.5 font-mono">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">↵</kbd> to select
            </span>
          </div>
          <span>EveryVisitor Command Palette</span>
        </div>
      </div>
    </div>
  );
}
