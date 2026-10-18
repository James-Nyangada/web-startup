import type { Metadata } from "next";
import { ScanDetailView } from "@/components/scan/scan-detail-view";

export const metadata: Metadata = {
  title: "Scan",
  description: "Live accessibility scan progress and details",
};

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ org: string; site: string; scan: string }>;
}) {
  const { org, site, scan } = await params;
  return <ScanDetailView orgSlug={org} siteSlug={site} scanId={scan} />;
}
