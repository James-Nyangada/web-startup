"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";

export type BannerKind =
  | "impersonation"
  | "read-only"
  | "past_due"
  | "trial"
  | "verification"
  | "email";

export interface GlobalBannerData {
  kind: BannerKind;
  id?: string;
  orgName?: string;
  email?: string;
  siteName?: string;
  siteSlug?: string;
  /** Where the banner's action goes (e.g. the site's verification page). */
  href?: string;
  daysRemaining?: number;
  daysLeft?: number;
  onAction?: () => void;
  onDismiss?: () => void;
}

const PRIORITY_ORDER: Record<BannerKind, number> = {
  impersonation: 1,
  "read-only": 2,
  past_due: 3,
  trial: 4,
  verification: 5,
  email: 6,
};

export function GlobalBannersRegion({
  banners,
  className,
}: {
  banners?: GlobalBannerData[];
  className?: string;
}) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  if (!banners || banners.length === 0) return null;

  // Filter out dismissed banners and sort strictly by spec priority order:
  // impersonation > read-only > past due > trial > verification > email
  const activeBanners = banners
    .filter((b) => !dismissed[b.id ?? b.kind])
    .sort((a, b) => (PRIORITY_ORDER[a.kind] ?? 99) - (PRIORITY_ORDER[b.kind] ?? 99));

  if (activeBanners.length === 0) return null;

  // Display the top priority active banner
  const banner = activeBanners[0];
  const bannerKey = banner.id ?? banner.kind;

  const handleDismiss = () => {
    setDismissed((prev) => ({ ...prev, [bannerKey]: true }));
    banner.onDismiss?.();
  };

  return (
    <div
      role="region"
      aria-label="Important notices"
      className={`border-b text-sm leading-5 font-medium ${className ?? ""}`}
    >
      {banner.kind === "impersonation" && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border-amber-500/30 text-ink px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Icon d={I.shield} size={18} stroke="var(--ser)" className="flex-none" />
            <span>
              Viewing as <strong className="font-semibold">{banner.orgName ?? "Customer"}</strong> (read-only mode)
            </span>
          </div>
          <button
            type="button"
            onClick={banner.onAction}
            className="ease-ui rounded-full bg-surface border border-line px-3 py-1 text-xs font-semibold hover:bg-subtle text-ink"
          >
            Stop impersonating
          </button>
        </div>
      )}

      {banner.kind === "read-only" && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-500/10 border-rose-500/30 text-ink px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Icon d={I.critical} size={18} stroke="var(--crit)" className="flex-none" />
            <span>
              Your trial has ended. Your account is currently in <strong>read-only mode</strong>.
            </span>
          </div>
          <Link
            href="/settings/billing"
            className="ease-ui inline-flex items-center rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-on-primary hover:bg-primary-hover no-underline"
          >
            Upgrade plan
          </Link>
        </div>
      )}

      {banner.kind === "past_due" && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border-amber-500/30 text-ink px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Icon d={I.serious} size={18} stroke="var(--ser)" className="flex-none" />
            <span>
              Payment failed. Update your card within <strong>{banner.daysRemaining ?? 7} days</strong> to prevent scanning from pausing.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/billing"
              className="ease-ui inline-flex items-center rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-on-primary hover:bg-primary-hover no-underline"
            >
              Update billing
            </Link>
          </div>
        </div>
      )}

      {banner.kind === "trial" && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-primary-soft text-ink px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Icon d={I.minor} size={18} stroke="var(--primary)" className="flex-none" />
            <span>
              <strong>{banner.daysLeft ?? 10} days</strong> left in your trial. Upgrade anytime to keep continuous weekly monitoring.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/billing"
              className="ease-ui inline-flex items-center rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-on-primary hover:bg-primary-hover no-underline"
            >
              Choose plan
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="grid size-6 place-items-center text-muted hover:text-ink border-0 bg-transparent"
            >
              <Icon d={I.close} size={14} />
            </button>
          </div>
        </div>
      )}

      {banner.kind === "verification" && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border-amber-500/30 text-ink px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Icon d={I.serious} size={18} stroke="var(--ser)" className="flex-none" />
            <span>
              Site verification pending for <strong>{banner.siteName ?? "your store"}</strong>. Verify domain ownership to enable automated weekly scans.
            </span>
          </div>
          <Link
            href={banner.href ?? (banner.siteSlug ? `/sites/${banner.siteSlug}/verify` : "/sites")}
            className="ease-ui inline-flex items-center rounded-full bg-surface border border-line px-3 py-1 text-xs font-semibold hover:bg-subtle text-ink no-underline"
          >
            Verify site
          </Link>
        </div>
      )}

      {banner.kind === "email" && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-subtle border-line text-ink px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Icon d={I.minor} size={18} stroke="var(--primary)" className="flex-none" />
            <span>
              Please verify your email address ({banner.email ?? "your email"}). You can use the app, but inviting teammates requires verification.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={banner.onAction}
              className="ease-ui rounded-full bg-surface border border-line px-3 py-1 text-xs font-semibold hover:bg-subtle text-ink"
            >
              Resend verification
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="grid size-6 place-items-center text-muted hover:text-ink border-0 bg-transparent"
            >
              <Icon d={I.close} size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
