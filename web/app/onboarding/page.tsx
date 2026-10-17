"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { VerifySiteDialog } from "@/components/sites/verify-site-dialog";

interface OnboardingState {
  step: 1 | 2 | 3 | 4;
  orgName: string;
  orgType: "agency" | "store";
  siteName: string;
  siteUrl: string;
  platform: string;
  clientName: string;
  scanProgress: number; // 0 to 10
  scanScore: number;
}

const STORAGE_KEY = "plainsight_onboarding_v1";

const EDUCATIONAL_SLIDES = [
  {
    title: "WCAG 2.2 AA Standards",
    desc: "Plainsight checks your pages against the newest WCAG 2.2 standard, identifying contrast failures, keyboard traps, and focus indicator defects.",
    icon: I.audit,
  },
  {
    title: "Element Fingerprinting",
    desc: "Issues that occur across 50 template pages are grouped into a single unified task, so your team doesn't drown in duplicate alerts.",
    icon: I.globe,
  },
  {
    title: "Automated vs Manual Checking",
    desc: "Automated testing catches 30–50% of WCAG defects instantly. Plainsight highlights what requires manual human review.",
    icon: I.check,
  },
  {
    title: "Real Browser Execution",
    desc: "We run axe-core 4.14 inside headless Chromium, checking rendered DOM after client-side scripts, animations, and hydrate cycles.",
    icon: I.settings,
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [state, setState] = useState<OnboardingState>({
    step: 1,
    orgName: "",
    orgType: "agency",
    siteName: "",
    siteUrl: "",
    platform: "unknown",
    clientName: "",
    scanProgress: 0,
    scanScore: 78,
  });

  const [detectingPlatform, setDetectingPlatform] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [createdSiteId, setCreatedSiteId] = useState<string>("site-onboarding-1");

  // Load resumable state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  // Save state updates
  const updateState = (updates: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore write errors
      }
      return next;
    });
  };

  // Carousel timer for educational slides during scan
  useEffect(() => {
    if (state.step !== 3) return;
    const interval = setInterval(() => {
      setActiveSlide((curr) => (curr + 1) % EDUCATIONAL_SLIDES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [state.step]);

  // Scan simulation progress timer
  useEffect(() => {
    if (state.step !== 3) return;

    if (state.scanProgress >= 10) {
      const timer = setTimeout(() => {
        updateState({ step: 4 });
      }, 800);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      updateState({ scanProgress: state.scanProgress + 1 });
    }, 1100);

    return () => clearTimeout(timer);
  }, [state.step, state.scanProgress]);

  // Handle URL blur & platform detection
  const handleUrlBlur = async () => {
    let clean = state.siteUrl.trim();
    if (!clean) return;

    if (!/^https?:\/\//i.test(clean)) {
      clean = "https://" + clean;
      updateState({ siteUrl: clean });
    }

    try {
      const parsed = new URL(clean);
      const host = parsed.hostname.replace(/^www\./i, "");
      const baseName = host.split(".")[0];
      const defaultName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

      if (!state.siteName) {
        updateState({ siteName: defaultName });
      }

      setDetectingPlatform(true);
      const res = await fetch("/api/sites/detect-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clean }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.data?.platform) {
          updateState({ platform: data.data.platform });
        }
      }
    } catch {
      // If endpoint isn't available, check heuristics
      if (clean.includes("myshopify") || clean.includes("shopify")) {
        updateState({ platform: "shopify" });
      } else if (clean.includes("wp-") || clean.includes("wordpress")) {
        updateState({ platform: "wordpress" });
      }
    } finally {
      setDetectingPlatform(false);
    }
  };

  const handleFinishOnboarding = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    router.push("/sites");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page, #F9F8F6)",
        color: "var(--text, #0C1754)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: "64px",
          borderBottom: "1px solid var(--border, #EDE5DB)",
          background: "var(--bg, #FFFFFF)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "var(--primary, #2545FF)",
              display: "grid",
              placeItems: "center",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: "14px",
            }}
          >
            P
          </div>
          <span
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Plainsight
          </span>
        </div>

        {/* Stepper Indicator */}
        <nav
          aria-label="Onboarding Progress"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          {[1, 2, 3, 4].map((stepNum) => {
            const isCompleted = state.step > stepNum;
            const isCurrent = state.step === stepNum;
            return (
              <div
                key={stepNum}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    fontSize: "12px",
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                    background: isCurrent
                      ? "var(--primary, #2545FF)"
                      : isCompleted
                      ? "var(--ok, #067647)"
                      : "var(--bgs, #F4F1EC)",
                    color: isCurrent || isCompleted ? "#FFFFFF" : "var(--muted, #476788)",
                  }}
                >
                  {isCompleted ? <Icon d={I.check} size={14} /> : stepNum}
                </div>
                {stepNum < 4 && (
                  <div
                    style={{
                      width: "32px",
                      height: "2px",
                      background: isCompleted
                        ? "var(--ok, #067647)"
                        : "var(--border, #EDE5DB)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* Skip Link */}
        <Link
          href="/sites"
          style={{
            fontSize: "13px",
            color: "var(--muted, #476788)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Skip setup
        </Link>
      </header>

      {/* Main Form Container */}
      <main
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "40px 16px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "580px",
            background: "var(--bg, #FFFFFF)",
            border: "1px solid var(--border, #EDE5DB)",
            borderRadius: "16px",
            boxShadow: "var(--shc, 0 10px 20px rgba(12,23,84,0.05))",
            padding: "36px 32px",
          }}
        >
          {/* STEP 1: Organization Details */}
          {state.step === 1 && (
            <div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--primary, #2545FF)",
                }}
              >
                Step 1 of 4
              </span>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  margin: "8px 0 12px",
                  letterSpacing: "-0.02em",
                }}
              >
                Name your workspace
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--muted, #476788)",
                  margin: "0 0 28px",
                  lineHeight: "22px",
                }}
              >
                Welcome to Plainsight. Let&apos;s configure your organization settings and tailor your dashboard.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!state.orgName.trim()) return;
                  updateState({ step: 2 });
                }}
              >
                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="org-name"
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "6px",
                    }}
                  >
                    Organisation Name
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    placeholder="e.g. Brightline Studio or Acme Goods"
                    value={state.orgName}
                    onChange={(e) => updateState({ orgName: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border, #EDE5DB)",
                      background: "var(--bg, #FFFFFF)",
                      color: "var(--text, #0C1754)",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "28px" }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "10px",
                    }}
                  >
                    How do you plan to use Plainsight?
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    {/* Agency Card */}
                    <button
                      type="button"
                      onClick={() => updateState({ orgType: "agency" })}
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border:
                          state.orgType === "agency"
                            ? "2px solid var(--primary, #2545FF)"
                            : "1px solid var(--border, #EDE5DB)",
                        background:
                          state.orgType === "agency"
                            ? "var(--psoft, #EAEBF8)"
                            : "var(--bg, #FFFFFF)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          marginBottom: "4px",
                          color:
                            state.orgType === "agency"
                              ? "var(--primary, #2545FF)"
                              : "var(--text, #0C1754)",
                        }}
                      >
                        Agency / Studio
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--muted, #476788)",
                          margin: 0,
                          lineHeight: "16px",
                        }}
                      >
                        We build & manage stores for clients. Shows client name fields & worst-first sorting.
                      </p>
                    </button>

                    {/* Store Card */}
                    <button
                      type="button"
                      onClick={() => updateState({ orgType: "store" })}
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border:
                          state.orgType === "store"
                            ? "2px solid var(--primary, #2545FF)"
                            : "1px solid var(--border, #EDE5DB)",
                        background:
                          state.orgType === "store"
                            ? "var(--psoft, #EAEBF8)"
                            : "var(--bg, #FFFFFF)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          marginBottom: "4px",
                          color:
                            state.orgType === "store"
                              ? "var(--primary, #2545FF)"
                              : "var(--text, #0C1754)",
                        }}
                      >
                        Merchant / Store
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--muted, #476788)",
                          margin: 0,
                          lineHeight: "16px",
                        }}
                      >
                        We manage our own brand. Streamlined view focused on our own site&apos;s compliance.
                      </p>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!state.orgName.trim()}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--primary, #2545FF)",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: state.orgName.trim() ? "pointer" : "not-allowed",
                    opacity: state.orgName.trim() ? 1 : 0.6,
                  }}
                >
                  Continue to Add Site →
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: Add First Site */}
          {state.step === 2 && (
            <div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--primary, #2545FF)",
                }}
              >
                Step 2 of 4
              </span>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  margin: "8px 0 12px",
                  letterSpacing: "-0.02em",
                }}
              >
                Add your first website
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--muted, #476788)",
                  margin: "0 0 24px",
                  lineHeight: "22px",
                }}
              >
                Enter your site URL. We will detect your ecommerce platform and prepare a fast 10-page initial scan.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!state.siteUrl.trim()) return;
                  setCreatedSiteId("site-" + Math.random().toString(36).substring(2, 9));
                  updateState({ step: 3, scanProgress: 0 });
                }}
              >
                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="site-url"
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "6px",
                    }}
                  >
                    Website URL
                  </label>
                  <input
                    id="site-url"
                    type="text"
                    required
                    placeholder="https://example.com"
                    value={state.siteUrl}
                    onChange={(e) => updateState({ siteUrl: e.target.value })}
                    onBlur={handleUrlBlur}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border, #EDE5DB)",
                      background: "var(--bg, #FFFFFF)",
                      color: "var(--text, #0C1754)",
                      fontSize: "14px",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--muted, #476788)",
                      marginTop: "4px",
                      display: "block",
                    }}
                  >
                    Subpaths and tracking parameters are automatically normalized to apex domain.
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 0.8fr",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <label
                      htmlFor="site-name"
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        marginBottom: "6px",
                      }}
                    >
                      Site Name
                    </label>
                    <input
                      id="site-name"
                      type="text"
                      required
                      placeholder="e.g. Oakhaus Store"
                      value={state.siteName}
                      onChange={(e) => updateState({ siteName: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border, #EDE5DB)",
                        background: "var(--bg, #FFFFFF)",
                        color: "var(--text, #0C1754)",
                        fontSize: "14px",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="site-platform"
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        marginBottom: "6px",
                      }}
                    >
                      Platform {detectingPlatform && <span style={{ fontSize: "11px", color: "var(--primary)" }}>Detecting...</span>}
                    </label>
                    <select
                      id="site-platform"
                      value={state.platform}
                      onChange={(e) => updateState({ platform: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border, #EDE5DB)",
                        background: "var(--bg, #FFFFFF)",
                        color: "var(--text, #0C1754)",
                        fontSize: "14px",
                      }}
                    >
                      <option value="shopify">Shopify</option>
                      <option value="wordpress">WordPress</option>
                      <option value="woocommerce">WooCommerce</option>
                      <option value="webflow">Webflow</option>
                      <option value="squarespace">Squarespace</option>
                      <option value="wix">Wix</option>
                      <option value="custom">Custom / Other</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                </div>

                {/* Client Name Field for Agency Mode */}
                {state.orgType === "agency" && (
                  <div style={{ marginBottom: "24px" }}>
                    <label
                      htmlFor="client-name"
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        marginBottom: "6px",
                      }}
                    >
                      Client Name (Optional)
                    </label>
                    <input
                      id="client-name"
                      type="text"
                      placeholder="e.g. Mark Otieno"
                      value={state.clientName}
                      onChange={(e) => updateState({ clientName: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border, #EDE5DB)",
                        background: "var(--bg, #FFFFFF)",
                        color: "var(--text, #0C1754)",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
                  <button
                    type="button"
                    onClick={() => updateState({ step: 1 })}
                    style={{
                      flex: "0 0 100px",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border, #EDE5DB)",
                      background: "var(--bg, #FFFFFF)",
                      color: "var(--text, #0C1754)",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!state.siteUrl.trim()}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: "8px",
                      border: "none",
                      background: "var(--primary, #2545FF)",
                      color: "#FFFFFF",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: state.siteUrl.trim() ? "pointer" : "not-allowed",
                      opacity: state.siteUrl.trim() ? 1 : 0.6,
                    }}
                  >
                    Start 10-Page Scan →
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: Live 10-Page Onboarding Scan */}
          {state.step === 3 && (
            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--primary, #2545FF)",
                }}
              >
                Step 3 of 4 · Scanning
              </span>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  margin: "8px 0 12px",
                  letterSpacing: "-0.02em",
                }}
              >
                Analyzing {state.siteName || "your website"}
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--muted, #476788)",
                  margin: "0 0 24px",
                }}
              >
                Running initial 10-page accessibility evaluation with axe-core 4.14.0. Typical time: under 90 seconds.
              </p>

              {/* Progress Ring / Bar */}
              <div
                style={{
                  background: "var(--bgs, #F4F1EC)",
                  borderRadius: "12px",
                  padding: "20px",
                  marginBottom: "28px",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  <span>Pages Scanned</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {state.scanProgress} of 10 pages
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "var(--border, #EDE5DB)",
                    borderRadius: "100px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(state.scanProgress / 10) * 100}%`,
                      background: "var(--primary, #2545FF)",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--muted, #476788)",
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--primary)" }} />
                  {state.scanProgress < 3 && `Discovering sitemap & links on ${state.siteUrl}...`}
                  {state.scanProgress >= 3 && state.scanProgress < 7 && `Testing template pages & contrast ratios...`}
                  {state.scanProgress >= 7 && state.scanProgress < 10 && `Grouping occurrences into unique issue fingerprints...`}
                  {state.scanProgress >= 10 && `Computing final score & report...`}
                </div>
              </div>

              {/* Educational Carousel Cards */}
              <div
                style={{
                  background: "var(--bg, #FFFFFF)",
                  border: "1px solid var(--border, #EDE5DB)",
                  borderRadius: "12px",
                  padding: "20px",
                  textAlign: "left",
                  minHeight: "130px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "6px",
                      background: "var(--psoft, #EAEBF8)",
                      color: "var(--primary, #2545FF)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon d={EDUCATIONAL_SLIDES[activeSlide].icon} size={16} />
                  </div>
                  <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>
                    {EDUCATIONAL_SLIDES[activeSlide].title}
                  </h4>
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--muted, #476788)",
                    margin: 0,
                    lineHeight: "18px",
                  }}
                >
                  {EDUCATIONAL_SLIDES[activeSlide].desc}
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: First Scan Results & Verification Prompt */}
          {state.step === 4 && (
            <div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ok, #067647)",
                }}
              >
                Scan Complete
              </span>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  margin: "8px 0 12px",
                  letterSpacing: "-0.02em",
                }}
              >
                Initial results for {state.siteName}
              </h1>

              {/* Score Display Card */}
              <div
                style={{
                  background: "var(--bgs, #F4F1EC)",
                  borderRadius: "12px",
                  padding: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <span style={{ fontSize: "12px", color: "var(--muted, #476788)", display: "block" }}>
                    Accessibility Score
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
                    <span
                      style={{
                        fontSize: "36px",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--mod, #8A6100)",
                      }}
                    >
                      {state.scanScore}
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--mod, #8A6100)" }}>
                      / 100 · Needs work
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", textAlign: "right" }}>
                  <div>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--crit, #B42318)" }}>
                      2
                    </span>
                    <span style={{ display: "block", fontSize: "11px", color: "var(--muted, #476788)" }}>
                      Critical
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--ser, #B54708)" }}>
                      5
                    </span>
                    <span style={{ display: "block", fontSize: "11px", color: "var(--muted, #476788)" }}>
                      Serious
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--mod, #8A6100)" }}>
                      7
                    </span>
                    <span style={{ display: "block", fontSize: "11px", color: "var(--muted, #476788)" }}>
                      Moderate
                    </span>
                  </div>
                </div>
              </div>

              {/* Verification Callout Box */}
              <div
                style={{
                  border: "1px solid var(--border, #EDE5DB)",
                  borderRadius: "12px",
                  padding: "18px 20px",
                  background: "var(--bg, #FFFFFF)",
                  marginBottom: "24px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      background: "var(--psoft, #EAEBF8)",
                      color: "var(--primary, #2545FF)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon d={I.check} size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700 }}>
                      Verify Ownership to Enable Continuous Monitoring
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        color: "var(--muted, #476788)",
                        lineHeight: "18px",
                      }}
                    >
                      You have completed your 1 free unverified onboarding scan. Verify ownership via Meta tag, DNS, or file upload to unlock weekly scheduled scans and regression alerts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setVerifyDialogOpen(true)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--primary, #2545FF)",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Verify Ownership Now
                </button>

                <button
                  type="button"
                  onClick={handleFinishOnboarding}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border, #EDE5DB)",
                    background: "var(--bg, #FFFFFF)",
                    color: "var(--text, #0C1754)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Go to Site Workspace
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* S-23 Verification Dialog */}
      <VerifySiteDialog
        open={verifyDialogOpen}
        onClose={() => setVerifyDialogOpen(false)}
        site={{
          id: createdSiteId,
          name: state.siteName || "My Site",
          rootUrl: state.siteUrl || "https://example.com",
          verifyToken: "ps_onboarding_token_" + createdSiteId,
          platform: state.platform,
          status: "pending_verification",
        }}
        onVerified={() => {
          setVerifyDialogOpen(false);
          handleFinishOnboarding();
        }}
      />
    </div>
  );
}
