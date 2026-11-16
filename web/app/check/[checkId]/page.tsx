import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { FreeCheckFlow } from "@/components/marketing/free-check-flow";

export const metadata: Metadata = {
  title: "Accessibility Scan Results",
  description: "Automated WCAG 2.2 Level AA accessibility report.",
  robots: {
    index: false,
    follow: true,
  },
};

interface CheckResultPageProps {
  params: Promise<{ checkId: string }>;
}

export default async function CheckResultPage({ params }: CheckResultPageProps) {
  const { checkId } = await params;

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-between">
      <MarketingHeader />
      <main id="main-content" tabIndex={-1} className="outline-none flex-1">
        <FreeCheckFlow initialCheckId={checkId} />
      </main>
      <MarketingFooter />
    </div>
  );
}
