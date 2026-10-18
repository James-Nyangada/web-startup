import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export const metadata: Metadata = {
  title: "Reports",
  description: "Accessibility reports for this site",
};

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const { org, site } = await params;
  return <SiteWorkspace startTab={4} orgSlug={org} siteId={site} />;
}
