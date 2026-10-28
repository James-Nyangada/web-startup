import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request (Next 16 `proxy`, formerly middleware).
 *
 * - MAINTENANCE_MODE=true (S-80, P6-12): every page shows /maintenance with a 503.
 * - docs.<domain> (P6-06): serves the public API reference.
 * - With CUSTOM_DOMAINS_ENABLED=true, any other host that is not ours is a verified custom
 *   portal domain (P6-07): Caddy only issues certificates for verified domains, so nothing
 *   else reaches us over HTTPS. Those hosts only ever see the client portal and sign-in pages.
 *   Off by default so a missing APP_HOSTS entry can never hide the main site.
 */

const PORTAL_ALLOWED = [
  /^\/portal(\/|$)/,
  /^\/sign-in/,
  /^\/magic/,
  /^\/forgot-password/,
  /^\/reset-password/,
  /^\/invitations\//,
  /^\/maintenance$/,
];

/** Pages that need an account. Signed-out requests never reach them (no HTML, no data). */
const PROTECTED = [
  /^\/overview(\/|$)/,
  /^\/sites(\/|$)/,
  /^\/tasks(\/|$)/,
  /^\/reports(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/staff(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/portal(\/|$)/,
  /^\/[^/]+\/sites(\/|$)/,
];

/** Better Auth session cookie, with the `__Secure-` prefix it adds over https. */
function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token")
  );
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function ownHosts(): Set<string> {
  const hosts = [
    hostOf(process.env.NEXT_PUBLIC_APP_URL),
    hostOf(process.env.NEXT_PUBLIC_SITE_URL),
    ...(process.env.APP_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()),
    "localhost:3000",
    "127.0.0.1:3000",
    "localhost",
  ];
  return new Set(hosts.filter((h): h is string => Boolean(h)));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").toLowerCase();

  if (process.env.MAINTENANCE_MODE === "true" || process.env.MAINTENANCE_MODE === "1") {
    if (pathname === "/maintenance") return NextResponse.next();
    const res = NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503 });
    res.headers.set("Retry-After", "600");
    return res;
  }

  const docsHost = process.env.DOCS_HOST?.toLowerCase();
  if (docsHost && host === docsHost) {
    if (pathname.startsWith("/developers")) return NextResponse.next();
    return NextResponse.rewrite(new URL(`/developers/api${pathname === "/" ? "" : pathname}`, request.url));
  }

  const customDomains = process.env.CUSTOM_DOMAINS_ENABLED === "true";
  if (customDomains && host && !ownHosts().has(host) && !host.endsWith(".localhost")) {
    // Custom portal domain: `/` and `/sites/…` map onto the portal; everything else is refused.
    if (pathname === "/") return NextResponse.rewrite(new URL("/portal", request.url));
    if (pathname.startsWith("/sites/")) return NextResponse.rewrite(new URL(`/portal${pathname}`, request.url));
    if (PORTAL_ALLOWED.some((re) => re.test(pathname))) return NextResponse.next();
    return NextResponse.rewrite(new URL("/not-found-page", request.url), { status: 404 });
  }

  if (PROTECTED.some((re) => re.test(pathname))) {
    if (!hasSessionCookie(request)) {
      const url = new URL("/sign-in", request.url);
      if (pathname !== "/") url.searchParams.set("redirect", pathname + request.nextUrl.search);
      const res = NextResponse.redirect(url);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    // Signed-in pages must not be kept in the browser cache or back/forward cache.
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Pages only: never static assets, images or metadata files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
