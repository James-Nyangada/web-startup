import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SitesList } from "@/components/sites/sites-list";

export const metadata: Metadata = {
  title: "Sites",
  description: "Monitored websites, automated accessibility schedules, and compliance scores.",
};

export default function SitesPage() {
  return (
    <AppShell
      active="sites"
      crumbs={[
        { label: "Brightline Studio", href: "/overview" },
        { label: "Sites" },
      ]}
    >
      <SitesList />
    </AppShell>
  );
}
