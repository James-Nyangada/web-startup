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

/** Fired on `window` after a profile photo or organisation logo changes, so the shell refetches. */
export const PROFILE_UPDATED_EVENT = "everyvisitor:profile-updated";

/** Drop the cached user and tell mounted shell components (menu, org switcher) to reload. */
export function notifyProfileUpdated() {
  pending = null;
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

/** The signed-in user, loaded once per page load and shared by the shell components. */
export function useCurrentUser() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      pending ??= authClient.getMe();
      pending
        .then((res) => {
          lastEmail = res.user.email;
          if (!cancelled) setMe(res);
        })
        .catch(() => {
          pending = null;
        });
    };
    load();
    window.addEventListener(PROFILE_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_UPDATED_EVENT, load);
    };
  }, []);

  const name = me?.user.name || me?.user.email || "";
  const role = me?.memberships.find((m) => m.orgId === me.activeOrg?.id)?.role;
  return {
    me,
    name,
    email: me?.user.email ?? "",
    initials: initials(name) ?? "",
    avatarUrl: me?.user.avatarUrl ?? null,
    role: role ? role.charAt(0).toUpperCase() + role.slice(1) : "",
  };
}

/** Forget the cached user, e.g. after signing out. */
export function resetCurrentUser() {
  pending = null;
}
