"use client";

import React, { useEffect, useState } from "react";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { apiClient, ApiException } from "@/lib/api";

export interface VerifySiteDialogProps {
  open: boolean;
  orgSlug: string;
  onClose: () => void;
  site: {
    id: string;
    name: string;
    rootUrl: string;
    platform?: string;
  };
  onVerified?: () => void;
}

type VerifyTab = "meta" | "dns" | "file";

type HelpPlatform = "custom" | "shopify" | "wordpress" | "builder";

const HELP_LABEL: Record<HelpPlatform, string> = {
  custom: "Custom code",
  shopify: "Shopify",
  wordpress: "WordPress",
  builder: "Wix, Webflow, Squarespace",
};

function helpPlatformFor(platform?: string): HelpPlatform {
  if (platform === "shopify") return "shopify";
  if (platform === "wordpress" || platform === "woocommerce") return "wordpress";
  if (platform === "wix" || platform === "webflow" || platform === "squarespace") return "builder";
  return "custom";
}

const codeStyle = { background: "var(--bgs, #F4F1EC)", padding: "1px 5px", borderRadius: "4px" } as const;

/** Where to put the tag or file on each kind of site (spec 4.4). The site's own platform comes first. */
function PlatformHelp({ method, platform, token }: { method: "meta" | "file"; platform?: string; token: string }) {
  const own = helpPlatformFor(platform);
  const order: HelpPlatform[] = [own, ...(["custom", "shopify", "wordpress", "builder"] as const).filter((p) => p !== own)];
  const [active, setActive] = useState<HelpPlatform>(own);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const idBase = `verify-help-${method}`;

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length]!;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const body: Record<HelpPlatform, React.ReactNode> =
    method === "meta"
      ? {
          custom: (
            <>
              <p style={{ margin: 0 }}>
                Add this tag inside the <code style={codeStyle}>&lt;head&gt;</code> of your home page. In React/Next.js,
                add it to your root layout or <code style={codeStyle}>&lt;Head&gt;</code>; in plain HTML, add it to{" "}
                <code style={codeStyle}>index.html</code>.
              </p>
              <p style={{ margin: "6px 0 0" }}>
                Next.js App Router, in <code style={codeStyle}>app/layout.tsx</code>:{" "}
                <code style={codeStyle}>{`export const metadata = { other: { "everyvisitor-verify": "${token}" } };`}</code>
              </p>
            </>
          ),
          shopify: (
            <p style={{ margin: 0 }}>
              In Shopify admin: Online Store → Themes → Edit code → <code style={codeStyle}>layout/theme.liquid</code>, just
              before <code style={codeStyle}>&lt;/head&gt;</code>.
            </p>
          ),
          wordpress: (
            <p style={{ margin: 0 }}>
              Use a header code plugin such as WPCode, or add it to your theme&apos;s{" "}
              <code style={codeStyle}>header.php</code> just before <code style={codeStyle}>&lt;/head&gt;</code>.
            </p>
          ),
          builder: (
            <p style={{ margin: 0 }}>
              Wix: Settings → Custom code → Head. Webflow: Site settings → Custom code → Head code. Squarespace: Settings
              → Advanced → Code injection → Header.
            </p>
          ),
        }
      : {
          custom: (
            <p style={{ margin: 0 }}>
              Upload <code style={codeStyle}>everyvisitor-verify.txt</code> to <code style={codeStyle}>/.well-known/</code> on
              your web server or in your project&apos;s <code style={codeStyle}>public/</code> folder (so the file is at{" "}
              <code style={codeStyle}>public/.well-known/everyvisitor-verify.txt</code>).
            </p>
          ),
          shopify: (
            <p style={{ margin: 0 }}>
              Shopify can&apos;t serve files from <code style={codeStyle}>/.well-known/</code>. Use the meta tag or DNS method instead.
            </p>
          ),
          wordpress: (
            <p style={{ margin: 0 }}>
              Upload the file with your host&apos;s file manager or SFTP into a <code style={codeStyle}>.well-known</code> folder in
              the WordPress root (next to <code style={codeStyle}>wp-config.php</code>).
            </p>
          ),
          builder: (
            <p style={{ margin: 0 }}>
              Most website builders can&apos;t serve files from this path. Use the meta tag or DNS method instead.
            </p>
          ),
        };

  return (
    <div
      style={{
        fontSize: "12px",
        color: "var(--muted, #476788)",
        background: "var(--bgs, #F4F1EC)",
        padding: "10px 12px",
        borderRadius: "6px",
        lineHeight: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div role="tablist" aria-label="Instructions for your platform" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {order.map((p, i) => (
          <button
            key={p}
            ref={(el) => {
              tabRefs.current[p] = el;
            }}
            id={`${idBase}-tab-${p}`}
            type="button"
            role="tab"
            aria-selected={active === p}
            aria-controls={`${idBase}-panel`}
            tabIndex={active === p ? 0 : -1}
            onClick={() => setActive(p)}
            onKeyDown={(e) => onKeyDown(e, i)}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "999px",
              border: "1px solid var(--border, #EDE5DB)",
              background: active === p ? "var(--primary, #2545FF)" : "var(--bg, #FFFFFF)",
              color: active === p ? "var(--onp, #FFFFFF)" : "var(--text, #0C1754)",
              cursor: "pointer",
            }}
          >
            {HELP_LABEL[p]}
          </button>
        ))}
      </div>
      <div id={`${idBase}-panel`} role="tabpanel" aria-labelledby={`${idBase}-tab-${active}`}>
        {body[active]}
      </div>
    </div>
  );
}


