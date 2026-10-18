import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export const metadata: Metadata = {
  title: "Scan history",
  description: "Accessibility scan history and comparisons",
};

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const { org, site } = await params;
  return <SiteWorkspace startTab={2} orgSlug={org} siteId={site} />;
}
