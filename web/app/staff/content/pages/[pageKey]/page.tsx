"use client";

import React, { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffShell, btn, card, formatDate, input, useStaffSession } from "@/components/staff/staff-shell";
import { staffApi, type ContentPage } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

interface Props {
  params: Promise<{ pageKey: string }>;
}

export default function StaffContentPageEditor({ params }: Props) {
  const unwrappedParams = use(params);
  const pageKey = decodeURIComponent(unwrappedParams.pageKey);
  const router = useRouter();
  const { session } = useStaffSession();

  const isLegal = pageKey.startsWith("legal.");
  const isOwner = session?.role === "owner";
  const canPublish = isLegal ? isOwner : (session?.role === "owner" || session?.role === "admin" || session?.role === "editor");

  const [page, setPage] = useState<ContentPage | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [notifyCustomers, setNotifyCustomers] = useState(false);
  const [noticeSummary, setNoticeSummary] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState("");

  const getDefaultData = useCallback((key: string): any => {
    switch (key) {
      case "home.hero":
        return {
          headline: "Stop losing sales to accessibility lawsuits and broken checkouts",
          subheadline: "EveryVisitor scans your Shopify or WooCommerce store continuously, alerts you before fines or complaints hit, and gives your developers exact copy-paste code fixes.",
          ctaButtonLabel: "Check my store free",
          trustLine: "No credit card · Results in 60 seconds · Zero tracking cookies",
        };
      case "home.facts":
        return {
          items: [
            {
              statement: "Over 4,000 eCommerce websites were sued for ADA accessibility non-compliance in the US last year.",
              sourceName: "UsableNet Annual Digital Accessibility Report",
              sourceUrl: "https://usablenet.com/report",
            },
            {
              statement: "73% of shoppers with access needs abandon checkouts immediately when hitting barrier issues.",
              sourceName: "Click-Away Pound Survey",
              sourceUrl: "https://clickawaypound.com",
            },
          ],
        };
      case "home.howItWorks":
        return {
          steps: [
            { stepNumber: 1, title: "Connect your domain", description: "Enter your store URL. We begin deep crawler scans in 60 seconds.", screenshotUrl: "", screenshotAlt: "Domain connection modal showing verification token" },
            { stepNumber: 2, title: "Automated engine scans", description: "Our axe-core & WCAG 2.2 AA audit scans checkout, cart, and key templates.", screenshotUrl: "", screenshotAlt: "Scanning progress bar highlighting accessibility audits" },
            { stepNumber: 3, title: "Actionable fix guides", description: "Get platform-specific code snippets for Liquid, Timber, and WooCommerce.", screenshotUrl: "", screenshotAlt: "Code snippet card showing before and after fix syntax" },
            { stepNumber: 4, title: "Continuous protection", description: "Nightly automated regression scans alert you immediately if updates break compliance.", screenshotUrl: "", screenshotAlt: "Dashboard badge showing store health score and zero critical issues" },
          ],
        };
      case "home.agency":
        return {
          headline: "Built for agencies managing 5 to 500 client stores",
          subtext: "Whitelabel reports, multi-store switcher, and client-ready PDFs with your branding. Turn accessibility into a predictable recurring revenue stream.",
          bullets: [
            "Whitelabel client reports with your agency logo and custom domain",
            "Multi-tenant client management with granular permission roles",
            "Automated PDF export generation ready to email to clients each month",
          ],
          imageUrl: "",
          imageAlt: "Agency multi-store dashboard view showcasing client health scores",
        };
      case "home.overlayComparison":
        return {
          rows: [
            { label: "Solves underlying code issues", overlayValue: "No — masks problems with JS", everyVisitorValue: "Yes — exact source code fixes" },
            { label: "Legal protection in lawsuits", overlayValue: "Over 800 lawsuits cited overlays", everyVisitorValue: "Documented compliance audit trail" },
            { label: "Screen reader compatibility", overlayValue: "Frequently blocked by blind users", everyVisitorValue: "Native semantic HTML standards" },
            { label: "Page speed & performance impact", overlayValue: "Heavy 300KB+ JS script injected", everyVisitorValue: "Zero client-side runtime script" },
          ],
        };
      case "home.faq":
        return {
          items: [
            { id: "1", question: "How does EveryVisitor differ from accessibility widgets and overlays?", answerMd: "Overlays inject a toolbar over your site but do not fix underlying code errors. EveryVisitor audits your real HTML and gives you exact code fixes.", order: 1, pages: ["home", "pricing"] },
            { id: "2", question: "Can I cancel my subscription anytime?", answerMd: "Yes. You can cancel at any time from your billing settings. Your access continues until the end of the billing period.", order: 2, pages: ["pricing"] },
          ],
        };
      case "pricing.copy":
        return {
          planDescriptions: {
            trial: "14-day full access with 1 store and up to 100 pages.",
            store: "For independent Shopify and WooCommerce merchants.",
            growth: "For fast-scaling brands with high checkout traffic.",
            agency: "For development agencies managing up to 25 client stores.",
            agency_pro: "For large agencies and enterprises with custom SLA requirements.",
          },
          mostPopularBadgePlan: "growth",
        };
      case "footer":
        return {
          tagline: "Automated eCommerce web accessibility compliance and continuous regression scanning.",
          linkGroups: [
            {
              title: "Product",
              links: [
                { label: "Free Scanner", url: "/free-check" },
                { label: "Features", url: "/#features" },
                { label: "Pricing", url: "/pricing" },
                { label: "Changelog", url: "/changelog" },
              ],
            },
            {
              title: "Resources",
              links: [
                { label: "Fix Guides", url: "/guides" },
                { label: "Blog", url: "/blog" },
                { label: "Overlay Comparison", url: "/#overlays" },
              ],
            },
            {
              title: "Legal",
              links: [
                { label: "Privacy Policy", url: "/legal/privacy" },
                { label: "Terms of Service", url: "/legal/terms" },
                { label: "Accessibility Statement", url: "/legal/accessibility" },
              ],
            },
          ],
        };
      default:
        if (key.startsWith("legal.")) {
          const docName = key.replace("legal.", "").toUpperCase();
          return {
            title: `${docName} Agreement`,
            effectiveDate: new Date().toISOString().split("T")[0],
            bodyMd: `# ${docName} Agreement\n\nEffective Date: ${new Date().toISOString().split("T")[0]}\n\nThis agreement governs your use of EveryVisitor...`,
            summaryOfChanges: "Initial published version.",
          };
        }
        return {};
    }
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await staffApi.getPage(pageKey);
      setPage(data);
      const val = data?.data && Object.keys(data.data).length > 0 ? data.data : getDefaultData(pageKey);
      setFormData(val);
      setRawJson(JSON.stringify(val, null, 2));
      if (data?.effectiveDate) setEffectiveDate(data.effectiveDate);
      setState("ready");
    } catch {
      const fallback = getDefaultData(pageKey);
      setFormData(fallback);
      setRawJson(JSON.stringify(fallback, null, 2));
      setState("ready");
    }
  }, [pageKey, getDefaultData]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveDraft = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      let dataToSave = formData;
      if (jsonMode) {
        dataToSave = JSON.parse(rawJson);
        setFormData(dataToSave);
      }
      const updated = await staffApi.savePage(pageKey, dataToSave, isLegal ? effectiveDate : undefined);
      setPage(updated);
      setStatusMessage({ type: "success", text: "Draft changes saved successfully." });
    } catch (err) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save draft." });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!canPublish) {
      alert("Only staff with owner role can publish legal pages.");
      return;
    }
    if (!confirm(`Are you sure you want to publish "${pageKey}"? This will update the live site and enqueue a build rebuild.`)) {
      return;
    }

    setPublishing(true);
    setStatusMessage(null);
    try {
      // Save any pending changes first
      let dataToSave = formData;
      if (jsonMode) {
        dataToSave = JSON.parse(rawJson);
      }
      await staffApi.savePage(pageKey, dataToSave, isLegal ? effectiveDate : undefined);

      const notice = notifyCustomers ? { notifyAllCustomers: true, summary: noticeSummary } : undefined;
      const updated = await staffApi.publishPage(pageKey, notice);
      setPage(updated);
      setStatusMessage({
        type: "success",
        text: `Published successfully! Version ${updated.publishedVersion ?? 1} is now live and queued for site rebuild.`,
      });
    } catch (err) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to publish." });
    } finally {
      setPublishing(false);
    }
  };

  const updateField = (field: string, val: any) => {
    const next = { ...formData, [field]: val };
    setFormData(next);
    setRawJson(JSON.stringify(next, null, 2));
  };

  return (
    <StaffShell
      title={`Edit ${pageKey}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/staff/content/pages" className={btn.secondary}>
            Back to pages
          </Link>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              setJsonMode(!jsonMode);
              if (!jsonMode) setRawJson(JSON.stringify(formData, null, 2));
            }}
          >
            <Icon d={I.code} size={15} />
            {jsonMode ? "Form view" : "Raw JSON"}
          </button>
          <button
            type="button"
            className={btn.secondary}
            onClick={handleSaveDraft}
            disabled={saving || publishing}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className={btn.primary}
            onClick={handlePublish}
            disabled={saving || publishing || !canPublish}
            title={!canPublish ? "Owner role required for legal pages" : undefined}
          >
            <Icon d={I.check} size={15} />
            {publishing ? "Publishing…" : "Publish live"}
          </button>
        </div>
      }
    >
      {/* Top Banner / Status */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="m-0 text-xl font-bold text-ink">{pageKey}</h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted">
            <span>Status: <strong className={page?.status === "published" ? "text-ok" : "text-amber-500"}>{page?.status ?? "draft"}</strong></span>
            {page?.publishedVersion && <span>Published version: v{page.publishedVersion}</span>}
            {page?.publishedAt && <span>Published at: {formatDate(page.publishedAt, true)}</span>}
          </div>
        </div>

        {isLegal && !isOwner && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 font-medium">
            Legal documents require the <strong>Owner</strong> role to publish live changes.
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          role="status"
          className={`mb-6 rounded-xl border p-4 text-sm font-medium ${
            statusMessage.type === "success"
              ? "border-ok/30 bg-ok-soft text-ok"
              : "border-crit/30 bg-crit-soft text-crit"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Editor Body */}
      {jsonMode ? (
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="raw-json" className="text-xs font-semibold text-muted">
              Raw JSON Document (Validated on save against schema)
            </label>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => {
                try {
                  const parsed = JSON.parse(rawJson);
                  setRawJson(JSON.stringify(parsed, null, 2));
                  setFormData(parsed);
                } catch {
                  alert("Invalid JSON format.");
                }
              }}
            >
              Format JSON
            </button>
          </div>
          <textarea
            id="raw-json"
            rows={24}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className={`${input} font-mono text-xs`}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section: Homepage Hero */}
          {pageKey === "home.hero" && (
            <div className={`${card} space-y-4`}>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Headline (max 150 chars)</label>
                <input
                  type="text"
                  maxLength={150}
                  value={formData.headline || ""}
                  onChange={(e) => updateField("headline", e.target.value)}
                  className={input}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Sub-headline (max 300 chars)</label>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={formData.subheadline || ""}
                  onChange={(e) => updateField("subheadline", e.target.value)}
                  className={input}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">CTA Button Label</label>
                  <input
                    type="text"
                    value={formData.ctaButtonLabel || ""}
                    onChange={(e) => updateField("ctaButtonLabel", e.target.value)}
                    className={input}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Trust Line</label>
                  <input
                    type="text"
                    value={formData.trustLine || ""}
                    onChange={(e) => updateField("trustLine", e.target.value)}
                    className={input}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Homepage Facts */}
          {pageKey === "home.facts" && (
            <div className={`${card} space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="m-0 text-sm font-bold text-ink">Fact Items (Up to 3, sources required)</h3>
                {(formData.items?.length || 0) < 3 && (
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => {
                      const items = [...(formData.items || []), { statement: "", sourceName: "", sourceUrl: "" }];
                      updateField("items", items);
                    }}
                  >
                    <Icon d={I.plus} size={14} /> Add fact
                  </button>
                )}
              </div>
              {(formData.items || []).map((item: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-line bg-subtle p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted">Fact #{idx + 1}</span>
                    <button
                      type="button"
                      className="text-xs text-crit hover:underline"
                      onClick={() => {
                        const items = formData.items.filter((_: any, i: number) => i !== idx);
                        updateField("items", items);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Statement</label>
                    <textarea
                      rows={2}
                      value={item.statement || ""}
                      onChange={(e) => {
                        const items = [...formData.items];
                        items[idx].statement = e.target.value;
                        updateField("items", items);
                      }}
                      className={input}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Source Name</label>
                      <input
                        type="text"
                        value={item.sourceName || ""}
                        onChange={(e) => {
                          const items = [...formData.items];
                          items[idx].sourceName = e.target.value;
                          updateField("items", items);
                        }}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Source URL (required)</label>
                      <input
                        type="url"
                        value={item.sourceUrl || ""}
                        onChange={(e) => {
                          const items = [...formData.items];
                          items[idx].sourceUrl = e.target.value;
                          updateField("items", items);
                        }}
                        className={input}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section: Homepage How It Works */}
          {pageKey === "home.howItWorks" && (
            <div className={`${card} space-y-4`}>
              <h3 className="m-0 text-sm font-bold text-ink">4 Steps (Title, text & screenshot with alt text)</h3>
              {(formData.steps || []).map((step: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-line bg-subtle p-4 space-y-3">
                  <div className="font-bold text-xs text-primary">Step {idx + 1}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Step Title</label>
                      <input
                        type="text"
                        value={step.title || ""}
                        onChange={(e) => {
                          const steps = [...formData.steps];
                          steps[idx].title = e.target.value;
                          updateField("steps", steps);
                        }}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Description (1-line)</label>
                      <input
                        type="text"
                        value={step.description || ""}
                        onChange={(e) => {
                          const steps = [...formData.steps];
                          steps[idx].description = e.target.value;
                          updateField("steps", steps);
                        }}
                        className={input}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Screenshot URL</label>
                      <input
                        type="text"
                        value={step.screenshotUrl || ""}
                        onChange={(e) => {
                          const steps = [...formData.steps];
                          steps[idx].screenshotUrl = e.target.value;
                          updateField("steps", steps);
                        }}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Required Alt Text</label>
                      <input
                        type="text"
                        required
                        placeholder="Accurate description of what the screenshot depicts"
                        value={step.screenshotAlt || ""}
                        onChange={(e) => {
                          const steps = [...formData.steps];
                          steps[idx].screenshotAlt = e.target.value;
                          updateField("steps", steps);
                        }}
                        className={input}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section: Agency */}
          {pageKey === "home.agency" && (
            <div className={`${card} space-y-4`}>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Headline</label>
                <input
                  type="text"
                  value={formData.headline || ""}
                  onChange={(e) => updateField("headline", e.target.value)}
                  className={input}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Sub-text</label>
                <textarea
                  rows={2}
                  value={formData.subtext || ""}
                  onChange={(e) => updateField("subtext", e.target.value)}
                  className={input}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">3 Bullets</label>
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <input
                      key={i}
                      type="text"
                      placeholder={`Bullet #${i + 1}`}
                      value={(formData.bullets && formData.bullets[i]) || ""}
                      onChange={(e) => {
                        const bullets = [...(formData.bullets || ["", "", ""])];
                        bullets[i] = e.target.value;
                        updateField("bullets", bullets);
                      }}
                      className={input}
                    />
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Image URL</label>
                  <input
                    type="text"
                    value={formData.imageUrl || ""}
                    onChange={(e) => updateField("imageUrl", e.target.value)}
                    className={input}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Image Alt Text (Required)</label>
                  <input
                    type="text"
                    value={formData.imageAlt || ""}
                    onChange={(e) => updateField("imageAlt", e.target.value)}
                    className={input}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Overlay Comparison */}
          {pageKey === "home.overlayComparison" && (
            <div className={`${card} space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="m-0 text-sm font-bold text-ink">Comparison Table Rows</h3>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => {
                    const rows = [...(formData.rows || []), { label: "", overlayValue: "", everyVisitorValue: "" }];
                    updateField("rows", rows);
                  }}
                >
                  <Icon d={I.plus} size={14} /> Add row
                </button>
              </div>
              {(formData.rows || []).map((row: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-line bg-subtle p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted">Row #{idx + 1}</span>
                    <button
                      type="button"
                      className="text-xs text-crit hover:underline"
                      onClick={() => {
                        const rows = formData.rows.filter((_: any, i: number) => i !== idx);
                        updateField("rows", rows);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="Feature Label"
                      value={row.label || ""}
                      onChange={(e) => {
                        const rows = [...formData.rows];
                        rows[idx].label = e.target.value;
                        updateField("rows", rows);
                      }}
                      className={input}
                    />
                    <input
                      type="text"
                      placeholder="Overlay Value"
                      value={row.overlayValue || ""}
                      onChange={(e) => {
                        const rows = [...formData.rows];
                        rows[idx].overlayValue = e.target.value;
                        updateField("rows", rows);
                      }}
                      className={input}
                    />
                    <input
                      type="text"
                      placeholder="EveryVisitor Value"
                      value={row.everyVisitorValue || ""}
                      onChange={(e) => {
                        const rows = [...formData.rows];
                        rows[idx].everyVisitorValue = e.target.value;
                        updateField("rows", rows);
                      }}
                      className={input}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section: Pricing Copy */}
          {pageKey === "pricing.copy" && (
            <div className={`${card} space-y-4`}>
              <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-3 text-xs text-ptext">
                <strong>Notice:</strong> Plan prices, scan limits, and seat counts are read directly from <code>plans.ts</code> and Paddle.
                Only marketing descriptions and badges are edited here to guarantee billing consistency.
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Most Popular Badge Plan</label>
                <select
                  value={formData.mostPopularBadgePlan || "growth"}
                  onChange={(e) => updateField("mostPopularBadgePlan", e.target.value)}
                  className={input}
                >
                  <option value="store">Store</option>
                  <option value="growth">Growth</option>
                  <option value="agency">Agency</option>
                  <option value="agency_pro">Agency Pro</option>
                </select>
              </div>
              <div className="space-y-3">
                <span className="text-xs font-bold text-muted">Plan Descriptions</span>
                {["trial", "store", "growth", "agency", "agency_pro"].map((plan) => (
                  <div key={plan}>
                    <label className="mb-1 block text-xs font-medium capitalize text-ink">{plan}</label>
                    <input
                      type="text"
                      value={(formData.planDescriptions && formData.planDescriptions[plan]) || ""}
                      onChange={(e) => {
                        const desc = { ...(formData.planDescriptions || {}) };
                        desc[plan] = e.target.value;
                        updateField("planDescriptions", desc);
                      }}
                      className={input}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Legal Pages */}
          {isLegal && (
            <div className="space-y-6">
              <div className={`${card} space-y-4`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Document Title</label>
                    <input
                      type="text"
                      value={formData.title || ""}
                      onChange={(e) => updateField("title", e.target.value)}
                      className={input}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Effective Date (Legal)</label>
                    <input
                      type="date"
                      value={effectiveDate || formData.effectiveDate || ""}
                      onChange={(e) => {
                        setEffectiveDate(e.target.value);
                        updateField("effectiveDate", e.target.value);
                      }}
                      className={input}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Summary of Changes (Version Note)</label>
                  <input
                    type="text"
                    placeholder="e.g. Updated data processor clause following EU-US DPF adequacy decision."
                    value={formData.summaryOfChanges || ""}
                    onChange={(e) => updateField("summaryOfChanges", e.target.value)}
                    className={input}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Body (Markdown)</label>
                  <textarea
                    rows={18}
                    value={formData.bodyMd || ""}
                    onChange={(e) => updateField("bodyMd", e.target.value)}
                    className={`${input} font-mono text-xs`}
                  />
                </div>
              </div>

              {/* Customer Notice option for Terms, Privacy, Refunds */}
              {(pageKey === "legal.terms" || pageKey === "legal.privacy" || pageKey === "legal.refunds") && (
                <div className={`${card} border-ser/30 bg-ser-soft/30 space-y-3`}>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyCustomers}
                      onChange={(e) => setNotifyCustomers(e.target.checked)}
                      className="size-4 rounded text-ser focus:ring-ser"
                    />
                    <span>Email all customers about this legal change</span>
                  </label>
                  <p className="text-xs text-muted m-0">
                    Mandatory for material changes to Terms of Service, Privacy Policy, or Refunds. Sends a concise notice
                    summary with a link to the new version.
                  </p>
                  {notifyCustomers && (
                    <div className="pt-2">
                      <label className="mb-1 block text-xs font-semibold text-muted">Email Notice Summary</label>
                      <textarea
                        rows={3}
                        placeholder="Provide a plain-English explanation of what changed in this version..."
                        value={noticeSummary}
                        onChange={(e) => setNoticeSummary(e.target.value)}
                        className={input}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: General fallback for FAQ, Footer, etc */}
          {!["home.hero", "home.facts", "home.howItWorks", "home.agency", "home.overlayComparison", "pricing.copy"].includes(pageKey) && !isLegal && (
            <div className={`${card} space-y-4`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Structured Content Fields</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => setJsonMode(true)}
                >
                  Switch to JSON editor
                </button>
              </div>
              <textarea
                rows={16}
                value={rawJson}
                onChange={(e) => {
                  setRawJson(e.target.value);
                  try {
                    setFormData(JSON.parse(e.target.value));
                  } catch {}
                }}
                className={`${input} font-mono text-xs`}
              />
            </div>
          )}
        </div>
      )}
    </StaffShell>
  );
}
