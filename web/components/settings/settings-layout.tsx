"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

const SETTINGS_NAV = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/members", label: "Team & Members" },
  { href: "/settings/billing", label: "Billing & Plans" },
  { href: "/settings/branding", label: "Branding" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/audit-log", label: "Audit Log" },
  { href: "/settings/account", label: "Account" },
];

export function SettingsLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShell
      active="settings"
      crumbs={[
        { label: "Brightline Studio", href: "/overview" },
        { label: "Settings", href: "/settings/general" },
        { label: title },
      ]}
    >
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="m-0 font-serif text-[32px] sm:text-[38px] font-normal tracking-tight text-ink">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>

        {/* Settings Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line pb-px">
          {SETTINGS_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`ease-ui whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium no-underline transition-colors ${
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted hover:border-line hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Settings Content Area */}
        <div className="mt-2">{children}</div>
      </div>
    </AppShell>
  );
}
