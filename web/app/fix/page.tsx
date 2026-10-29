import type { Metadata } from "next";
import { FixGuidesIndex } from "@/components/marketing/fix-guides-index";
import { loadGuides } from "@/lib/guide-source";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Accessibility fix guides for Shopify and WordPress",
  description: "Step-by-step fixes for the accessibility problems found most often on Shopify and WordPress stores.",
};

export default async function FixGuidesIndexPage() {
  return <FixGuidesIndex allGuides={await loadGuides()} />;
}
