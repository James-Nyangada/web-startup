import type { Metadata } from "next";
import { PortalSite } from "@/components/portal/portal";

export const metadata: Metadata = { title: "Website details" };

export default async function Page({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  return <PortalSite siteId={site} />;
}
