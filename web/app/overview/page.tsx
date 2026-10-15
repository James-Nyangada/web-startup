import type { Metadata } from "next";
import { AgencyOverview } from "@/components/overview/agency-overview";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <AgencyOverview />;
}
