import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export const metadata: Metadata = {
  title: "Pages",
  description: "Pages and templates checked on this site",
};

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const { org, site } = await params;
  return <SiteWorkspace startTab={3} orgSlug={org} siteId={site} />;
}
