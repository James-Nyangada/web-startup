import type { Metadata } from "next";
import { AgencyOverview } from "@/components/overview/agency-overview";

export const metadata: Metadata = { title: "Overview" };

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ orgType?: string; sites?: string; slug?: string }>;
}) {
  const params = await searchParams;
  const isStoreSingleSite =
    params?.orgType === "store" && (params?.sites === "1" || !params?.sites);
  return (
    <AgencyOverview
      isStoreSingleSite={isStoreSingleSite}
      storeSiteSlug={params?.slug ?? "oakhaus"}
    />
  );
}

