"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/shell/toast-context";
import { MAINTENANCE_EVENT, SESSION_EXPIRED_EVENT } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { lastKnownEmail, resetCurrentUser } from "@/lib/use-current-user";

const AUTH_PAGES = ["/sign-in", "/sign-up", "/magic", "/forgot-password", "/reset-password", "/verify-email", "/maintenance"];

/** S-80: tells people when they lose their connection, and when it comes back. */
function OfflineNotice() {
  const { showToast, dismissToast } = useToast();
  const offlineToast = useRef<string | null>(null);

  useEffect(() => {
    const offline = () => {
      if (offlineToast.current) return;
      offlineToast.current = showToast("You’re offline. Changes won’t save until your connection comes back.", {
        type: "warning",
        duration: 0,
      });
    };
    const online = () => {
      if (!offlineToast.current) return;
      dismissToast(offlineToast.current);
      offlineToast.current = null;
      showToast("You’re back online.", { type: "success" });
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [showToast, dismissToast]);

  return null;
}

/** S-80: if the API reports maintenance, show the maintenance page. */
function MaintenanceRedirect() {
  const router = useRouter();
  useEffect(() => {
    const go = () => router.replace("/maintenance");
    window.addEventListener(MAINTENANCE_EVENT, go);
    return () => window.removeEventListener(MAINTENANCE_EVENT, go);
  }, [router]);
  return null;
}

/**
 * S-80 session expired: a sign-in dialog over the current page, so unsaved form input stays
 * where it is. After signing in, the person retries what they were doing.
 */
function ReauthDialog() {
  const pathname = usePathname();
  const { showToast } = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onExpired = () => {
      if (AUTH_PAGES.some((p) => pathname?.startsWith(p))) return;
      setOpen(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setEmail((e) => e || lastKnownEmail());
      setPassword("");
      setError(null);
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authClient.signIn({ email: email.trim(), password });
      resetCurrentUser();
      setOpen(false);
      showToast("You’re signed in again. Your changes are still on the page: save them now.", { type: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That email and password did not match.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ease-ui";

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      aria-labelledby="reauth-title"
      aria-describedby="reauth-desc"
      className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-dialog"
    >
      <form onSubmit={submit} className="flex flex-col gap-5 p-6 sm:p-7" noValidate>
        <div className="flex flex-col items-center text-center">
          <span aria-hidden className="mb-4 grid size-12 place-items-center rounded-full bg-primary-soft text-ptext">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <h2 id="reauth-title" className="m-0 text-lg font-semibold">
            Your session has ended
          </h2>
          <p id="reauth-desc" className="m-0 mt-1.5 max-w-[22rem] text-sm text-muted">
            Sign in again to carry on. Anything you typed on this page is kept.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="reauth-email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="reauth-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="reauth-password" className="mb-1.5 block text-sm font-medium">
              Password
            </label>
            <input
              id="reauth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reauth-error" : undefined}
              autoFocus
              className={`${inputClass} ${error ? "border-crit" : ""}`}
            />
          </div>
          {error && (
            <p id="reauth-error" role="alert" className="m-0 rounded-lg bg-crit-soft px-3 py-2 text-sm font-medium text-crit">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="ease-ui w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ease-ui w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:bg-subtle hover:text-ink"
          >
            Not now
          </button>
        </div>
        <p className="m-0 border-t border-line pt-4 text-center text-sm text-muted">
          Signed in another way?{" "}
          <a href="/sign-in" target="_blank" rel="noopener" className="font-semibold">
            Use another method
            <span className="sr-only"> (opens a new tab)</span>
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-1 inline-block align-[-1px]">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        </p>
      </form>
    </dialog>
  );
}

/** App-wide listeners for the S-80 edge states. Mounted once in the root layout. */
export function EdgeListeners() {
  return (
    <>
      <OfflineNotice />
      <MaintenanceRedirect />
      <ReauthDialog />
    </>
  );
}
