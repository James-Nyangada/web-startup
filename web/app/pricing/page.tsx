import { PricingView } from "@/components/marketing/pricing-view";
import { getPage } from "@/lib/cms";
import { loadFaq } from "@/lib/home-content";
import { PRICING_FAQS } from "@/lib/pricing-data";

export const revalidate = 300;

export default async function PricingPage() {
  const [copy, faqs] = await Promise.all([
    getPage<{ planDescriptions: Record<string, string>; mostPopularBadgePlan: string }>("pricing.copy"),
    loadFaq("pricing"),
  ]);
  return <PricingView copy={copy?.data ?? null} faqs={faqs ?? PRICING_FAQS} />;
}
