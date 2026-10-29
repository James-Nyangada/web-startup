"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import type { GlobalBannerData } from "@/components/shell/global-banners";

export interface CmsBannerRow {
  id: string;
  message: string;
  linkUrl: string | null;
  style: "info" | "success" | "warning";
  audience: { type?: string; plans?: string[] } | null;
  dismissible: boolean;
}

export interface BannerViewer {
  /** Signed in (the app shell) or an anonymous visitor (the marketing site). */
  loggedIn: boolean;
  billingStatus?: string | null;
  plan?: string | null;
}

/** Whether this viewer is in the banner's audience (staff spec 3.7). */
export function bannerMatchesAudience(audience: CmsBannerRow["audience"], v: BannerViewer): boolean {
  const type = audience?.type ?? "everyone";
  if (type === "everyone") return true;
  if (!v.loggedIn) return false;
  if (type === "logged_in") return true;
  if (type === "trial") return v.billingStatus === "trialing";
  if (type === "specific_plans") {
    const paying = v.billingStatus === "active" || v.billingStatus === "past_due";
    if (!paying) return false;
    return audience?.plans?.length ? audience.plans.includes(v.plan ?? "") : true;
  }
  return false;
}

const DISMISSED_KEY = "ev_dismissed_banners";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberDismissed(id: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...readDismissed(), id])].slice(-50)));
  } catch {
    // Dismissal then lasts only for this page view.
  }
}

/** The active staff-created banner for a surface, as a GlobalBannersRegion entry (or null). */
export function useCmsBanner(surface: "site" | "app", viewer: BannerViewer): GlobalBannerData | null {
  const [row, setRow] = useState<CmsBannerRow | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/v1/public/banners?surface=${surface}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: CmsBannerRow | null } | null) => {
        if (!cancelled) setRow(body?.data && !readDismissed().includes(body.data.id) ? body.data : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [surface]);

  if (!row || !bannerMatchesAudience(row.audience, viewer)) return null;
  return {
    kind: "announcement",
    id: `cms-${row.id}`,
    message: row.message,
    linkUrl: row.linkUrl ?? undefined,
    style: row.style,
    dismissible: row.dismissible,
    onDismiss: () => rememberDismissed(row.id),
  };
}
