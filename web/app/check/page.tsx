import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { FreeCheckFlow } from "@/components/marketing/free-check-flow";

export const metadata: Metadata = {
  title: "Free Website Accessibility Checker (WCAG 2.2 AA) | Plainsight",
  description:
    "Test any public website against WCAG 2.2 AA accessibility standards in 30 seconds. Free automated audit, severity scores, and plain-English fix guides.",
  openGraph: {
    title: "Free Website Accessibility Checker | Plainsight",
    description: "Scan your storefront or digital product against WCAG 2.2 AA standards in 30 seconds.",
    type: "website",
  },
};

export default function CheckPage() {
  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />
      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <Suspense fallback={<div className="p-8 text-center text-muted">Loading checker...</div>}>
          <FreeCheckFlow />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  );
}
