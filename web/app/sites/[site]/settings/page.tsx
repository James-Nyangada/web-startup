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
    title: `${siteName} · Site Settings · Plainsight`,
    description: "Site configuration, monitoring schedules, and path exclusions",
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
      startTab={8}
      siteSlug={site}
      siteName={siteName}
    />
  );
}
