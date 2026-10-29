"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeTextToggle } from "@/components/theme";
import { Icon } from "@/components/icons";
import { GlobalBannersRegion } from "@/components/shell/global-banners";
import { useCmsBanner } from "@/lib/banners";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/#how", label: "Product" },
  { href: "/agencies", label: "For agencies" },
  { href: "/pricing", label: "Pricing" },
  { href: "/fix", label: "Fix guides" },
  { href: "/blog", label: "Blog" },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const siteBanner = useCmsBanner("site", { loggedIn: false });

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {siteBanner && <GlobalBannersRegion banners={[siteBanner]} />}
      <header className="sticky top-0 z-40 border-b border-line bg-page/90 backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <div className="flex items-center gap-8">
            <Logo />
            <nav
              aria-label="Main navigation"
              className="hidden items-center gap-6 text-sm font-medium whitespace-nowrap md:flex"
            >
              {NAV.map((n) => {
                const isActive = n.href === pathname;
                return (
                  <Link
                    key={n.label}
                    href={n.href}
                    className={`transition-colors no-underline ${
                      isActive ? "font-semibold text-primary" : "text-ink hover:text-primary"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <Link
                href="/check"
                className="font-semibold text-primary no-underline hover:text-primary-hover"
              >
                Free check
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeTextToggle />

            <Link
              href="/sign-in"
              className="hidden text-sm font-semibold text-ink no-underline hover:text-primary sm:inline-block"
            >
              Sign in
            </Link>

            <Link
              href="/sign-up"
              className="ease-ui flex h-9 shrink-0 items-center rounded-full bg-primary px-3.5 text-sm font-semibold whitespace-nowrap text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary sm:px-4"
            >
              <span className="sm:hidden">Free trial</span>
              <span className="hidden sm:inline">Start free trial</span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="flex size-9 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface md:hidden"
            >
              <Icon name={mobileMenuOpen ? "close" : "menu"} size={18} />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            id="mobile-nav"
            className="border-t border-line bg-surface px-4 py-4 md:hidden shadow-card"
          >
            <nav className="flex flex-col gap-3" aria-label="Mobile menu">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-base font-medium text-ink no-underline hover:bg-subtle"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/check"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-base font-semibold text-primary no-underline hover:bg-subtle"
              >
                Free check
              </Link>
              <div className="mt-2 border-t border-line pt-3 flex flex-col gap-2">
                <Link
                  href="/sign-in"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-base font-medium text-ink no-underline hover:bg-subtle"
                >
                  Sign in
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
