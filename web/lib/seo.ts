import type { Metadata } from "next";

/**
 * One place for the site's SEO constants, so titles, canonical URLs and structured data
 * never drift apart. Page titles get " · EveryVisitor" from the root layout's title
 * template, so pass the bare title (no brand) to `pageMetadata`.
 */
export const SITE = {
  name: "EveryVisitor",
  /** Canonical origin, no trailing slash. */
  url: (process.env.NEXT_PUBLIC_APP_URL || "https://everyvisitor.app").replace(/\/+$/, ""),
  locale: "en_US",
  defaultTitle: "EveryVisitor — Accessibility checks for any website, built for online stores",
  defaultDescription:
    "EveryVisitor finds accessibility problems on your website and shows you how to fix them, on Shopify, WordPress or custom code. Free check, no sign-up.",
};

/** Absolute URL for a site path ("/" → the bare origin). */
export function absoluteUrl(path: string): string {
  return `${SITE.url}${path === "/" ? "" : path}`;
}

interface PageSeo {
  /** Without the brand; the root template appends it. Aim for ≤ 60 characters. */
  title: string;
  /** 140–160 characters. */
  description: string;
  /** Site path such as "/pricing". Becomes the canonical URL (never carries a query string). */
  path: string;
  /** Overrides the canonical, e.g. for a post first published elsewhere. */
  canonical?: string;
  /** Leave unset to use the site-wide app/opengraph-image.png. */
  image?: string;
  noindex?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Full metadata for a public page. Next merges metadata shallowly, so a page that sets
 * `openGraph` itself loses the layout's siteName/locale/url; this always sets them all.
 */
export function pageMetadata(p: PageSeo): Metadata {
  const url = absoluteUrl(p.path);
  // A page's own openGraph replaces the root one, including app/opengraph-image.png, so
  // fall back to that file explicitly.
  const images = [p.image ? { url: p.image } : { url: "/opengraph-image.png", width: 1200, height: 630 }];
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: p.canonical ?? url },
    openGraph: {
      title: p.title,
      description: p.description,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      type: p.type ?? "website",
      images,
      ...(p.type === "article" && {
        ...(p.publishedTime && { publishedTime: p.publishedTime }),
        ...(p.modifiedTime && { modifiedTime: p.modifiedTime }),
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: p.title,
      description: p.description,
      images: images.map((i) => i.url),
    },
    ...(p.noindex && { robots: { index: false, follow: false } }),
  };
}

/** Plain text for structured data: drops the common Markdown marks used in FAQ answers. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
