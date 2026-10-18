import type { Metadata } from "next";
import { IssueDetailPage } from "@/components/site/issue-detail-page";
import { ISSUES } from "@/lib/site-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; site: string; issue: string }>;
}): Promise<Metadata> {
  const { site, issue: issueId } = await params;
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);
  const found = ISSUES.find((i) => i.id === issueId);
  const title = found ? found.title : "Issue Detail";

  return {
    title: `${title} · ${siteName} · Plainsight`,
    description: "Issue detail, WCAG criteria, occurrence locations, and fix instructions",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string; issue: string }>;
}) {
  const { org, site, issue } = await params;
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);

  return (
    <IssueDetailPage
      issueId={issue}
      orgSlug={org}
      siteSlug={site}
      siteName={siteName}
    />
  );
}
