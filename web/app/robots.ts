import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * Signed-in app, auth flows and one-off result pages stay out of search. Sign-in and sign-up
 * are not listed: they carry a noindex tag instead, which crawlers can only see if allowed in.
 * The proxy also sends `X-Robots-Tag: noindex` on every signed-in route.
 */
const PRIVATE = [
  "/overview",
  "/sites/",
  "/*/sites/", // /{org}/sites/…
  "/tasks",
  "/reports",
  "/settings",
  "/onboarding",
  "/portal",
  "/staff",
  "/staff-invite/",
  "/invitations/",
  "/checkout",
  "/connect/",
  "/magic",
  "/verify-email",
  "/reset-password",
  "/forgot-password",
  "/check/", // free-check results (thin, one per URL); /check itself stays crawlable
  "/preview/",
  "/maintenance",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  // Set SEO_NOINDEX=true on staging/preview deployments so they never get indexed.
  if (process.env.SEO_NOINDEX === "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: "EveryVisitorBot", allow: "/" },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
