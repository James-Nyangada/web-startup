import type { Metadata } from "next";
import { HomePage } from "@/components/home/home-page";
import { FaqJsonLd, SoftwareAppJsonLd } from "@/components/seo/json-ld";
import { loadHomeContent } from "@/lib/home-content";
import { SITE, pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  ...pageMetadata({ title: SITE.defaultTitle, description: SITE.defaultDescription, path: "/" }),
  title: { absolute: SITE.defaultTitle },
};

export default async function Page() {
  const content = await loadHomeContent();
  return (
    <>
      <HomePage content={content} />
      <SoftwareAppJsonLd lowPrice={29} />
      <FaqJsonLd items={content.faq} />
    </>
  );
}
