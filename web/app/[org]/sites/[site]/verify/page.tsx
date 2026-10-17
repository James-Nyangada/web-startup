"use client";

import React, { use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { VerifySiteDialog } from "@/components/sites/verify-site-dialog";

export default function SiteVerifyPage({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const resolvedParams = use(params);
  const siteSlug = resolvedParams.site;
  const orgSlug = resolvedParams.org;

  const mockSite = {
    id: "site-" + siteSlug,
    name: siteSlug.charAt(0).toUpperCase() + siteSlug.slice(1),
    rootUrl: `https://${siteSlug}.com`,
    verifyToken: `ps_token_${siteSlug}`,
    platform: "shopify",
    status: "pending_verification",
  };

  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Sites", href: "/sites" },
        { label: mockSite.name, href: `/sites/${siteSlug}` },
        { label: "Verify Ownership" },
      ]}
    >
      <div style={{ maxWidth: "640px", margin: "40px auto", padding: "0 16px" }}>
        <div style={{ marginBottom: "20px" }}>
          <Link
            href={`/sites/${siteSlug}`}
            style={{
              fontSize: "13px",
              color: "var(--muted, #476788)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ← Back to Site Overview
          </Link>
        </div>

        {/* Embedded Card using the VerifySiteDialog component directly */}
        <VerifySiteDialog
          open={true}
          onClose={() => {
            window.location.href = `/sites/${siteSlug}`;
          }}
          site={mockSite}
          onVerified={() => {
            window.location.href = `/sites/${siteSlug}`;
          }}
        />
      </div>
    </AppShell>
  );
}
