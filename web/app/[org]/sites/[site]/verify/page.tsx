"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { VerifySiteDialog } from "@/components/sites/verify-site-dialog";
import { appApi, type ApiSite } from "@/lib/app-api";

/** S-23 Verification as a page (linked from the site header and onboarding). */
export default function SiteVerifyPage({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const { org, site: siteId } = use(params);
  const router = useRouter();
  const [site, setSite] = useState<ApiSite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteHref = `/${org}/sites/${siteId}`;

  useEffect(() => {
    appApi
      .getSite(org, siteId)
      .then((d) => setSite(d.site))
      .catch(() => setError("This site doesn’t exist or you don’t have access to it."));
  }, [org, siteId]);

  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Sites", href: `/${org}/sites` },
        { label: site?.name ?? "Site", href: siteHref },
        { label: "Verify ownership" },
      ]}
    >
      <div className="mx-auto my-10 max-w-[640px] px-4">
        <Link href={siteHref} className="text-sm text-muted no-underline hover:text-ink">
          ← Back to site overview
        </Link>
        {error && (
          <p role="alert" className="mt-6 text-sm text-crit">
            {error}
          </p>
        )}
        {site && (
          <VerifySiteDialog
            open={true}
            orgSlug={org}
            onClose={() => router.push(siteHref)}
            site={site}
            onVerified={() => router.push(siteHref)}
          />
        )}
      </div>
    </AppShell>
  );
}
