import type { Metadata } from "next";
import { IssueDetailPage } from "@/components/site/issue-detail-page";

export const metadata: Metadata = {
  title: "Issue",
  description: "Issue detail, WCAG criteria, occurrence locations, and fix instructions",
};

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; site: string; issue: string }>;
}) {
  const { org, site, issue } = await params;
  return <IssueDetailPage issueId={issue} orgSlug={org} siteId={site} />;
}
