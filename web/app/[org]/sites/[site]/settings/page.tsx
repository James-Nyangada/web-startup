import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export const metadata: Metadata = {
  title: "Site settings",
  description: "Scan schedule, pages and site settings",
};

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const { org, site } = await params;
  return <SiteWorkspace startTab={8} orgSlug={org} siteId={site} />;
}
