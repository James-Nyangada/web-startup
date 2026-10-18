"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ApiException } from "@/lib/api";

/**
 * Sends org-less URLs (/overview, /sites/...) to the same page under the user's active org,
 * as spec 8.2 routes everything by `/[org]`. Signed-out users go to sign-in; users without an
 * organisation go to onboarding.
 */
export function OrgRedirect({ path = "" }: { path?: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    authClient
      .getMe()
      .then((me) => {
        const org = me.activeOrg ?? me.memberships[0]?.org;
        if (!org) {
          router.replace("/onboarding");
          return;
        }
        router.replace(`/${org.slug ?? org.id}${path}${window.location.search}`);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiException && err.status === 401) {
          const back = encodeURIComponent(window.location.pathname + window.location.search);
          router.replace(`/sign-in?redirect=${back}`);
        } else {
          setFailed(true);
        }
      });
  }, [router, path]);

  return (
    <main id="main" className="grid min-h-[50vh] place-items-center px-4 text-sm text-muted">
      <p role="status">{failed ? "We couldn’t load your account. Please refresh the page." : "Loading…"}</p>
    </main>
  );
}
