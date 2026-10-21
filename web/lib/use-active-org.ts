"use client";

import { useCurrentUser } from "./use-current-user";

/** The org the settings screens act on, and the signed-in user's role in it. */
export function useActiveOrg() {
  const { me } = useCurrentUser();
  const org = me?.activeOrg ?? null;
  const role = org ? (me?.memberships.find((m) => m.orgId === org.id)?.role ?? null) : null;
  return { loading: me === null, org, slug: org?.slug ?? org?.id ?? null, role };
}
