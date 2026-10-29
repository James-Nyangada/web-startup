import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/shell/toast-context";
import { EdgeListeners } from "@/components/shell/edge-listeners";
import { UtmCapture } from "@/components/shell/utm-capture";
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

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://everyvisitor.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: "EveryVisitor | Accessibility monitoring for online stores", template: "%s · EveryVisitor" },
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
  authors: [{ name: "EveryVisitor" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "EveryVisitor",
    title: "EveryVisitor | Accessibility monitoring for online stores",
    description:
      "Weekly accessibility checks for Shopify and WordPress sites, plain-language fix guides, and a verifiable record of your compliance progress.",
  },
  twitter: {
    card: "summary_large_image",
    title: "EveryVisitor | Accessibility monitoring for online stores",
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
        <ThemeProvider>
          {/* App-wide so pages can call useToast() above their shell (S-80 offline toast too). */}
          <ToastProvider>
            {children}
            <EdgeListeners />
            <UtmCapture />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
