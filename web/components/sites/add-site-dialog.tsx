"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { useFocusTrap } from "@/components/use-focus-trap";

export interface NewSiteData {
  name: string;
  url: string;
  platform: string;
  clientName?: string;
}

export function AddSiteDialog({
  open,
  onClose,
  onSiteCreated,
  isAgency = true,
}: {
  open: boolean;
  onClose: () => void;
  onSiteCreated?: (site: NewSiteData) => void;
  isAgency?: boolean;
}) {
  const { showToast } = useToast();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>("unknown");
  const [clientName, setClientName] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedEvidence, setDetectedEvidence] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (open) {
      setUrl("");
      setName("");
      setPlatform("unknown");
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
        setName(`${formatted} Store`);
      }

      // Trigger platform detection
      setDetecting(true);
      setDetectedEvidence(null);

      // In client or dev mode: simulate / call platform detection
      try {
        const res = await fetch("/v1/sites/detect-platform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: rootOrigin }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.data?.platform && body.data.platform !== "unknown") {
            setPlatform(body.data.platform);
            setDetectedEvidence(`Detected: ${body.data.platform.toUpperCase()}`);
            setDetecting(false);
            return;
          }
        }
      } catch {
        // Fallback heuristics
      }

      // Local heuristic fallback
      if (clean.includes("myshopify") || clean.includes("oakhaus") || clean.includes("sora") || clean.includes("baraka")) {
        setPlatform("shopify");
        setDetectedEvidence("Detected: Shopify (via headers & theme scripts)");
      } else if (clean.includes("wp") || clean.includes("kito") || clean.includes("mwanga") || clean.includes("lumen")) {
        setPlatform("wordpress");
        setDetectedEvidence("Detected: WordPress (via wp-json & generator)");
      } else {
        setPlatform("unknown");
        setDetectedEvidence("Platform could not be detected automatically. Please select below.");
      }
    } catch {
      setError("Please enter a valid website address.");
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      setError("Website URL is required.");
      return;
    }

    if (!name) {
      setError("Site name is required.");
      return;
    }

    // Normalise to apex root
    let root = url.trim();
    try {
      if (!/^https?:\/\//i.test(root)) root = "https://" + root;
      root = new URL(root).origin;
    } catch {
      setError("Invalid website URL.");
      return;
    }

    const newSite: NewSiteData = {
      name: name.trim(),
      url: root.replace(/^https?:\/\//, ""),
      platform,
      clientName: isAgency ? clientName.trim() : undefined,
    };

    onSiteCreated?.(newSite);
    showToast(`Added ${newSite.name} (${root}). Initial scan queued!`);
    onClose();
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
              We&apos;ll check the homepage, detect the platform, and run an onboarding scan.
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
                Platform
              </label>
              {detecting && (
                <span className="text-xs text-primary animate-pulse">Detecting platform...</span>
              )}
            </div>
            <select
              id="sitePlatform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="shopify">Shopify</option>
              <option value="wordpress">WordPress</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="webflow">Webflow</option>
              <option value="wix">Wix</option>
              <option value="squarespace">Squarespace</option>
              <option value="custom">Custom / Other</option>
              <option value="unknown">Unknown</option>
            </select>
            {detectedEvidence && (
              <span className="text-[11px] text-ok font-medium">{detectedEvidence}</span>
            )}
          </div>

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
              className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-card"
            >
              Add site &amp; run scan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
