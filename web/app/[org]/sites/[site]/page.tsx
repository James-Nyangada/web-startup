import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);
  return {
    title: `${siteName} · Overview · Plainsight`,
    description: "Site accessibility overview and score trend",
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; site: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org, site } = await params;
  const { tab } = await searchParams;

  const siteName = site.charAt(0).toUpperCase() + site.slice(1);

  return (
    <SiteWorkspace
      startTab={tab === "issues" ? 1 : 0}
      orgSlug={org}
      siteSlug={site}
      siteName={siteName}
    />
  );
}
