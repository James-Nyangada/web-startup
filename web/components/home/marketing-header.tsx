"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeTextToggle } from "@/components/theme";

const NAV = [
  { href: "#how", label: "Product" },
  { href: "#agencies", label: "For agencies" },
  { href: "#pricing", label: "Pricing" },
  { href: "#", label: "Fix guides" },
];

export function MarketingHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-8 gap-y-4 px-4 py-4 sm:px-8">
        <Logo />
        {/* Links stay on one line and scroll sideways when the window is narrow. */}
        <nav aria-label="Main" className="flex min-w-0 flex-auto gap-6 overflow-x-auto px-0.5 py-1 text-sm font-medium whitespace-nowrap">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} className="text-ink no-underline hover:text-ptext">
              {n.label}
            </a>
          ))}
          <a href="#check" className="font-semibold text-ptext">
            Free check
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeTextToggle />
          <Link href="/overview" className="text-sm font-semibold text-ink no-underline hover:text-ptext">
            Sign in
          </Link>
          <Link
            href="/overview"
            className="ease-ui flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  );
}
