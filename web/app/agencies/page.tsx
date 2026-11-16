import { AgenciesView } from "@/components/marketing/agencies-view";
import { FaqJsonLd } from "@/components/seo/json-ld";
import { AGENCY_FAQS } from "@/lib/agencies-data";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Accessibility monitoring for web agencies",
  description:
    "Sell accessibility as a monthly care plan. Weekly WCAG 2.2 AA scans across up to 75 client sites, white-label reports, client portals and cross-site theme fixes.",
  path: "/agencies",
});

export default function AgenciesPage() {
  return (
    <>
      <AgenciesView />
      <FaqJsonLd items={AGENCY_FAQS} />
    </>
  );
}
