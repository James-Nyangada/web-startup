"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, type OrganizationSummary } from "@/lib/auth-client";
import { apiClient, ApiException } from "@/lib/api";
import { Icon, I } from "@/components/icons";
import { validateReturnUrl } from "@/lib/connect-return-url";

interface ConnectStartParams {
  url?: string;
  name?: string;
  platform?: string;
  return_url?: string;
  state?: string;
}

export default function ConnectStartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const router = useRouter();
  const rawParams = use(searchParams);

  const url = typeof rawParams.url === "string" ? rawParams.url : "";
  const name = typeof rawParams.name === "string" ? rawParams.name : "";
  const platform = typeof rawParams.platform === "string" ? rawParams.platform : "wordpress";
  const returnUrl = typeof rawParams.return_url === "string" ? rawParams.return_url : "";
  const state = typeof rawParams.state === "string" ? rawParams.state : "";

  const returnUrlValidation = validateReturnUrl(returnUrl, url, platform);

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(
    returnUrl && !returnUrlValidation.valid ? `Invalid return URL: ${returnUrlValidation.reason}` : null,
  );
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [user, setUser] = useState<{ id: string; email: string; name?: string } | null>(null);
  const [successRedirectUrl, setSuccessRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authClient
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me.user);
        const orgList = me.memberships.map((m) => m.org);
        setOrgs(orgList);
        if (orgList.length > 0) {
          setSelectedOrgId(me.activeOrg?.id || orgList[0]!.id);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthorize = async () => {
    if (!selectedOrgId || !url) return;

    if (returnUrl) {
      const validation = validateReturnUrl(returnUrl, url, platform);
      if (!validation.valid) {
        setError(`Untrusted return URL blocked: ${validation.reason}`);
        return;
      }
    }

    setConnecting(true);
    setError(null);

    try {
      // apiClient already unwraps the `{ data }` envelope.
      const res = await apiClient<{
        ok: boolean;
        verified: boolean;
        site: { id: string; name: string };
        code?: string;
        apiKey?: { secret: string };
      }>(`/v1/orgs/${selectedOrgId}/sites/connect`, {
        method: "POST",
        body: JSON.stringify({
          url,
          name: name || undefined,
          platform: platform === "shopify" ? "shopify" : "wordpress",
          issueKey: true,
        }),
      });

      const siteId = res.site?.id;
      const code = res.code;

      if (!siteId) {
        setConnecting(false);
        setError("EveryVisitor did not return the connected site. Please try again.");
        return;
      }

      if (returnUrl) {
        const parsed = new URL(returnUrl);
        parsed.searchParams.set("everyvisitor_connected", "1");
        if (code) {
          parsed.searchParams.set("code", code);
        }
        parsed.searchParams.set("site_id", siteId);
        if (state) parsed.searchParams.set("state", state);

        const targetUrl = parsed.toString();
        setSuccessRedirectUrl(targetUrl);
        window.location.href = targetUrl;
      } else {
        router.push(`/sites/${siteId}`);
      }
    } catch (err: unknown) {
      setConnecting(false);
      setError(err instanceof ApiException ? err.message : "Failed to connect site.");
    }
  };

  // Same-site path only: sign-in/up send the user back here after authenticating.
  const signInReturnTo = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/connect/start";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-surface">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="size-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          <span>Verifying authentication…</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-surface">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary mb-4">
            <Icon d={I.globe} size={24} />
          </div>
          <h1 className="text-xl font-bold text-ink">Sign in to EveryVisitor</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to connect <strong>{name || url || "your website"}</strong> for automated WCAG accessibility monitoring.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={`/sign-in?redirect=${encodeURIComponent(signInReturnTo)}`}
              className="ease-ui flex h-10 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary hover:bg-primary-hover no-underline"
            >
              Sign In
            </Link>
            <Link
              href={`/sign-up?redirect=${encodeURIComponent(signInReturnTo)}`}
              className="ease-ui flex h-10 w-full items-center justify-center rounded-full border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-subtle no-underline"
            >
              Create Account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (successRedirectUrl) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-surface">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok mb-4">
            <Icon d={I.fixed} size={24} />
          </div>
          <h1 className="text-xl font-bold text-ink">Connected Successfully!</h1>
          <p className="mt-2 text-sm text-muted">
            Returning you to {platform === "shopify" ? "Shopify" : "WordPress"}…
          </p>
          <a
            href={successRedirectUrl}
            className="ease-ui mt-6 inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover no-underline"
          >
            Click here if not redirected automatically
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card">
        <div className="flex items-center gap-3 border-b border-line pb-5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-on-primary font-bold">
            EV
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-5 text-ink truncate">
              Connect to EveryVisitor
            </h1>
            <p className="text-xs text-muted truncate">Signed in as {user.email}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-subtle p-4">
            <div className="text-xs font-semibold uppercase text-muted tracking-wider">
              Site to Connect
            </div>
            <div className="mt-1 text-base font-semibold text-ink truncate">
              {name || url || "Website"}
            </div>
            <div className="text-xs font-mono text-muted truncate mt-0.5">{url}</div>
          </div>

          <div>
            <label htmlFor="org-select" className="text-sm font-semibold text-ink block mb-1.5">
              Select Organization
            </label>
            {orgs.length > 1 ? (
              <select
                id="org-select"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink font-medium"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.plan})
                  </option>
                ))}
              </select>
            ) : orgs.length === 1 ? (
              <div className="rounded-lg border border-line bg-surface p-3 text-sm font-medium text-ink">
                {orgs[0]?.name} <span className="text-xs text-muted">({orgs[0]?.plan})</span>
              </div>
            ) : (
              <p className="text-sm text-muted">No organizations found.</p>
            )}
          </div>

          <div className="rounded-lg bg-primary-soft p-3 text-xs leading-5 text-ptext">
            <strong>Automatic Verification:</strong> Connecting issues a site-scoped API key and marks your site verified. No meta tags or DNS records needed.
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-err-soft p-3 text-sm text-err">
              {error}
            </div>
          )}

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={handleAuthorize}
              disabled={connecting || !selectedOrgId || !url || (returnUrl ? !returnUrlValidation.valid : false)}
              className="ease-ui flex-1 flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {connecting && (
                <span className="size-3.5 animate-spin rounded-full border-2 border-on-primary border-r-transparent" />
              )}
              {connecting ? "Connecting…" : "Authorize & Connect"}
            </button>
            <Link
              href={returnUrl && returnUrlValidation.valid ? returnUrl : "/dashboard"}
              className="ease-ui flex h-10 items-center justify-center rounded-full border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-subtle no-underline"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
