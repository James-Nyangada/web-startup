import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// HTTPS-only directives would break plain-http local and CI runs.
const isHttps = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
};
const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL) || "http://localhost:4000";
const umamiOrigin = origin(process.env.NEXT_PUBLIC_UMAMI_SRC) || "https://cloud.umami.is";

/**
 * Content Security Policy (spec 11.1, P6-10). Third parties: Paddle checkout, Cloudflare
 * Turnstile, Umami analytics. Scripts still allow 'unsafe-inline' because most pages are
 * statically rendered and cannot carry a per-request nonce; see docs/security/asvs-l1.md
 * (accepted risk R-1) for the plan to move the app to nonces.
 *
 * CSP_REPORT_ONLY=true sends Content-Security-Policy-Report-Only instead, for trying changes.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdn.paddle.com https://challenges.cloudflare.com ${umamiOrigin}`,
  "style-src 'self' 'unsafe-inline' https://cdn.paddle.com",
  `img-src 'self' data: blob: ${apiOrigin} https:`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://*.paddle.com https://challenges.cloudflare.com ${umamiOrigin}${isDev ? " ws:" : ""}`,
  "frame-src https://*.paddle.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ...(process.env.CSP_REPORT_URI ? [`report-uri ${process.env.CSP_REPORT_URI}`] : []),
].join("; ");

const securityHeaders = [
  {
    key: process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    value: csp,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

/**
 * Slug-change redirects made in the CMS (staff spec 3.2). Read when the server starts or the
 * site is built; if the API cannot be reached the site still starts, without them.
 */
async function cmsRedirects() {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  try {
    const res = await fetch(`${base}/v1/public/content/redirects`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: { fromPath: string; toPath: string; statusCode: number }[] };
    return body.data
      .filter((r) => r.fromPath.startsWith("/") && r.toPath.startsWith("/") && r.fromPath !== r.toPath)
      .map((r) => ({ source: r.fromPath, destination: r.toPath, permanent: r.statusCode === 301 }));
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  redirects: cmsRedirects,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
