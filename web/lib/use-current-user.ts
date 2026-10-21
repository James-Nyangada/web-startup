"use client";

import { useEffect, useState } from "react";
import { authClient, type MeResponse } from "./auth-client";
import { initials } from "./app-api";

let pending: Promise<MeResponse> | null = null;
let lastEmail = "";

/** Email of the last signed-in user seen on this page, e.g. to prefill a re-auth dialog. */
export function lastKnownEmail(): string {
  return lastEmail;
}

/** The signed-in user, loaded once per page load and shared by the shell components. */
export function useCurrentUser() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    pending ??= authClient.getMe();
    let cancelled = false;
    pending
      .then((res) => {
        lastEmail = res.user.email;
        if (!cancelled) setMe(res);
      })
      .catch(() => {
        pending = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const name = me?.user.name || me?.user.email || "";
  const role = me?.memberships.find((m) => m.orgId === me.activeOrg?.id)?.role;
  return {
    me,
    name,
    email: me?.user.email ?? "",
    initials: initials(name) ?? "",
    role: role ? role.charAt(0).toUpperCase() + role.slice(1) : "",
  };
}

/** Forget the cached user, e.g. after signing out. */
export function resetCurrentUser() {
  pending = null;
}
