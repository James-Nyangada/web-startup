import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  const siteName = site === "oakhaus" ? "Oakhaus Furniture" : site.charAt(0).toUpperCase() + site.slice(1);
  return {
    title: `${siteName} · Scan History · Plainsight`,
    description: "Accessibility scan history, score trends, and diff comparisons",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string }>;
}) {
  const { org, site } = await params;
  const siteName = site === "oakhaus" ? "Oakhaus Furniture" : site.charAt(0).toUpperCase() + site.slice(1);

  return (
    <SiteWorkspace
      startTab={2}
      orgSlug={org}
      siteSlug={site}
      siteName={siteName}
    />
  );
}
