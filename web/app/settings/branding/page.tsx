"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { CustomDomainCard } from "@/components/settings/custom-domain-card";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import {
  appApi,
  type ApiBranding,
  type ApiBillingInfo,
} from "@/lib/app-api";
import { apiClient } from "@/lib/api";
import {
  getContrastAgainstWhite,
  findAccessibleAlternative,
  parseHexColor,
} from "@/lib/contrast";

type PreviewTab = "report" | "email" | "portal";

export default function BrandingSettingsPage() {
  const { showToast } = useToast();
  const [orgSlug, setOrgSlug] = useState<string>("brightline");
  const [orgPlan, setOrgPlan] = useState<string>("trial");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>("report");

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0F3D3E");
  const [logoLightUrl, setLogoLightUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [emailSenderName, setEmailSenderName] = useState("");
  const [reportFooter, setReportFooter] = useState("");
  const [hidePlainsightBranding, setHidePlainsightBranding] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const onDomainChange = useCallback((d: string | null) => setCustomDomain(d ?? ""), []);

  // File upload states
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  // Contrast calculation
  const contrastInfo = getContrastAgainstWhite(primaryColor);
  const isColorValid = parseHexColor(primaryColor) !== null;
  const passesContrast = isColorValid && contrastInfo.valid;
  const suggestedAlt = isColorValid
    ? findAccessibleAlternative(primaryColor)
    : "#0F3D3E";

  const isAgencyPlan = orgPlan === "agency" || orgPlan === "agency_pro";

  // Initial fetch
  const loadData = useCallback(async (slug: string) => {
    try {
      setLoading(true);
      const [billingRes, brandingRes] = await Promise.allSettled([
        appApi.getBilling(slug),
        appApi.getBranding(slug),
      ]);

      if (billingRes.status === "fulfilled" && billingRes.value) {
        setOrgPlan(billingRes.value.plan || "trial");
      }

      if (brandingRes.status === "fulfilled" && brandingRes.value) {
        const b = brandingRes.value;
        setDisplayName(b.displayName || "");
        if (b.primaryColor) setPrimaryColor(b.primaryColor);
        if (b.logoLightKey) {
          setLogoLightUrl(`/v1/orgs/${slug}/branding/logo/light`);
        }
        if (b.logoDarkKey) {
          setLogoDarkUrl(`/v1/orgs/${slug}/branding/logo/dark`);
        }
        setEmailSenderName(b.emailSenderName || "");
        setReportFooter(b.reportFooter || "");
        setHidePlainsightBranding(Boolean(b.hidePlainsightBranding));
        setCustomDomain(b.customDomain || "");
      }
    } catch {
      // Allow user to edit even if fetch failed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiClient<{ user: unknown; orgs: Array<{ id: string; slug: string }> }>("/v1/me")
      .then((data) => {
        if (data?.orgs?.length && data.orgs[0]?.slug) {
          const currentSlug = data.orgs[0].slug;
          setOrgSlug(currentSlug);
          loadData(currentSlug);
        } else {
          loadData("brightline");
        }
      })
      .catch(() => {
        loadData("brightline");
      });
  }, [loadData]);

  // Handle Logo Upload
  const handleLogoFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "light" | "dark",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("Logo file must be smaller than 2 MB.", { type: "error" });
      return;
    }

    const setUploading = type === "light" ? setUploadingLight : setUploadingDark;
    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          await appApi.uploadLogo(orgSlug, type, dataUrl);
          if (type === "light") {
            setLogoLightUrl(dataUrl);
          } else {
            setLogoDarkUrl(dataUrl);
          }
          showToast(`${type === "light" ? "Light" : "Dark"} logo uploaded successfully.`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to upload logo";
          showToast(msg, { type: "error" });
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
      showToast("Could not process logo file.", { type: "error" });
    }
  };

  const handleDeleteLogo = async (type: "light" | "dark") => {
    try {
      await appApi.deleteLogo(orgSlug, type);
      if (type === "light") {
        setLogoLightUrl(null);
        if (lightInputRef.current) lightInputRef.current.value = "";
      } else {
        setLogoDarkUrl(null);
        if (darkInputRef.current) darkInputRef.current.value = "";
      }
      showToast(`${type === "light" ? "Light" : "Dark"} logo removed.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove logo";
      showToast(msg, { type: "error" });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passesContrast) {
      showToast("Color does not meet WCAG 4.5:1 contrast against white.", { type: "error" });
      return;
    }

    setSaving(true);
    try {
      await appApi.updateBranding(orgSlug, {
        displayName: displayName.trim() || null,
        primaryColor,
        emailSenderName: emailSenderName.trim() || null,
        reportFooter: reportFooter.trim() || null,
        hidePlainsightBranding,
      });
      showToast("White-label branding saved successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save branding";
      showToast(msg, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout
      title="White-label Branding"
      description="Customize reports, client emails, and the client portal with your agency's logo, colors, and domain."
    >
      {/* Plan gate notice if not Agency plan */}
      {!loading && !isAgencyPlan && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink m-0">
                  White-label branding requires an Agency plan
                </h2>
                <p className="mt-1 text-muted text-xs sm:text-sm">
                  Upgrade your subscription to Agency or Agency Pro to customize reports, client portal themes, custom emails, and domain names.
                </p>
              </div>
            </div>
            <Link
              href="/settings/billing"
              className="ease-ui inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-white no-underline hover:opacity-95"
            >
              Upgrade to Agency
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: Customizer Controls */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 flex flex-col gap-6"
        >
          {/* Section 1: Agency Brand Profile */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
            <h2 className="text-base font-semibold m-0 text-ink">Brand Identity</h2>

            {/* Display Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="displayName" className="text-sm font-medium text-ink">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                placeholder="e.g. Acme Accessibility Studio"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-muted m-0">
                Shown on report covers, email headers, and the client portal.
              </p>
            </div>

            {/* Primary Brand Color & Contrast Check */}
            <div className="flex flex-col gap-2">
              <label htmlFor="primaryColor" className="text-sm font-medium text-ink">
                Primary Brand Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={isColorValid ? primaryColor : "#0F3D3E"}
                  onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                  aria-label="Brand color picker"
                  className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
                />
                <div className="relative flex-1">
                  <input
                    id="primaryColor"
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                    placeholder="#0F3D3E"
                    maxLength={7}
                    className="h-10 w-full font-mono rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Live Contrast Ratio Badge & Indicator */}
              <div
                className={`mt-1.5 rounded-xl border p-3.5 text-xs transition-colors ${
                  passesContrast
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-950"
                }`}
              >
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        passesContrast ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    />
                    Contrast against white:{" "}
                    <strong>{isColorValid ? `${contrastInfo.contrast} : 1` : "Invalid hex"}</strong>
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      passesContrast
                        ? "bg-emerald-200/60 text-emerald-800"
                        : "bg-red-200 text-red-800"
                    }`}
                  >
                    {passesContrast ? "WCAG AA Pass" : "WCAG AA Fail"}
                  </span>
                </div>

                {!passesContrast && (
                  <div className="mt-2.5 pt-2.5 border-t border-red-200/80 flex flex-col gap-2">
                    <p className="m-0 leading-relaxed text-red-900 text-xs">
                      WCAG 2.1 Level AA requires at least <strong>4.5 : 1</strong> contrast against white backgrounds for text and key interactive controls. Colors below 4.5:1 cannot be saved.
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-red-900">Recommended fix:</span>
                      <button
                        type="button"
                        onClick={() => setPrimaryColor(suggestedAlt)}
                        className="ease-ui inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-xs hover:bg-neutral-50"
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-black/10 inline-block"
                          style={{ backgroundColor: suggestedAlt }}
                        />
                        Use {suggestedAlt}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Logos */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
            <h2 className="text-base font-semibold m-0 text-ink">Brand Logos</h2>
            <p className="text-xs text-muted m-0">
              Upload high-resolution PNG, SVG, or WebP files (max 2 MB each). Transparent backgrounds recommended.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Light Logo (used on white/light backgrounds) */}
              <div className="rounded-xl border border-line p-4 flex flex-col gap-3 bg-surface">
                <span className="text-xs font-semibold text-ink">Light Background Logo</span>
                <div className="h-24 rounded-lg border border-dashed border-line bg-white flex items-center justify-center p-3 overflow-hidden">
                  {logoLightUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoLightUrl}
                      alt="Light background brand logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted">No light logo uploaded</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={lightInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => handleLogoFile(e, "light")}
                    className="hidden"
                    id="lightLogoUpload"
                  />
                  <label
                    htmlFor="lightLogoUpload"
                    className="ease-ui cursor-pointer inline-flex h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    {uploadingLight ? "Uploading..." : logoLightUrl ? "Replace" : "Upload logo"}
                  </label>
                  {logoLightUrl && (
                    <button
                      type="button"
                      onClick={() => handleDeleteLogo("light")}
                      className="ease-ui inline-flex h-8 items-center justify-center rounded-lg border border-line px-3 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Dark Logo (used on dark backgrounds) */}
              <div className="rounded-xl border border-line p-4 flex flex-col gap-3 bg-surface">
                <span className="text-xs font-semibold text-ink">Dark Background Logo</span>
                <div className="h-24 rounded-lg border border-dashed border-line bg-neutral-900 flex items-center justify-center p-3 overflow-hidden">
                  {logoDarkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoDarkUrl}
                      alt="Dark background brand logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">No dark logo uploaded</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={darkInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => handleLogoFile(e, "dark")}
                    className="hidden"
                    id="darkLogoUpload"
                  />
                  <label
                    htmlFor="darkLogoUpload"
                    className="ease-ui cursor-pointer inline-flex h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    {uploadingDark ? "Uploading..." : logoDarkUrl ? "Replace" : "Upload logo"}
                  </label>
                  {logoDarkUrl && (
                    <button
                      type="button"
                      onClick={() => handleDeleteLogo("dark")}
                      className="ease-ui inline-flex h-8 items-center justify-center rounded-lg border border-line px-3 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Communications & Reports */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
            <h2 className="text-base font-semibold m-0 text-ink">Client Communications & Reports</h2>

            {/* Email Sender Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="emailSenderName" className="text-sm font-medium text-ink">
                Email Sender Name
              </label>
              <input
                id="emailSenderName"
                type="text"
                placeholder="e.g. Acme Accessibility Team"
                value={emailSenderName}
                onChange={(e) => setEmailSenderName(e.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-muted m-0">
                Shown in the email &apos;From&apos; field when delivering invitations and scan summaries to clients.
              </p>
            </div>

            {/* Report Footer */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reportFooter" className="text-sm font-medium text-ink">
                PDF Report Footer Text
              </label>
              <input
                id="reportFooter"
                type="text"
                placeholder="e.g. Confidential audit report prepared by Acme Studio"
                value={reportFooter}
                onChange={(e) => setReportFooter(e.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-muted m-0">
                Replaces the default Plainsight disclaimer in the bottom footer of PDF reports.
              </p>
            </div>

            {/* Hide Plainsight Branding Toggle */}
            <div className="flex items-start gap-3 pt-2">
              <input
                id="hidePlainsight"
                type="checkbox"
                checked={hidePlainsightBranding}
                onChange={(e) => setHidePlainsightBranding(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="hidePlainsight" className="flex flex-col cursor-pointer">
                <span className="text-sm font-medium text-ink">Hide Plainsight marks</span>
                <span className="text-xs text-muted">
                  Removes &apos;Powered by Plainsight&apos; branding from client reports, emails, and the client portal.
                </span>
              </label>
            </div>
          </div>

          {/* Section 4: Custom Domain (P6-07) */}
          <CustomDomainCard slug={orgSlug} plan={orgPlan} onDomainChange={onDomainChange} />

          {/* Save Button */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saving || !passesContrast}
              className={`ease-ui inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-card transition-all ${
                passesContrast && !saving
                  ? "bg-primary hover:opacity-95 cursor-pointer"
                  : "bg-neutral-400 cursor-not-allowed opacity-70"
              }`}
            >
              {saving ? "Saving changes..." : "Save Branding"}
            </button>
            {!passesContrast && (
              <span className="text-xs font-medium text-red-600">
                Fix contrast ratio (≥ 4.5:1 required) to enable saving.
              </span>
            )}
          </div>
        </form>

        {/* Right Column: Live Previews */}
        <div className="lg:col-span-5 sticky top-6 flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink m-0">Live Preview</h2>
              {/* Preview Tabs */}
              <div className="flex items-center gap-1 rounded-lg bg-surface-sunken p-1 border border-line">
                {(["report", "email", "portal"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? "bg-surface text-ink shadow-xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {tab === "report" ? "Report" : tab === "email" ? "Email" : "Portal"}
                  </button>
                ))}
              </div>
            </div>

            {/* TAB 1: Report Cover Preview */}
            {activeTab === "report" && (
              <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-md flex flex-col gap-6 text-neutral-900 min-h-[380px] justify-between">
                <div>
                  {/* Accent Top Bar */}
                  <div
                    className="h-2 w-full rounded-full mb-4"
                    style={{ backgroundColor: isColorValid ? primaryColor : "#0F3D3E" }}
                  />

                  {/* Header / Logo */}
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                    {logoLightUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoLightUrl}
                        alt="Brand preview logo"
                        className="h-7 max-w-[140px] object-contain"
                      />
                    ) : (
                      <span
                        className="font-bold text-base tracking-tight"
                        style={{ color: isColorValid ? primaryColor : "#0F3D3E" }}
                      >
                        {displayName || "Agency Studio"}
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-400">
                      WCAG 2.2 AA
                    </span>
                  </div>

                  {/* Title & Metadata */}
                  <div className="mt-6 flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                      Audit & Assessment
                    </span>
                    <h3 className="text-xl font-serif font-bold text-neutral-900 m-0">
                      Accessibility Scan Report
                    </h3>
                    <p className="text-xs text-neutral-600 m-0">
                      Prepared for <strong>Client Storefront (production)</strong>
                    </p>
                    <p className="text-xs text-neutral-500 m-0">
                      Prepared by:{" "}
                      <span
                        className="font-medium"
                        style={{ color: isColorValid ? primaryColor : "#0F3D3E" }}
                      >
                        {displayName || "Brightline Studio"}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Score & Footer */}
                <div className="flex flex-col gap-3 pt-4 border-t border-neutral-200">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-2xl font-serif font-bold"
                      style={{ color: isColorValid ? primaryColor : "#0F3D3E" }}
                    >
                      94
                    </span>
                    <span className="text-xs text-neutral-500">/ 100 overall score · 0 critical</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 m-0 line-clamp-2">
                    {reportFooter || "Automated checks only, not a compliance assessment"}
                  </p>
                  {!hidePlainsightBranding && (
                    <div className="text-[9px] text-neutral-400">
                      Powered by Plainsight
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Email Header Preview */}
            {activeTab === "email" && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm flex flex-col gap-3 min-h-[380px]">
                {/* Email Client Header */}
                <div className="rounded-lg bg-white border border-neutral-200 p-3 flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <span className="font-semibold text-neutral-900">From:</span>
                    <span>
                      {emailSenderName || displayName || "Plainsight"} &lt;notifications@updates.io&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <span className="font-semibold text-neutral-900">Subject:</span>
                    <span className="font-medium text-neutral-800">
                      Weekly Accessibility Scan: Client Storefront (Score: 94)
                    </span>
                  </div>
                </div>

                {/* Email Body Card */}
                <div className="rounded-lg bg-white border border-neutral-200 overflow-hidden shadow-xs flex-1 flex flex-col justify-between">
                  <div>
                    {/* Header Banner */}
                    <div
                      className="p-4 text-white flex items-center justify-between"
                      style={{ backgroundColor: isColorValid ? primaryColor : "#0F3D3E" }}
                    >
                      {logoDarkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoDarkUrl}
                          alt="Brand logo"
                          className="h-6 max-w-[120px] object-contain"
                        />
                      ) : (
                        <span className="font-bold text-sm tracking-tight">
                          {displayName || "Plainsight"}
                        </span>
                      )}
                      <span className="text-[10px] font-mono opacity-80 uppercase tracking-widest">
                        Weekly Digest
                      </span>
                    </div>

                    {/* Email Content Body */}
                    <div className="p-4 flex flex-col gap-3 text-xs text-neutral-700">
                      <p className="m-0 font-medium text-neutral-900">
                        Hello team,
                      </p>
                      <p className="m-0 leading-relaxed text-neutral-600">
                        The scheduled scan for <strong>Client Storefront</strong> has completed. All 25 pages were scanned with zero critical regressions detected.
                      </p>
                      <div className="rounded-md bg-neutral-50 p-2.5 border border-neutral-100 flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Accessibility Score</span>
                        <span className="font-bold text-neutral-900">94 / 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Email Footer */}
                  <div className="p-3 bg-neutral-50 border-t border-neutral-100 text-[10px] text-neutral-400 text-center">
                    {!hidePlainsightBranding ? (
                      <span>Delivered via Plainsight White-Label</span>
                    ) : (
                      <span>Sent by {displayName || "Agency Studio"}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Client Portal Preview */}
            {activeTab === "portal" && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-4 shadow-sm flex flex-col gap-3 min-h-[380px]">
                {/* Browser top-bar mockup */}
                <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-200 rounded-t-lg">
                  <span className="h-2 w-2 rounded-full bg-neutral-400" />
                  <span className="h-2 w-2 rounded-full bg-neutral-400" />
                  <span className="h-2 w-2 rounded-full bg-neutral-400" />
                  <div className="ml-2 flex-1 rounded bg-white px-2 py-0.5 text-[10px] font-mono text-neutral-500 truncate">
                    {customDomain ? `https://${customDomain}` : "https://portal.plainsight.app/acme"}
                  </div>
                </div>

                {/* Portal Navbar mockup */}
                <div className="rounded-lg bg-white border border-neutral-200 overflow-hidden shadow-xs flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {logoLightUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoLightUrl}
                            alt="Portal logo"
                            className="h-6 max-w-[110px] object-contain"
                          />
                        ) : (
                          <span
                            className="font-bold text-sm"
                            style={{ color: isColorValid ? primaryColor : "#0F3D3E" }}
                          >
                            {displayName || "Agency Client Portal"}
                          </span>
                        )}
                        <span className="text-neutral-300">|</span>
                        <span className="text-xs font-medium text-neutral-600">Client View</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: isColorValid ? primaryColor : "#0F3D3E" }}
                        />
                        <span className="text-[11px] text-neutral-500 font-medium">Acme Store</span>
                      </div>
                    </div>

                    {/* Portal content placeholder */}
                    <div className="p-4 flex flex-col gap-3 text-xs">
                      <div className="h-4 w-1/3 rounded bg-neutral-100" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-16 rounded-lg border border-neutral-100 bg-neutral-50 p-2 flex flex-col justify-between">
                          <span className="text-[10px] text-neutral-400">Compliance Score</span>
                          <span
                            className="text-lg font-bold"
                            style={{ color: isColorValid ? primaryColor : "#0F3D3E" }}
                          >
                            94%
                          </span>
                        </div>
                        <div className="h-16 rounded-lg border border-neutral-100 bg-neutral-50 p-2 flex flex-col justify-between">
                          <span className="text-[10px] text-neutral-400">Open Issues</span>
                          <span className="text-lg font-bold text-neutral-900">0</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portal footer */}
                  <div className="border-t border-neutral-100 p-2.5 text-center text-[10px] text-neutral-400 flex items-center justify-between px-4">
                    <span>© {new Date().getFullYear()} {displayName || "Agency Studio"}</span>
                    {!hidePlainsightBranding && (
                      <span className="text-neutral-300 text-[9px]">Powered by Plainsight</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
