import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/shell/toast-context";
import { EdgeListeners } from "@/components/shell/edge-listeners";
import { UtmCapture } from "@/components/shell/utm-capture";
import { OrganizationJsonLd } from "@/components/seo/json-ld";
import { SITE } from "@/lib/seo";
import "./globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.defaultTitle, template: "%s · EveryVisitor" },
  description: SITE.defaultDescription,
  applicationName: SITE.name,
  // No canonical here: it would be inherited by every page that doesn't set its own.
  alternates: {
    types: { "application/rss+xml": [{ url: "/blog/rss.xml", title: "EveryVisitor blog" }] },
  },
  // Search Console / Bing Webmaster tokens, if verifying by meta tag rather than DNS.
  ...((process.env.GOOGLE_SITE_VERIFICATION || process.env.BING_SITE_VERIFICATION) && {
    verification: {
      ...(process.env.GOOGLE_SITE_VERIFICATION && { google: process.env.GOOGLE_SITE_VERIFICATION }),
      ...(process.env.BING_SITE_VERIFICATION && { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }),
    },
  }),
  keywords: [
    "accessibility",
    "WCAG 2.2",
    "website accessibility checker",
    "WCAG checker for custom websites",
    "accessibility checker for React sites",
    "accessibility audit for company websites",
    "Shopify accessibility",
    "WordPress accessibility",
    "European Accessibility Act",
    "ADA accessibility",
    "accessibility monitoring",
  ],
  authors: [{ name: "EveryVisitor" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint: applies the saved theme (or the OS theme) and marks JS as available,
// so GSAP-revealed content can start hidden without a flash.
const bootScript = `(function(){try{var d=document.documentElement;d.classList.add('js');var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.setAttribute('data-theme',t)}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <script
            defer
            src={process.env.NEXT_PUBLIC_UMAMI_SRC || "https://cloud.umami.is/script.js"}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            data-do-not-track="true"
          />
        )}
      </head>
      <body>
        <ThemeProvider>
          {/* App-wide so pages can call useToast() above their shell (S-80 offline toast too). */}
          <ToastProvider>
            {children}
            <EdgeListeners />
            <UtmCapture />
          </ToastProvider>
        </ThemeProvider>
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
