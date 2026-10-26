"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";
import { Icon, I } from "@/components/icons";
import { useActiveOrg } from "@/lib/use-active-org";
import { ApiException } from "@/lib/api";
import { orgSettingsApi, type ApiKey } from "@/lib/admin-api";

const field =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const primary =
  "ease-ui inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50";
const secondary =
  "ease-ui inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50";

function when(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

/** Shows a new key's secret once, with copy, until the user confirms they stored it. */
function SecretOnce({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-labelledby="secret-title"
      className="rounded-2xl border border-ok/40 bg-ok-soft p-5 outline-none"
    >
      <h2 id="secret-title" className="m-0 text-base font-semibold text-ink">
        Copy your new API key now
      </h2>
      <p className="m-0 mt-1 text-sm text-ink">
        This is the only time we show it. We store a hash, so we cannot show it again. If you lose it, revoke it and
        create a new one.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm">{secret}</code>
        <button
          type="button"
          className={secondary}
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
        >
          <Icon d={copied ? I.check : I.copy} size={16} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span role="status" className="sr-only">
        {copied ? "API key copied to clipboard" : ""}
      </span>
      <button type="button" className={`${primary} mt-4`} onClick={onDone}>
        I have stored it safely
      </button>
    </div>
  );
}

/** S-47: create and revoke public API keys (Agency Pro, owners only; P6-06). */
export default function ApiKeysSettingsPage() {
  const { showToast } = useToast();
  const { slug, role, org, loading: orgLoading } = useActiveOrg();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [name, setName] = useState("");
  const [canStartScans, setCanStartScans] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const isAgencyPro = org?.plan === "agency_pro";

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      setKeys(await orgSettingsApi.listApiKeys(slug));
      setState("ready");
    } catch (err) {
      setState(err instanceof ApiException && err.status === 403 ? "forbidden" : "error");
    }
  }, [slug]);

  useEffect(() => {
    if (slug) void load();
  }, [slug, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    if (!name.trim()) {
      setFormError("Give the key a name, such as the tool that will use it.");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const res = await orgSettingsApi.createApiKey(slug, name.trim(), canStartScans ? ["read", "scan:write"] : ["read"]);
      setSecret(res.secret);
      setName("");
      setCanStartScans(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "The key could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!slug || !window.confirm(`Revoke “${key.name}”? Anything using it stops working straight away.`)) return;
    setRevoking(key.id);
    try {
      await orgSettingsApi.revokeApiKey(slug, key.id);
      showToast(`Key “${key.name}” revoked.`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not revoke the key.", { type: "error" });
    } finally {
      setRevoking(null);
    }
  };

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <SettingsLayout
      title="API Keys"
      description="Read sites, scans and issues, and start scans, from your own tools with the public REST API."
    >
      <div className="flex max-w-4xl flex-col gap-6">
        {!orgLoading && role && role !== "owner" && (
          <p className="m-0 rounded-xl border border-line bg-subtle px-4 py-3 text-sm">
            Only the organisation owner can manage API keys.
          </p>
        )}

        {!orgLoading && role === "owner" && !isAgencyPro && (
          <div className="rounded-2xl border border-line bg-primary-soft p-5">
            <h2 className="m-0 text-base font-semibold text-ink">The API is part of Agency Pro</h2>
            <p className="m-0 mt-1 text-sm text-ink">
              Upgrade to connect your reporting tools, CI pipeline or client dashboards to EveryVisitor.
            </p>
            <Link href="/settings/billing" className={`${primary} mt-3 no-underline`}>
              See plans
            </Link>
          </div>
        )}

        {secret && <SecretOnce secret={secret} onDone={() => setSecret(null)} />}

        {role === "owner" && isAgencyPro && !secret && (
          <form onSubmit={create} className="rounded-2xl border border-line bg-surface p-5 shadow-card" noValidate>
            <h2 className="m-0 text-base font-semibold">Create a key</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <label htmlFor="key-name" className="mb-1 block text-sm font-semibold">
                  Name
                </label>
                <input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Looker Studio, GitHub Actions"
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={formError ? "key-error" : undefined}
                  className={field}
                />
              </div>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1 text-sm font-semibold">Access</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked disabled className="size-4" /> Read sites, scans and issues
                </label>
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={canStartScans}
                    onChange={(e) => setCanStartScans(e.target.checked)}
                    className="size-4"
                  />
                  Start scans
                </label>
              </fieldset>
            </div>
            {formError && (
              <p id="key-error" role="alert" className="m-0 mt-3 text-sm text-crit">
                {formError}
              </p>
            )}
            <button type="submit" className={`${primary} mt-4`} disabled={creating}>
              {creating ? "Creating…" : "Create key"}
            </button>
          </form>
        )}

        {(state === "ready" || state === "loading") && role === "owner" && (
          <section aria-labelledby="keys-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <h2 id="keys-title" className="m-0 border-b border-line px-5 py-3 text-base font-semibold">
              Active keys <span className="text-sm font-normal text-muted">({active.length})</span>
            </h2>
            {state === "loading" ? (
              <p role="status" className="m-0 px-5 py-4 text-sm text-muted">
                Loading keys…
              </p>
            ) : active.length === 0 ? (
              <p className="m-0 px-5 py-4 text-sm text-muted">No active keys.</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-line p-0">
                {active.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold">{k.name}</p>
                      <p className="m-0 text-xs text-muted">
                        <code className="font-mono">{k.prefix}…</code> · {k.scopes.includes("scan:write") ? "Read and start scans" : "Read only"} ·
                        created {when(k.createdAt)} · last used {when(k.lastUsedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={secondary}
                      disabled={revoking === k.id}
                      onClick={() => void revoke(k)}
                      aria-label={`Revoke ${k.name}`}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {revoked.length > 0 && (
          <details className="rounded-2xl border border-line bg-surface p-5">
            <summary className="cursor-pointer text-sm font-semibold">Revoked keys ({revoked.length})</summary>
            <ul className="m-0 mt-3 list-none p-0 text-sm text-muted">
              {revoked.map((k) => (
                <li key={k.id} className="py-1">
                  {k.name} <code className="font-mono">{k.prefix}…</code> · revoked {when(k.revokedAt)}
                </li>
              ))}
            </ul>
          </details>
        )}

        {state === "error" && (
          <p role="alert" className="m-0 text-sm text-crit">
            Keys could not load. Refresh the page to try again.
          </p>
        )}

        <section aria-labelledby="docs-title" className="rounded-2xl border border-line bg-subtle p-5 text-sm">
          <h2 id="docs-title" className="m-0 text-base font-semibold">
            Using the API
          </h2>
          <p className="m-0 mt-1">
            Send the key as <code className="font-mono">Authorization: Bearer psk_…</code>. Each key can make 60 requests a
            minute. Keep keys out of browser code and public repositories.
          </p>
          <Link href="/developers/api" className="mt-2 inline-block font-semibold">
            Read the API reference
          </Link>
        </section>
      </div>
    </SettingsLayout>
  );
}
