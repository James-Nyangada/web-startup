"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { useFocusTrap } from "@/components/use-focus-trap";

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
  limit?: number | boolean | string;
  current?: number | boolean | string;
  upgradeTo?: string | null;
}

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  store: "Store Plan",
  growth: "Growth Plan",
  agency: "Agency Plan",
  agency_pro: "Agency Pro Plan",
};

const PLAN_BENEFITS: Record<string, string[]> = {
  store: [
    "1 monitored site with 250 pages scanned",
    "Weekly scheduled scans & manual checks",
    "2 team member seats",
  ],
  growth: [
    "Up to 3 monitored sites with 500 pages/scan",
    "Daily automatic scans & Slack webhooks",
    "5 team member seats & regression alerts",
  ],
  agency: [
    "Up to 25 monitored sites",
    "White-label branding & custom report PDFs",
    "Unlimited client viewer accounts",
    "Scheduled client monthly reports",
  ],
  agency_pro: [
    "Up to 75 monitored sites & 500 pages/scan",
    "Daily scans across all sites",
    "Custom portal domain (status.youragency.com)",
    "Public REST API access & API keys",
    "Unlimited team member seats",
  ],
};

export function UpgradeModal({
  open,
  onClose,
  message,
  limit,
  current,
  upgradeTo = "agency",
}: UpgradeModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const targetPlanKey = upgradeTo || "growth";
  const targetPlanName = PLAN_DISPLAY_NAMES[targetPlanKey] || "Higher Tier Plan";
  const targetBenefits = PLAN_BENEFITS[targetPlanKey] || PLAN_BENEFITS.agency;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      aria-describedby="upgrade-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-card flex flex-col gap-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon d={I.sparkles} size={22} />
            </span>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Plan Limit</span>
              <h2 id="upgrade-modal-title" className="text-xl font-serif font-normal m-0 text-ink">
                Upgrade Required
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="ease-ui rounded-full p-2 text-muted hover:bg-subtle hover:text-ink cursor-pointer border-0 bg-transparent"
          >
            <Icon d={I.close} size={18} />
          </button>
        </div>

        <div className="rounded-2xl border border-line bg-subtle/50 p-4 flex flex-col gap-2">
          <p id="upgrade-modal-description" className="text-sm font-medium text-ink m-0">
            {message || "You have reached the maximum limit for this feature on your current plan."}
          </p>
          {limit !== undefined && current !== undefined && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Current usage: <strong className="text-ink">{String(current)}</strong></span>
              <span>•</span>
              <span>Plan limit: <strong className="text-ink">{String(limit)}</strong></span>
            </div>
          )}
        </div>

        {/* Upgrade Target Card */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Recommended: {targetPlanName}
            </span>
          </div>

          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {targetBenefits.map((benefit, idx) => (
              <li key={idx} className="flex items-center gap-2 text-xs text-ink">
                <span className="text-primary font-bold">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle cursor-pointer"
          >
            Not now
          </button>
          <Link
            href="/settings/billing"
            onClick={onClose}
            className="ease-ui inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-card no-underline"
          >
            <span>View Plans & Upgrade</span>
            <Icon d={I.arrowRight} size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
