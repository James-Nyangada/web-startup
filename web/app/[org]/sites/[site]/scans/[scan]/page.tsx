import React from "react";
import type { Metadata } from "next";
import { ScanDetailView } from "@/components/scan/scan-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; site: string; scan: string }>;
}): Promise<Metadata> {
  const { scan } = await params;
  const shortId = scan.slice(0, 8);
  return {
    title: `Scan #${shortId} · Plainsight`,
    description: "Live accessibility scan progress and details",
  };
}

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ org: string; site: string; scan: string }>;
}) {
  const { org, site, scan } = await params;
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);

  return (
    <ScanDetailView
      orgSlug={org}
      siteSlug={site}
      scanId={scan}
      siteName={siteName}
      rootUrl={`https://${site}.com`}
    />
  );
}
