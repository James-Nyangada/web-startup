import { SITE, absoluteUrl, plainText } from "@/lib/seo";

/**
 * schema.org structured data. Only mark up what is visible on the page.
 * Validate changes at https://search.google.com/test/rich-results after deploying.
 */
function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // Escape "<" so CMS text can never close the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const ORG_ID = `${SITE.url}/#org`;

/** Site-wide: who publishes the site. Rendered once, in the root layout. */
export function OrganizationJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": ORG_ID,
            name: SITE.name,
            url: SITE.url,
            logo: `${SITE.url}/apple-icon.png`,
            // Add real profile URLs (LinkedIn, Shopify App Store, WordPress.org) as they exist.
            sameAs: [],
          },
          {
            "@type": "WebSite",
            "@id": `${SITE.url}/#website`,
            url: SITE.url,
            name: SITE.name,
            publisher: { "@id": ORG_ID },
          },
        ],
      }}
    />
  );
}

/** The product, with its starting price. Home and pricing pages. */
export function SoftwareAppJsonLd({ lowPrice, currency = "USD" }: { lowPrice: number; currency?: string }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE.name,
        url: SITE.url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: SITE.defaultDescription,
        offers: { "@type": "AggregateOffer", lowPrice: String(lowPrice), priceCurrency: currency, url: absoluteUrl("/pricing") },
        publisher: { "@id": ORG_ID },
        // aggregateRating: only once there are real, verifiable reviews.
      }}
    />
  );
}

export function FaqJsonLd({ items }: { items: { q: string; a: string }[] }) {
  if (items.length === 0) return null;
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((i) => ({
          "@type": "Question",
          name: i.q,
          acceptedAnswer: { "@type": "Answer", text: plainText(i.a) },
        })),
      }}
    />
  );
}

/** Mirrors a visible breadcrumb trail. The last item is the current page. */
export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: it.name,
          item: absoluteUrl(it.path),
        })),
      }}
    />
  );
}

export function ArticleJsonLd(p: {
  type?: "BlogPosting" | "TechArticle";
  title: string;
  description: string;
  path: string;
  datePublished?: string | null;
  dateModified?: string | null;
  image?: string | null;
  authorName?: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": p.type ?? "BlogPosting",
        headline: p.title,
        description: p.description,
        ...(p.datePublished && { datePublished: p.datePublished }),
        ...((p.dateModified ?? p.datePublished) && { dateModified: p.dateModified ?? p.datePublished }),
        mainEntityOfPage: absoluteUrl(p.path),
        image: p.image ?? `${SITE.url}/opengraph-image.png`,
        author: p.authorName ? { "@type": "Person", name: p.authorName } : { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
      }}
    />
  );
}
