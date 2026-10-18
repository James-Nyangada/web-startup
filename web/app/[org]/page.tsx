import type { Metadata } from "next";
import { AgencyOverview } from "@/components/overview/agency-overview";

export const metadata: Metadata = { title: "Overview" };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <AgencyOverview orgSlug={org} />;
}
