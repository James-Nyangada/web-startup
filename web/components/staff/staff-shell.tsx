"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { ThemeIconToggle } from "@/components/theme";
import { ApiException } from "@/lib/api";
import { staffApi, type StaffSession } from "@/lib/admin-api";

export const MAIN_NAV = [
  { href: "/staff", label: "Dashboard", icon: I.monitor, exact: true },
  { href: "/staff/analytics/business", matchPrefix: "/staff/analytics", label: "Analytics", icon: I.globe },
  { href: "/staff/customers", matchPrefix: "/staff/customers", label: "Customers", icon: I.users },
  { href: "/staff/leads", matchPrefix: "/staff/leads", label: "Leads", icon: I.mail },
  { href: "/staff/content/posts", matchPrefix: ["/staff/content", "/staff/media", "/staff/banners"], label: "Content", icon: I.fileText },
  { href: "/staff/queues", matchPrefix: ["/staff/queues", "/staff/content-review", "/staff/flags", "/staff/settings", "/staff/members", "/staff/audit"], label: "System", icon: I.settings },
];

export const SUB_NAV: Record<string, { href: string; label: string }[]> = {
  analytics: [
    { href: "/staff/analytics/business", label: "Business" },
    { href: "/staff/analytics/traffic", label: "Website traffic" },
    { href: "/staff/analytics/product", label: "Product usage" },
    { href: "/staff/analytics/funnel", label: "Funnel & retention" },
  ],
  customers: [
    { href: "/staff/customers", label: "Directory & health" },
    { href: "/staff/orgs", label: "All organisations" },
  ],
  content: [
    { href: "/staff/content/posts", label: "Blog posts" },
    { href: "/staff/content/guides", label: "Fix guides" },
    { href: "/staff/content/changelog", label: "Changelog" },
    { href: "/staff/content/pages", label: "Site pages" },
    { href: "/staff/media", label: "Media library" },
    { href: "/staff/banners", label: "Banners" },
  ],
  system: [
    { href: "/staff/queues", label: "Queues" },
    { href: "/staff/content-review", label: "Content review" },
    { href: "/staff/flags", label: "Feature flags" },
    { href: "/staff/settings", label: "Site settings" },
    { href: "/staff/members", label: "Staff & roles" },
    { href: "/staff/audit", label: "Audit log" },
  ],
};

/* Shared styles for staff screens, matching the app's tokens. */
export const btn = {
  primary:
    "ease-ui inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50",
  secondary:
    "ease-ui inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50",
  danger:
    "ease-ui inline-flex items-center gap-2 rounded-full border border-crit/40 bg-surface px-3.5 py-1.5 text-sm font-semibold text-crit hover:bg-crit-soft disabled:opacity-50",
};
export const input =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
export const card = "rounded-2xl border border-line bg-surface p-5 shadow-card";
export const th = "px-4 py-3 text-left text-xs font-semibold text-muted";
export const td = "px-4 py-3 text-sm text-ink align-top";

const StaffContext = createContext<{ session: StaffSession; refresh: () => Promise<void> } | null>(null);

export function useStaffSession() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaffSession must be used inside StaffShell");
  return ctx;
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "-";
  const d = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

