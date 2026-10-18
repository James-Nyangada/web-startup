import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme";
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

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://plainsight.io";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: "Plainsight — Accessibility monitoring for online stores", template: "%s · Plainsight" },
  description:
    "Weekly accessibility checks for Shopify and WordPress sites, plain-language fix guides, and a verifiable record of your compliance progress.",
  keywords: [
    "accessibility",
    "WCAG 2.2",
    "Shopify accessibility",
    "WordPress accessibility",
    "European Accessibility Act",
    "ADA compliance",
    "accessibility monitoring",
  ],
  authors: [{ name: "Plainsight" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "Plainsight",
    title: "Plainsight — Accessibility monitoring for online stores",
    description:
      "Weekly accessibility checks for Shopify and WordPress sites, plain-language fix guides, and a verifiable record of your compliance progress.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plainsight — Accessibility monitoring for online stores",
    description:
      "Weekly accessibility checks for Shopify and WordPress sites, plain-language fix guides, and a verifiable record of your compliance progress.",
  },
  robots: {
    index: true,
    follow: true,
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
