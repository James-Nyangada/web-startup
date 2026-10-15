import type { Metadata } from "next";
import { SiteWorkspace } from "@/components/site/site-workspace";

export const metadata: Metadata = { title: "Oakhaus Furniture" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <SiteWorkspace startTab={tab === "issues" ? 1 : 0} />;
}
