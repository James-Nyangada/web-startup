import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SitesList } from "@/components/sites/sites-list";

export const metadata: Metadata = {
  title: "Sites",
  description: "Monitored websites, scan schedules and accessibility scores.",
};

export default async function SitesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <AppShell active="sites" crumbs={[{ label: "Overview", href: `/${org}` }, { label: "Sites" }]}>
      <SitesList orgSlug={org} />
    </AppShell>
  );
}
