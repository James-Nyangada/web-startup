"use client";

import React, { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Renders nothing until the API confirms a live session, so a signed-out visitor (or someone
 * pressing Back after signing out) never sees a flash of account content. The proxy blocks
 * requests without a session cookie; this covers an expired or revoked cookie, and pages
 * restored from the back/forward cache.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const toSignIn = () => {
      setOk(false);
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/sign-in?redirect=${encodeURIComponent(here)}`);
    };
    const check = () => {
      authClient
        .getMe()
        .then(() => {
          if (!cancelled) setOk(true);
        })
        .catch((err: { status?: number }) => {
          // Only an auth failure ends the visit; a network blip keeps what is shown.
          if (!cancelled && err?.status === 401) toSignIn();
        });
    };
    check();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setOk(false);
        check();
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  if (!ok) return <div className="min-h-screen bg-page" aria-busy="true" />;
  return <>{children}</>;
}
