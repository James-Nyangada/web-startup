import type { Severity } from "./severity";

export const CHECK_STEPS = ["Loading page", "Running 92 automated checks", "Preparing results"];

export const RESULT_COUNTS: [Severity, number][] = [
  ["critical", 2],
  ["serious", 2],
  ["moderate", 1],
  ["minor", 1],
];

export const TOP_PROBLEMS: { sev: Severity; title: string; n: number; who: string }[] = [
  { sev: "critical", title: "Images are missing descriptions", n: 14, who: "People who use screen readers can’t tell what products look like." },
  { sev: "critical", title: "Buttons have no name screen readers can announce", n: 3, who: "Screen reader users can’t find the cart or menu." },
  { sev: "serious", title: "Text doesn’t have enough contrast", n: 22, who: "People with low vision struggle to read prices." },
  { sev: "serious", title: "Zooming is turned off on phones", n: 1, who: "People who need to zoom can’t enlarge the page." },
  { sev: "moderate", title: "Heading levels skip", n: 4, who: "Screen reader users may think content is missing." },
  { sev: "minor", title: "Embedded video has no title", n: 1, who: "Screen reader users hear only “frame”." },
];

export const FACTS = [
  { fact: "Online stores are the most common target of US accessibility lawsuits.", source: "Source: UsableNet, 2025 Year-End Digital Accessibility Lawsuit Report (about 70% e-commerce)" },
  { fact: "The European Accessibility Act has applied to e-commerce since 28 June 2025.", source: "Source: Directive (EU) 2019/882" },
  { fact: "Overlays don't fix the underlying code, and can make things worse.", source: "Source: US FTC, accessiBe final order, April 2025" },
];

export const HOW = [
  {
    n: "Step 1",
    t: "Scan",
    d: "We check your pages every week, 250 to 500 per scan depending on your plan, and group them by page type.",
    shot: "screenshot: scan progress",
    image: "/screenshots/scan-progress.png",
    imageLight: "/screenshots/scan-progress-light.png",
    imageDark: "/screenshots/scan-progress-dark.png",
    alt: "EveryVisitor scanning a website: 87 of 150 pages checked.",
  },
  {
    n: "Step 2",
    t: "Understand",
    d: "Problems in plain words, ranked by who they block.",
    shot: "screenshot: fix these first",
    image: "/screenshots/fix-these-first.png",
    imageLight: "/screenshots/fix-these-first-light.png",
    imageDark: "/screenshots/fix-these-first-dark.png",
    alt: "Site score of 72 with the top problems listed in plain language.",
  },
  {
    n: "Step 3",
    t: "Fix",
    d: "Step-by-step fixes for your platform: Shopify, WordPress, or your own code (HTML, React, Vue and more).",
    shot: "screenshot: fix guide",
    image: "/screenshots/fix-guide.png",
    imageLight: "/screenshots/fix-guide-light.png",
    imageDark: "/screenshots/fix-guide-dark.png",
    alt: "Step-by-step fix guide with the code to copy.",
  },
  {
    n: "Step 4",
    t: "Prove",
    d: "A dated record of scans, fixes and manual checks.",
    shot: "screenshot: evidence timeline",
    image: "/screenshots/evidence-timeline.png",
    imageLight: "/screenshots/evidence-timeline-light.png",
    imageDark: "/screenshots/evidence-timeline-dark.png",
    alt: "Dated record of fixes, scans and manual checks, with an evidence pack download.",
  },
];

export const COMPARE = [
  { q: "Changes your code", a: "No, adds a script on top", b: "Shows you exactly what to change" },
  { q: "Works with screen readers", a: "Often conflicts with them", b: "Fixes are in your real HTML" },
  { q: "Proof of effort", a: "None", b: "Evidence pack with dates" },
  { q: "Claims compliance", a: "Often", b: "Never, we’re honest about limits" },
];

export const PLANS = [
  { name: "Store", price: "$29", who: "One website: a store, company site or any public site", tag: "" },
  { name: "Growth", price: "$59", who: "Growing brands, 3 sites", tag: "" },
  { name: "Agency", price: "$149", who: "Up to 25 client sites, any platform", tag: "Most popular for agencies" },
  { name: "Agency Pro", price: "$299", who: "Up to 75 sites, custom domain", tag: "" },
];

/** Spec 3.4: shown on the home and pricing pages. */
export const PLATFORM_FAQ = [
  {
    q: "Does EveryVisitor only work with Shopify and WordPress?",
    a: "No. It works on any public website, including sites built with Wix, Webflow or Squarespace, and custom-coded sites built with React, Next.js, Vue, Angular, plain HTML, PHP, Laravel, Django and other technologies. Shopify and WordPress also get platform-specific instructions and plugins.",
  },
  {
    q: "My website isn't an online store. Is it still useful?",
    a: "Yes. Company websites, portfolios, blogs, booking sites and others have the same kinds of problems: unlabelled buttons, missing image descriptions, low-contrast text, forms that don't work with a keyboard. EveryVisitor is built especially for online stores, but checks any website the same way.",
  },
  {
    q: "How do fix guides work for a custom-coded website?",
    a: "For sites built with code, each problem comes with the change to make in your own code: the corrected HTML, the CSS change, or an example for common frameworks such as React and Vue. Pass it to your developer, or make the change yourself.",
  },
  {
    q: "Can EveryVisitor change my website automatically?",
    a: "No. EveryVisitor never adds scripts or widgets to your site. It finds problems and shows you, or your developer, exactly how to fix them, then checks again to confirm the fix worked.",
  },
  {
    q: "Can it check pages behind a login?",
    a: "Not yet. EveryVisitor checks the public pages of your website.",
  },
];

export const FAQ = [
  {
    q: "Will this make my site compliant?",
    a: "No tool can make a site compliant on its own. Automated checks find part of the problems; the rest needs people to test. We help you find, fix and record your work, which is what reduces risk.",
  },
  { q: "Do I need to install anything?", a: "No. We check your site from the outside, like a visitor. Nothing is added to your pages." },
  ...PLATFORM_FAQ,
];

/** Spec 3.2: "Works with how your site is built". The first card is highlighted as "Best for". */
export const BUILT_WITH = [
  {
    title: "Online stores",
    badge: "Best for",
    text: "Product pages, cart and checkout get extra attention, because that's where problems cost you sales.",
  },
  {
    title: "Website builders",
    badge: "",
    text: "Shopify, WordPress, WooCommerce, Wix, Webflow, Squarespace. Fix guides tell you exactly which setting or theme file to change.",
  },
  {
    title: "Custom-coded sites",
    badge: "",
    text: "Built with React, Next.js, Vue, Angular, plain HTML, PHP, Laravel, Django or another stack? You get the fix as code: the HTML, CSS or component change to make.",
  },
];

export const BUILT_WITH_NOTE =
  "Company websites, portfolios, blogs, booking sites and more work too. If it's a public website, EveryVisitor can check it.";

/** Spec 3.3: "Who it's for". */
export const AUDIENCES = [
  { who: "Online store owners", line: "Find what stops customers buying, and fix it first." },
  { who: "Agencies and freelancers", line: "Monitor every client site, whatever it's built with, and send reports under your brand." },
  { who: "Developers", line: "Get exact code-level fixes and a weekly check that catches regressions." },
  { who: "Companies and organisations", line: "Show your website works for everyone, with a dated record of your progress." },
];
