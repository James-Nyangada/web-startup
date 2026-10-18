import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://plainsight.io";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/agencies",
          "/for-agencies",
          "/fix",
          "/blog",
          "/blog/*",
          "/changelog",
          "/bot",
          "/legal/*",
          "/accessibility-notes",
        ],
        disallow: [
          "/overview",
          "/sites/*",
          "/[org]/*",
          "/settings/*",
          "/onboarding",
          "/invitations/*",
          "/tasks",
          "/portal/*",
          "/magic",
          "/verify-email",
          "/reset-password",
          "/forgot-password",
          "/api/*",
        ],
      },
      {
        userAgent: "PlainsightBot",
        allow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
