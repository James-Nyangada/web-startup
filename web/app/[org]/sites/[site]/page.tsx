import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export const metadata: Metadata = {
  title: "Overview",
  description: "Site accessibility overview and score trend",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; site: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org, site } = await params;
  const { tab } = await searchParams;
  return <SiteWorkspace startTab={tab === "issues" ? 1 : 0} orgSlug={org} siteId={site} />;
}