export function VerifySiteDialog({
  open,
  orgSlug,
  onClose,
  site,
  onVerified,
}: VerifySiteDialogProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<VerifyTab>("meta");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // The token is per site and only the API knows it (spec 6.9).
  useEffect(() => {
    if (!open) return;
    apiClient<{ verifyToken: string; status: string }>(
      `/v1/orgs/${orgSlug}/sites/${site.id}/verification`,
    )
      .then((res) => {
        setToken(res.verifyToken);
        if (res.status !== "pending_verification") setVerifiedSuccess(true);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiException ? err.message : "Could not load your verification token."),
      );
  }, [open, orgSlug, site.id]);

  const dialogRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  if (!token && !error) {
    return (
      <div role="status" className="fixed inset-0 z-[1000] grid place-items-center bg-scrim text-sm text-on-primary">
        Loading verification details…
      </div>
    );
  }
  const verifyToken = token ?? "";
  const metaSnippet = `<meta name="everyvisitor-verify" content="${verifyToken}">`;
  // The full name matters for subdomain sites: a bare "_everyvisitor" lands on
  // the zone apex, which the backend does not check for shop.example.com.
  const siteHost = new URL(site.rootUrl).hostname.replace(/^www\./, "");
  const dnsHost = `_everyvisitor.${siteHost}`;
  const dnsValue = `everyvisitor-verify=${verifyToken}`;
  const filePath = "/.well-known/everyvisitor-verify.txt";
  const fileUrl = `${site.rootUrl}${filePath}`;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      showToast("Copied to clipboard", { type: "success" });
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      showToast("Failed to copy", { type: "error" });
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);
    try {
      await apiClient(`/v1/orgs/${orgSlug}/sites/${site.id}/verify`, {
        method: "POST",
        body: JSON.stringify({ method: activeTab }),
      });
      setVerifiedSuccess(true);
      showToast("Site ownership verified!", { type: "success" });
      if (onVerified) onVerified();
    } catch (err) {
      setError(
        err instanceof ApiException
          ? err.message
          : `Verification check failed for ${activeTab}. Please ensure the change is saved and public.`,
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--scrim, rgba(12,23,84,0.45))",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-dialog-title"
        style={{
          background: "var(--bg, #FFFFFF)",
          color: "var(--text, #0C1754)",
          width: "100%",
          maxWidth: "600px",
          borderRadius: "16px",
          border: "1px solid var(--border, #EDE5DB)",
          boxShadow: "var(--sh3, 0 20px 40px rgba(12,23,84,0.18))",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border, #EDE5DB)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              id="verify-dialog-title"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                lineHeight: "24px",
                margin: 0,
              }}
            >
              Verify Site Ownership
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--muted, #476788)",
                margin: "4px 0 0",
              }}
            >
              Confirm you own or manage{" "}
              <strong style={{ color: "var(--text, #0C1754)" }}>
                {site.name}
              </strong>{" "}
              ({site.rootUrl}) to unlock automated monitoring.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              color: "var(--muted, #476788)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon d={I.close} size={18} />
          </button>
        </div>

        {/* Success View */}
        {verifiedSuccess ? (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "var(--okS, #ECFDF3)",
                color: "var(--ok, #067647)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <Icon d={I.check} size={28} />
            </div>
            <h3
              style={{
                fontSize: "20px",
                fontWeight: 700,
                margin: "0 0 8px",
                color: "var(--ok, #067647)",
              }}
            >
              Site Ownership Verified!
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "var(--muted, #476788)",
                maxWidth: "420px",
                margin: "0 auto 24px",
                lineHeight: "22px",
              }}
            >
              {site.name} is now active. Weekly automated scans, regression
              alerts, and multi-page audits are now enabled.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--primary, #2545FF)",
                color: "var(--onp, #FFFFFF)",
                border: "none",
                borderRadius: "8px",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Continue to Site Overview
            </button>
          </div>
        ) : (
          /* Form Content */
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {error && (
              <div
                role="alert"
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: "var(--critS, #FEF3F2)",
                  color: "var(--crit, #B42318)",
                  border: "1px solid rgba(180,35,24,0.2)",
                  fontSize: "13px",
                  lineHeight: "18px",
                }}
              >
                <strong>Verification failed:</strong> {error}
              </div>
            )}

            {/* Method Tabs */}
            <div
              role="tablist"
              aria-label="Verification method"
              style={{
                display: "flex",
                background: "var(--bgs, #F4F1EC)",
                borderRadius: "8px",
                padding: "4px",
                gap: "4px",
              }}
            >
              {(
                [
                  { id: "meta", label: "HTML Meta Tag (Fastest)" },
                  { id: "dns", label: "DNS TXT Record" },
                  { id: "file", label: "File Upload" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: activeTab === tab.id ? 600 : 500,
                    border: "none",
                    borderRadius: "6px",
                    background: activeTab === tab.id ? "var(--bg, #FFFFFF)" : "transparent",
                    color: activeTab === tab.id ? "var(--primary, #2545FF)" : "var(--muted, #476788)",
                    boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Meta Tag */}
            {activeTab === "meta" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "13px", color: "var(--muted, #476788)", margin: 0 }}>
                  Add this meta tag inside the{" "}
                  <code style={{ background: "var(--bgs, #F4F1EC)", padding: "2px 6px", borderRadius: "4px" }}>
                    &lt;head&gt;
                  </code>{" "}
                  section of your homepage HTML:
                </p>

                <div
                  style={{
                    position: "relative",
                    background: "var(--sunk, #EEEAE3)",
                    border: "1px solid var(--border, #EDE5DB)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "12px",
                    lineHeight: "18px",
                    wordBreak: "break-all",
                  }}
                >
                  <code>{metaSnippet}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(metaSnippet, "meta")}
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "8px",
                      background: "var(--bg, #FFFFFF)",
                      border: "1px solid var(--border, #EDE5DB)",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      color: copiedField === "meta" ? "var(--ok, #067647)" : "var(--text, #0C1754)",
                    }}
                  >
                    <Icon d={copiedField === "meta" ? I.check : I.copy} size={12} />
                    {copiedField === "meta" ? "Copied" : "Copy"}
                  </button>
                </div>

                <PlatformHelp method="meta" platform={site.platform} token={verifyToken} />
              </div>
            )}

            {/* Tab 2: DNS TXT Record */}
            {activeTab === "dns" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "13px", color: "var(--muted, #476788)", margin: 0 }}>
                  Add a <strong>TXT</strong> record with your domain host (Cloudflare, GoDaddy, Namecheap, etc.):
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>
                  <div
                    style={{
                      background: "var(--sunk, #EEEAE3)",
                      border: "1px solid var(--border, #EDE5DB)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--muted, #476788)", display: "block" }}>
                      Record Name / Host
                    </span>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                      <code style={{ fontSize: "12px", fontWeight: 600 }}>{dnsHost}</code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(dnsHost, "host")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: copiedField === "host" ? "var(--ok, #067647)" : "var(--primary, #2545FF)",
                        }}
                      >
                        <Icon d={copiedField === "host" ? I.check : I.copy} size={12} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--sunk, #EEEAE3)",
                      border: "1px solid var(--border, #EDE5DB)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--muted, #476788)", display: "block" }}>
                      Value / Target
                    </span>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                      <code style={{ fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {dnsValue}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(dnsValue, "dnsval")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: copiedField === "dnsval" ? "var(--ok, #067647)" : "var(--primary, #2545FF)",
                        }}
                      >
                        <Icon d={copiedField === "dnsval" ? I.check : I.copy} size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--muted, #476788)",
                    background: "var(--bgs, #F4F1EC)",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    lineHeight: "16px",
                  }}
                >
                  <strong>Note:</strong> If your DNS host adds your domain automatically, enter only the part before it
                  (for example <code>_everyvisitor</code> or <code>_everyvisitor.shop</code>). DNS changes typically take 1–3 minutes to
                  propagate, but may take longer depending on TTL.
                </div>
              </div>
            )}

            {/* Tab 3: File Upload */}
            {activeTab === "file" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "13px", color: "var(--muted, #476788)", margin: 0 }}>
                  Upload a plain text file at this exact location:
                </p>

                <div
                  style={{
                    background: "var(--sunk, #EEEAE3)",
                    border: "1px solid var(--border, #EDE5DB)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "12px", fontFamily: "monospace", textDecoration: "underline" }}
                  >
                    {filePath}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(filePath, "fileUrl")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: copiedField === "fileUrl" ? "var(--ok, #067647)" : "var(--primary, #2545FF)",
                    }}
                  >
                    <Icon d={copiedField === "fileUrl" ? I.check : I.copy} size={14} />
                  </button>
                </div>

                <div>
                  <span style={{ fontSize: "12px", color: "var(--muted, #476788)", display: "block", marginBottom: "4px" }}>
                    File content (plain text only):
                  </span>
                  <div
                    style={{
                      background: "var(--sunk, #EEEAE3)",
                      border: "1px solid var(--border, #EDE5DB)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <code style={{ fontSize: "12px" }}>{verifyToken}</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(verifyToken, "token")}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: copiedField === "token" ? "var(--ok, #067647)" : "var(--primary, #2545FF)",
                      }}
                    >
                      <Icon d={copiedField === "token" ? I.check : I.copy} size={14} />
                    </button>
                  </div>
                </div>

                <PlatformHelp method="file" platform={site.platform} token={verifyToken} />
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "10px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border, #EDE5DB)",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={verifying}
                style={{
                  background: "var(--bg, #FFFFFF)",
                  color: "var(--text, #0C1754)",
                  border: "1px solid var(--border, #EDE5DB)",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Verify Later
              </button>

              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                style={{
                  background: "var(--primary, #2545FF)",
                  color: "var(--onp, #FFFFFF)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: verifying ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: verifying ? 0.75 : 1,
                }}
              >
                {verifying && <span className="animate-spin">⏳</span>}
                {verifying ? "Checking..." : "Verify Ownership"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
