"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { ApiException } from "@/lib/api";
import { orgSettingsApi, type CustomDomainStatus } from "@/lib/admin-api";

const secondary =
  "ease-ui inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50";
const primary =
  "ease-ui inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50";

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="m-0 mt-0.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-subtle px-2 py-1 font-mono text-xs">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          aria-label={`Copy ${label}`}
          className="grid size-8 flex-none place-items-center rounded-full border border-line bg-surface text-muted hover:text-ink"
        >
          <Icon d={copied ? I.check : I.copy} size={14} />
        </button>
      </dd>
    </div>
  );
}

/**
 * S-43 custom portal domain (Agency Pro, owners; P6-07): set the domain, add two DNS records,
 * verify. Lives inside the branding form, so every button is type="button".
 */
export function CustomDomainCard({
  slug,
  plan,
  onDomainChange,
}: {
  slug: string | null;
  plan: string;
  onDomainChange?: (domain: string | null) => void;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<CustomDomainStatus | null>(null);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ cname: boolean; txt: boolean } | null>(null);
  const [busy, setBusy] = useState<"save" | "verify" | "remove" | null>(null);
  const allowed = plan === "agency_pro";

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const s = await orgSettingsApi.customDomain(slug);
      setStatus(s);
      onDomainChange?.(s.domain);
    } catch {
      setStatus(null);
    }
  }, [slug, onDomainChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!slug) return;
    setBusy("save");
    setError(null);
    setCheck(null);
    try {
      const s = await orgSettingsApi.setCustomDomain(slug, domain);
      setStatus({ ...s, verifiedAt: null });
      onDomainChange?.(s.domain);
      setDomain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That domain could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (!slug) return;
    setBusy("verify");
    setError(null);
    try {
      await orgSettingsApi.verifyCustomDomain(slug);
      setCheck(null);
      showToast("Domain verified. Your certificate is issued on the first visit, which can take a minute.");
      await load();
    } catch (err) {
      if (err instanceof ApiException && err.code === "DOMAIN_NOT_VERIFIED") {
        setCheck({ cname: Boolean(err.details.cname), txt: Boolean(err.details.txt) });
      }
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!slug || !status?.domain) return;
    if (!window.confirm(`Stop using ${status.domain}? Clients who bookmarked it will need the standard portal link.`)) return;
    setBusy("remove");
    try {
      await orgSettingsApi.removeCustomDomain(slug);
      showToast("Custom domain removed.");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const badge = !status?.domain
    ? { text: "Agency Pro", cls: "bg-subtle text-muted" }
    : status.status === "verified"
      ? { text: "Verified", cls: "bg-ok-soft text-ok" }
      : { text: "Waiting for DNS", cls: "bg-ser-soft text-ser" };

  return (
    <section aria-labelledby="custom-domain-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="custom-domain-title" className="m-0 text-base font-semibold text-ink">
          Custom portal domain
        </h2>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span>
      </div>

      {!allowed ? (
        <p className="m-0 text-sm text-muted">
          Serve the client portal from your own domain, such as reports.youragency.com, on Agency Pro.{" "}
          <Link href="/settings/billing">See plans</Link>
        </p>
      ) : (
        <>
          {status?.domain && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-sm text-ink">
                {status.status === "verified" ? (
                  <>
                    Your portal is live at{" "}
                    <a href={`https://${status.domain}`} target="_blank" rel="noreferrer" className="font-semibold">
                      https://{status.domain}
                    </a>
                    .
                  </>
                ) : (
                  <>
                    Add these two records at your DNS provider for <strong>{status.domain}</strong>, then check them.
                    Changes usually appear within an hour.
                  </>
                )}
              </p>
              {status.records && status.status !== "verified" && (
                <dl className="m-0 grid gap-3 rounded-xl border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[5rem_1fr_1fr]">
                    <span className="text-xs font-bold">
                      CNAME {check && <span className={check.cname ? "text-ok" : "text-crit"}>{check.cname ? "found" : "missing"}</span>}
                    </span>
                    <CopyValue label="CNAME name" value={status.records.cname.host} />
                    <CopyValue label="CNAME target" value={status.records.cname.value} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[5rem_1fr_1fr]">
                    <span className="text-xs font-bold">
                      TXT {check && <span className={check.txt ? "text-ok" : "text-crit"}>{check.txt ? "found" : "missing"}</span>}
                    </span>
                    <CopyValue label="TXT name" value={status.records.txt.host} />
                    <CopyValue label="TXT value" value={status.records.txt.value} />
                  </div>
                </dl>
              )}
              <div className="flex flex-wrap gap-2">
                {status.status !== "verified" && (
                  <button type="button" className={primary} onClick={() => void verify()} disabled={busy !== null}>
                    {busy === "verify" ? "Checking DNS…" : "Check DNS records"}
                  </button>
                )}
                <button type="button" className={secondary} onClick={() => void remove()} disabled={busy !== null}>
                  Remove domain
                </button>
              </div>
            </div>
          )}

          {!status?.domain && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="customDomain" className="text-sm font-medium text-ink">
                Portal domain
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="customDomain"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="reports.youragency.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void save();
                    }
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "custom-domain-error" : "custom-domain-hint"}
                  className="h-10 min-w-[14rem] flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button type="button" className={primary} onClick={() => void save()} disabled={busy !== null || !domain.trim()}>
                  {busy === "save" ? "Saving…" : "Use this domain"}
                </button>
              </div>
              <p id="custom-domain-hint" className="m-0 text-xs text-muted">
                Use a subdomain you control. Only the organisation owner can change it.
              </p>
            </div>
          )}

          {error && (
            <p id="custom-domain-error" role="alert" className="m-0 text-sm text-crit">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
