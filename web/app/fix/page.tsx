import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { FixGuidesIndex } from "@/components/marketing/fix-guides-index";
import { loadGuides } from "@/lib/guide-source";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Accessibility fix guides for Shopify, WordPress and custom code",
  description: "Step-by-step fixes for the accessibility problems found most often on websites: Shopify, WordPress, or custom code with HTML, CSS, React and Vue examples.",
  path: "/fix",
});

export default async function FixGuidesIndexPage() {
  return <FixGuidesIndex allGuides={await loadGuides()} />;
}
