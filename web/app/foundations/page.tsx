import type { Metadata } from "next";
import { Foundations } from "@/components/foundations/foundations";

// Internal design-system reference, not a marketing page.
export const metadata: Metadata = { title: "Foundations", robots: { index: false, follow: false } };

export default function Page() {
  return <Foundations />;
}
