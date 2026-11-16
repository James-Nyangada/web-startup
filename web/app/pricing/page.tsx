import { PricingView } from "@/components/marketing/pricing-view";
import { FaqJsonLd, SoftwareAppJsonLd } from "@/components/seo/json-ld";
import { getPage } from "@/lib/cms";
import { loadFaq } from "@/lib/home-content";
import { PRICING_FAQS } from "@/lib/pricing-data";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Pricing: accessibility monitoring plans for stores and agencies",
  description:
    "Plans from $29 a month for one store up to 75 agency client sites. Weekly or daily WCAG 2.2 AA scans, fix guides and dated reports. 14-day free trial, no card needed.",
  path: "/pricing",
});

export default async function PricingPage() {
  const [copy, faqs] = await Promise.all([
    getPage<{ planDescriptions: Record<string, string>; mostPopularBadgePlan: string }>("pricing.copy"),
    loadFaq("pricing"),
  ]);
  const items = faqs ?? PRICING_FAQS;
  return (
    <>
      <PricingView copy={copy?.data ?? null} faqs={items} />
      <SoftwareAppJsonLd lowPrice={29} />
      <FaqJsonLd items={items} />
    </>
  );
}