/** Step 1 or 2 of the second factor (P6-01): set up an authenticator, or enter a code. */
function TotpGate({ session, onDone }: { session: StaffSession; onDone: () => Promise<void> }) {
  const [enrolment, setEnrolment] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setEnrolment(await staffApi.enroll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start set-up.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (session.totpEnrolled) await staffApi.verify(code);
      else await staffApi.confirm(code);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const needsEnrolment = !session.totpEnrolled;

  return (
    <div className="mx-auto mt-16 w-full max-w-md px-4">
      <div className={card}>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-ptext">
            <Icon d={I.shield} size={20} />
          </span>
          <h1 className="m-0 text-xl font-semibold text-ink">
            {needsEnrolment ? "Set up two-step sign-in" : "Confirm it’s you"}
          </h1>
        </div>

        {needsEnrolment && !enrolment && (
          <>
            <p className="mb-4 text-sm text-muted">
              The staff area needs a code from an authenticator app (1Password, Google Authenticator, Authy) on top of your
              password. You will enter a code each time you open it, at most every 12 hours.
            </p>
            <button type="button" className={btn.primary} onClick={start} disabled={busy}>
              {busy ? "Starting…" : "Set up authenticator"}
            </button>
          </>
        )}

        {needsEnrolment && enrolment && (
          <div className="mb-4 flex flex-col gap-3 text-sm text-ink">
            <p className="m-0">
              Add an account in your authenticator app with this setup key, or open the link on the device that has the
              app.
            </p>
            <div>
              <span className="block text-xs font-semibold text-muted">Setup key</span>
              <code className="mt-1 block break-all rounded-lg border border-line bg-subtle px-3 py-2 font-mono text-sm tracking-wider">
                {enrolment.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
            </div>
            <a href={enrolment.otpauthUrl} className="text-sm font-semibold text-ptext">
              Open in authenticator app
            </a>
          </div>
        )}

        {(!needsEnrolment || enrolment) && (
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            {!needsEnrolment && (
              <p className="m-0 text-sm text-muted">Enter the 6-digit code from your authenticator app for {session.email}.</p>
            )}
            <label htmlFor="totp-code" className="text-sm font-semibold text-ink">
              6-digit code
            </label>
            <input
              id="totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "totp-error" : undefined}
              className={`${input} font-mono text-lg tracking-[0.3em]`}
              autoFocus
            />
            {error && (
              <p id="totp-error" role="alert" className="m-0 text-sm text-crit">
                {error}
              </p>
            )}
            <button type="submit" className={btn.primary} disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : needsEnrolment ? "Confirm and continue" : "Continue"}
            </button>
          </form>
        )}

        {needsEnrolment && !enrolment && error && (
          <p role="alert" className="mt-3 text-sm text-crit">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function StaffShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [state, setState] = useState<"loading" | "denied" | "ready" | "error">("loading");

  const refresh = useCallback(async () => {
    try {
      setSession(await staffApi.session());
      setState("ready");
    } catch (err) {
      setState(err instanceof ApiException && (err.status === 404 || err.status === 401) ? "denied" : "error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = `${title} · Staff · EveryVisitor`;
  }, [title]);

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-muted" role="status">
        Loading staff area…
      </div>
    );
  }

  if (state === "denied" || state === "error") {
    return (
      <main id="main" className="grid min-h-screen place-items-center bg-page px-4 text-center text-ink">
        <div>
          <h1 className="m-0 font-serif text-4xl font-normal">
            {state === "denied" ? "Page not found" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-muted">
            {state === "denied" ? "We could not find that page." : "The staff area could not load. Try again."}
          </p>
          <Link href="/" className="mt-4 inline-block font-semibold text-ptext">
            Go to the home page
          </Link>
        </div>
      </main>
    );
  }

  const s = session!;
  if (!s.verified) {
    return (
      <div className="min-h-screen bg-page">
        <main id="main">
          <TotpGate session={s} onDone={refresh} />
        </main>
      </div>
    );
  }

  return (
    <StaffContext.Provider value={{ session: s, refresh }}>
        <div className="min-h-screen bg-page text-ink antialiased">
          <a
            href="#main"
            className="sr-only z-50 rounded-full bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to content
          </a>
          <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-[1344px] items-center gap-3 px-4 sm:px-8">
              <span className="rounded-full bg-crit px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-on-primary">
                Staff
              </span>
              <span className="font-semibold">EveryVisitor admin</span>
              <span className="flex-1" />
              <span className="hidden text-sm text-muted sm:inline">{s.email}</span>
              <ThemeIconToggle />
            </div>
            <nav aria-label="Staff main navigation" className="mx-auto max-w-[1344px] overflow-x-auto px-4 sm:px-8">
              <ul className="m-0 flex list-none gap-1 p-0">
                {MAIN_NAV.map((n) => {
                  let on = false;
                  if (n.exact) {
                    on = pathname === n.href;
                  } else if (Array.isArray(n.matchPrefix)) {
                    on = n.matchPrefix.some((p) => pathname?.startsWith(p));
                  } else if (n.matchPrefix) {
                    on = pathname?.startsWith(n.matchPrefix);
                  } else {
                    on = pathname?.startsWith(n.href);
                  }

                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={on ? "page" : undefined}
                        className={`ease-ui flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm no-underline ${
                          on ? "border-primary font-semibold text-ptext" : "border-transparent text-muted hover:text-ink"
                        }`}
                      >
                        <Icon d={n.icon} size={16} />
                        {n.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Sub-navigation bar when in a module */}
            {(() => {
              let activeSubKey: keyof typeof SUB_NAV | null = null;
              if (pathname?.startsWith("/staff/analytics")) activeSubKey = "analytics";
              else if (pathname?.startsWith("/staff/customers") || pathname?.startsWith("/staff/orgs")) activeSubKey = "customers";
              else if (pathname?.startsWith("/staff/content") || pathname?.startsWith("/staff/media") || pathname?.startsWith("/staff/banners")) activeSubKey = "content";
              else if (
                pathname?.startsWith("/staff/queues") ||
                pathname?.startsWith("/staff/content-review") ||
                pathname?.startsWith("/staff/flags") ||
                pathname?.startsWith("/staff/settings") ||
                pathname?.startsWith("/staff/members") ||
                pathname?.startsWith("/staff/audit")
              )
                activeSubKey = "system";

              if (!activeSubKey || !SUB_NAV[activeSubKey]) return null;

              return (
                <div className="border-t border-line/60 bg-subtle/40">
                  <nav aria-label="Staff sub navigation" className="mx-auto max-w-[1344px] overflow-x-auto px-4 py-1.5 sm:px-8">
                    <ul className="m-0 flex list-none items-center gap-2 p-0">
                      {SUB_NAV[activeSubKey].map((sub) => {
                        const active = pathname === sub.href || (sub.href !== "/staff/customers" && pathname?.startsWith(sub.href));
                        return (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              aria-current={active ? "page" : undefined}
                              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? "bg-surface font-semibold text-primary shadow-xs border border-line"
                                  : "text-muted hover:text-ink hover:bg-surface/50"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </nav>
                </div>
              );
            })()}
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1344px] px-4 pb-16 pt-6 outline-none sm:px-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wider text-muted">Staff console</p>
                <h1 className="m-0 font-serif text-[32px] font-normal tracking-tight">{title}</h1>
              </div>
              {actions}
            </div>
            {children}
          </main>
        </div>
    </StaffContext.Provider>
  );
}

/** Small dialog used for reasoned staff actions (extend trial, override, impersonate). */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  children,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = React.useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setReason("");
      setError(null);
      el.showModal();
    } else if (!open && el.open) el.close();
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError("Give a reason of at least 3 characters. It is written to the customer’s audit log.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="reason-dialog-title"
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-dialog backdrop:bg-scrim/60"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6" noValidate>
        <h2 id="reason-dialog-title" className="m-0 text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="m-0 text-sm text-muted">{description}</p>}
        {children}
        <div>
          <label htmlFor="reason-input" className="mb-1 block text-sm font-semibold">
            Reason
          </label>
          <textarea
            id="reason-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "reason-error" : "reason-hint"}
            className={input}
          />
          <p id="reason-hint" className="mt-1 text-xs text-muted">
            Recorded in the audit log, which the organisation’s owners and admins can read.
          </p>
          {error && (
            <p id="reason-error" role="alert" className="mt-1 text-sm text-crit">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
