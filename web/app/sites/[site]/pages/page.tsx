import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);
  return {
    title: `${siteName} · Pages & Templates · Plainsight`,
    description: "Discovered pages grouped by template with pin management",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);

  return (
    <SiteWorkspace
      startTab={3}
      siteSlug={site}
      siteName={siteName}
    />
  );
}
