"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { apiClient, ApiException } from "@/lib/api";
import { appApi, type ApiSite } from "@/lib/app-api";
import {
  frameworkLabel,
  isCustomPlatform,
  PLATFORM_LABEL,
  PLATFORM_OPTIONS,
  TECH_STACK_OPTIONS,
  techStackOption,
} from "@/lib/platforms";

/** "Looks like a custom-coded site built with Next.js" — detection is a suggestion (spec 4.3). */
export function describeDetection(platform: string, framework?: string | null): string {
  if (platform === "unknown") return "We couldn't tell how this site is built. Choose below, or leave it as Not sure.";
  if (platform === "custom") {
    const stack = framework && framework !== "html" ? frameworkLabel(framework) : null;
    return stack
      ? `Looks like a custom-coded site built with ${stack}. You can change this.`
      : "Looks like a custom-coded site. You can change this.";
  }
  return `Looks like ${PLATFORM_LABEL[platform] ?? platform}. You can change this.`;
}

export function AddSiteDialog({
  open,
  orgSlug,
  onClose,
  onSiteCreated,
  isAgency = true,
}: {
  open: boolean;
  orgSlug: string;
  onClose: () => void;
  onSiteCreated?: (site: ApiSite) => void;
  isAgency?: boolean;
}) {
  const { showToast } = useToast();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>("unknown");
  const [framework, setFramework] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedEvidence, setDetectedEvidence] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (open) {
      setUrl("");
      setName("");
      setPlatform("unknown");
      setFramework("");
      setClientName("");
      setDetectedEvidence(null);
      setError(null);
    }
  }, [open]);

  // Clean / normalize input URL and auto-infer site name
  const handleUrlBlur = async () => {
    let clean = url.trim();
    if (!clean) return;

    if (!/^https?:\/\//i.test(clean)) {
      clean = "https://" + clean;
      setUrl(clean);
    }

    try {
      const parsed = new URL(clean);
      // Strip path and query string to store apex root
      const rootOrigin = parsed.origin;
      setUrl(rootOrigin);

      // Auto-populate site name from hostname if empty
      if (!name) {
        const host = parsed.hostname.replace(/^www\./i, "");
        const parts = host.split(".")[0];
        const formatted = parts.charAt(0).toUpperCase() + parts.slice(1);
        setName(formatted);
      }

      // Trigger platform detection
      setDetecting(true);
      setDetectedEvidence(null);

      try {
        const detected = await apiClient<{ platform: string; framework?: string | null }>(
          "/v1/sites/detect-platform",
          { method: "POST", body: JSON.stringify({ url: rootOrigin }) },
        );
        setPlatform(detected.platform);
        setFramework(techStackOption(detected.framework));
        setDetectedEvidence(describeDetection(detected.platform, detected.framework));
      } catch {
        setPlatform("unknown");
        setDetectedEvidence("We couldn't tell how this site is built. Choose below, or leave it as Not sure.");
      }
    } catch {
      setError("Please enter a valid website address.");
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      setError("Website URL is required.");
      return;
    }

    if (!name) {
      setError("Site name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { site } = await apiClient<{ site: ApiSite }>(`/v1/orgs/${orgSlug}/sites`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          rootUrl: /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`,
          platform: platform !== "unknown" ? platform : undefined,
          framework: isCustomPlatform(platform) && framework ? framework : undefined,
          clientName: isAgency && clientName.trim() ? clientName.trim() : undefined,
        }),
      });
      // Spec 7.3: a new site gets a 10-page onboarding scan straight away.
      const scanStarted = await appApi
        .startScan(orgSlug, site.id, "onboarding")
        .then(() => true)
        .catch(() => false);
      showToast(
        scanStarted
          ? `Added ${site.name}. The first scan has started.`
          : `Added ${site.name}. Start a scan from the site page.`,
      );
      onSiteCreated?.(site);
      onClose();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Could not add the site. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-site-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-dialog text-ink"
      >
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div>
            <h2 id="add-site-title" className="text-lg font-semibold m-0 text-ink">
              Add new website
            </h2>
            <p className="text-xs text-muted m-0 mt-0.5">
              We&apos;ll check the home page, work out how the site is built, and run a first scan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid size-8 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle"
          >
            <Icon d={I.close} size={16} />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-crit">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="siteUrl" className="text-sm font-medium text-ink">
              Website URL
            </label>
            <input
              id="siteUrl"
              type="text"
              required
              placeholder="https://example.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onBlur={handleUrlBlur}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <span className="text-[11px] text-muted">
              Any path or query string (e.g. <code>/shop?x=1</code>) is automatically stripped to the root domain.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="siteName" className="text-sm font-medium text-ink">
              Site Name
            </label>
            <input
              id="siteName"
              type="text"
              required
              placeholder="e.g. Oakhaus Furniture"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="sitePlatform" className="text-sm font-medium text-ink">
                How is your site built?
              </label>
              {detecting && (
                <span className="text-xs text-primary animate-pulse">Checking your site…</span>
              )}
            </div>
            <select
              id="sitePlatform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              aria-describedby={detectedEvidence ? "sitePlatformDetected" : undefined}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {detectedEvidence && (
              <span id="sitePlatformDetected" className="text-[11px] text-muted font-medium">
                {detectedEvidence}
              </span>
            )}
          </div>

          {platform === "custom" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="siteStack" className="text-sm font-medium text-ink">
                Which technology? <span className="text-xs text-muted font-normal">(optional)</span>
              </label>
              <select
                id="siteStack"
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                aria-describedby="siteStackHelp"
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Skip</option>
                {TECH_STACK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span id="siteStackHelp" className="text-[11px] text-muted">
                This lets us show code examples in your framework. Not sure? Skip it.
              </span>
            </div>
          )}

          {isAgency && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="clientName" className="text-sm font-medium text-ink">
                Client Name <span className="text-xs text-muted font-normal">(Agency view)</span>
              </label>
              <input
                id="clientName"
                type="text"
                placeholder="e.g. Mark Otieno"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-card disabled:opacity-70"
            >
              {submitting ? "Adding…" : "Add site & run scan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
